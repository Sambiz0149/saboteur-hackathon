const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT) || 3000;
const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
};

const server = http.createServer((request, response) => {
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }

  const file = publicFiles[request.url.split("?")[0]];
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

server.listen(port, () => {
  console.log(`SABOTEUR checkout is running at http://localhost:${port}`);
});
