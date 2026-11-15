const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");
const { createKaneParser } = require("./kane-parser");

const port = Number(process.env.PORT) || 3000;
const host = "127.0.0.1";
const kaneTimeoutMs = 5 * 60 * 1000;
const kaneObjective = "Enter SAVE10 in the discount code field and click Apply. Verify the total is $90.00. Click Place order and verify the order confirmation shows a final total of $90.00.";
const maxOutputLineLength = 1024 * 1024;
let kaneRunActive = false;

const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/dashboard": ["dashboard.html", "text/html; charset=utf-8"],
  "/dashboard.html": ["dashboard.html", "text/html; charset=utf-8"],
  "/dashboard.css": ["dashboard.css", "text/css; charset=utf-8"],
  "/dashboard.js": ["dashboard.js", "text/javascript; charset=utf-8"],
};

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function isLocalKaneRequest(request) {
  const address = request.socket.remoteAddress;
  const isLoopback = address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";

  if (!isLoopback || !request.headers.host || !request.headers.origin) return false;

  try {
    const origin = new URL(request.headers.origin);
    return origin.protocol === "http:"
      && origin.host === request.headers.host
      && (origin.hostname === "localhost" || origin.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function emitKaneEvent(response, event) {
  if (!response.writableEnded && !response.destroyed) {
    response.write(`${JSON.stringify(event)}\n`);
  }
}

function createKaneProcess() {
  const url = `http://${host}:${port}/`;
  const args = ["run", "--url", url, "--agent", "--headless", kaneObjective];

  if (process.platform === "win32") {
    const command = `kane-cli run --url ${url} --agent --headless '${kaneObjective}'`;
    return spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: __dirname,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
  }

  return spawn("kane-cli", args, {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function terminateKaneProcess(child, callback) {
  if (process.platform !== "win32" || !Number.isInteger(child.pid)) {
    const terminated = child.kill();
    callback(terminated);
    return;
  }

  const command = "$root=" + child.pid
    + "; $all=Get-CimInstance Win32_Process"
    + "; $ids=[System.Collections.Generic.List[int]]::new()"
    + "; $ids.Add($root)"
    + "; for($i=0;$i -lt $ids.Count;$i++){ $parent=$ids[$i]; foreach($process in $all){ if($process.ParentProcessId -eq $parent -and -not $ids.Contains([int]$process.ProcessId)){ [void]$ids.Add([int]$process.ProcessId) } } }"
    + "; for($i=$ids.Count-1;$i -ge 0;$i--){ if($ids[$i] -ne $PID){ try { Stop-Process -Id $ids[$i] -Force -ErrorAction Stop } catch { exit 1 } } }";
  let completed = false;
  let timer;
  let killer;

  function finish(terminated) {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    callback(terminated);
  }

  try {
    killer = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    child.kill();
    finish(false);
    return;
  }

  timer = setTimeout(() => {
    killer.kill();
    child.kill();
    finish(false);
  }, 10000);

  killer.on("error", () => {
    child.kill();
    finish(false);
  });
  killer.on("close", (exitCode) => {
    if (exitCode === 0) finish(true);
    else {
      child.kill();
      finish(false);
    }
  });
}

function runKane(response) {
  kaneRunActive = true;
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Accel-Buffering": "no",
  });
  emitKaneEvent(response, { type: "progress", state: "starting" });

  let child;
  const kaneParser = createKaneParser();
  let processError = false;
  let malformedOutput = false;
  let timedOut = false;
  let childClosed = false;
  let terminationFinished = false;
  let terminationSucceeded = false;
  let finalized = false;
  let pending = "";
  const decoder = new StringDecoder("utf8");
  let timeoutHandle;

  function finalize(outcome) {
    if (finalized) return;
    finalized = true;
    clearTimeout(timeoutHandle);
    kaneRunActive = false;
    emitKaneEvent(response, outcome);
    response.end();
  }

  function finishIfReady(exitCode, signal) {
    if (timedOut) {
      if (terminationFinished) {
        finalize(kaneParser.finish({
          timedOut: true,
          terminationSucceeded,
        }));
      }
      return;
    }
    if (!childClosed) return;

    finalize(kaneParser.finish({
      exitCode,
      signal,
      processError,
      outputLimitExceeded: malformedOutput,
    }));
  }

  function processLine(line) {
    const trimmed = line.trim().replace(/^\uFEFF/, "");
    if (!trimmed || malformedOutput) return;

    const parsed = kaneParser.consume(trimmed);
    if (!parsed.ok) {
      malformedOutput = true;
      return;
    }
    const event = parsed.event;

    if (!event || event.type === "run_end") return;

    if (Number.isInteger(event.step) && ["running", "done", "failed"].includes(event.status)) {
      emitKaneEvent(response, {
        type: "progress",
        state: event.status,
        step: event.step,
      });
    }
  }

  try {
    child = createKaneProcess();
  } catch {
    kaneRunActive = false;
    emitKaneEvent(response, kaneParser.finish({ spawnError: true }));
    response.end();
    return;
  }

  child.stdout.on("data", (chunk) => {
    if (malformedOutput) return;
    pending += decoder.write(chunk);
    if (pending.length > maxOutputLineLength && !pending.includes("\n")) {
      malformedOutput = true;
      pending = "";
      return;
    }

    let newlineIndex = pending.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      if (line.length > maxOutputLineLength) malformedOutput = true;
      else processLine(line);
      newlineIndex = pending.indexOf("\n");
    }
  });

  child.on("error", () => {
    processError = true;
  });

  timeoutHandle = setTimeout(() => {
    timedOut = true;
    terminateKaneProcess(child, (terminated) => {
      terminationFinished = true;
      terminationSucceeded = terminated;
      finishIfReady(null, null);
    });
  }, kaneTimeoutMs);

  child.on("close", (exitCode, signal) => {
    childClosed = true;
    pending += decoder.end();
    if (pending) {
      if (pending.length > maxOutputLineLength) malformedOutput = true;
      else processLine(pending);
    }
    finishIfReady(exitCode, signal);
  });
}

const server = http.createServer((request, response) => {
  const pathname = request.url.split("?")[0];

  if (pathname === "/api/kane/verify") {
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (!isLocalKaneRequest(request)) {
      writeJson(response, 403, { error: "Kane verification is available only from this local dashboard." });
      return;
    }
    if (Number(request.headers["content-length"] || 0) > 1024 || request.headers["transfer-encoding"]) {
      writeJson(response, 413, { error: "Request body is too large." });
      return;
    }
    if (kaneRunActive) {
      writeJson(response, 409, { error: "A Kane verification is already running." });
      return;
    }

    request.resume();
    runKane(response);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }

  const file = publicFiles[pathname];
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, file[0]);
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      console.error(`Unable to read ${file[0]}:`, error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load the demo.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
    });
    response.end(contents);
  });
});

server.listen(port, host, () => {
  console.log(`SABOTEUR checkout is running at http://${host}:${port}`);
});
