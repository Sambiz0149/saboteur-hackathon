const expectedTotal = "$90.00";
const moneyPattern = /^\$\d{1,3}(?:,\d{3})*\.\d{2}$/;
const statusPattern = /^[a-zA-Z0-9_-]{1,32}$/;

function safeStatus(value) {
  return typeof value === "string" && statusPattern.test(value)
    ? value.toLowerCase()
    : "unknown";
}

function createKaneParser() {
  let runEnd = null;
  let malformedOutput = false;
  const totals = {
    checkoutTotal: undefined,
    confirmationTotal: undefined,
  };

  function recordTotal(key, value) {
    const total = moneyPattern.test(value) ? value : null;
    if (totals[key] === undefined) {
      totals[key] = total;
    } else if (totals[key] !== total) {
      totals[key] = null;
    }
  }

  function collectLabeledTotals(value) {
    const pending = [value];
    while (pending.length) {
      const current = pending.pop();
      if (typeof current === "string") {
        const checkoutMatch = /^\s*checkout total\s*:\s*(\S+)\s*$/i.exec(current);
        if (checkoutMatch) recordTotal("checkoutTotal", checkoutMatch[1]);

        const confirmationMatch = /^\s*order confirmation final total\s*:\s*(\S+)\s*$/i.exec(current);
        if (confirmationMatch) recordTotal("confirmationTotal", confirmationMatch[1]);
      } else if (Array.isArray(current)) {
        for (const item of current) pending.push(item);
      } else if (current && typeof current === "object") {
        for (const key of Object.keys(current)) pending.push(current[key]);
      }
    }
  }

  function consume(line) {
    const trimmed = line.trim().replace(/^\uFEFF/, "");
    if (!trimmed) return { ok: true, event: null };

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      malformedOutput = true;
      return { ok: false, event: null };
    }

    if (!event || typeof event !== "object" || Array.isArray(event)) {
      malformedOutput = true;
      return { ok: false, event: null };
    }

    if (event.type === "run_end") {
      if (runEnd) {
        malformedOutput = true;
        return { ok: false, event: null };
      }
      runEnd = event;
    } else {
      collectLabeledTotals(event);
    }

    return { ok: true, event };
  }

  function finish({
    exitCode,
    signal,
    processError = false,
    spawnError = false,
    outputLimitExceeded = false,
    timedOut = false,
    terminationSucceeded = false,
  } = {}) {
    const kaneStatus = runEnd ? safeStatus(runEnd.status) : null;
    let checkoutTotal = typeof totals.checkoutTotal === "string" ? totals.checkoutTotal : null;
    let confirmationTotal = typeof totals.confirmationTotal === "string" ? totals.confirmationTotal : null;
    const hasBothTotals = checkoutTotal !== null && confirmationTotal !== null;
    let checksStatus = !hasBothTotals
      ? "unavailable"
      : checkoutTotal === expectedTotal && confirmationTotal === expectedTotal
        ? "verified"
        : "mismatch";

    let status = "error";
    let processStatus = "unknown";
    let processWarning = Number.isInteger(exitCode) && exitCode !== 0
      ? `Process warning: exit code ${exitCode} is non-zero; its meaning is unclassified.`
      : null;
    let message = "Kane output was incomplete or malformed.";

    if (timedOut) {
      processStatus = "timed_out";
      message = terminationSucceeded
        ? "Kane timed out; its process tree was terminated."
        : "Kane timed out; process termination could not be confirmed.";
    } else if (spawnError) {
      processStatus = "spawn_error";
      message = "Kane CLI could not be started.";
    } else if (malformedOutput || outputLimitExceeded) {
      processStatus = outputLimitExceeded ? "output_limit_exceeded" : "malformed_output";
      message = "Kane output was incomplete or malformed.";
    } else if (processError) {
      processStatus = "process_error";
      message = "Kane process reported an error; clean completion was not established.";
    } else if (signal) {
      processStatus = "signaled";
      const safeSignal = /^[A-Z0-9]+$/.test(signal) ? signal : "unknown";
      message = runEnd
        ? `Kane process terminated by signal ${safeSignal}.`
        : `Kane process terminated by signal ${safeSignal} before a run_end event was received.`;
    } else if (!runEnd) {
      processStatus = "missing_run_end";
      message = "Kane ended without a complete final verdict.";
    } else if (!Number.isInteger(exitCode)) {
      processStatus = "unknown_exit";
      message = "Kane process closed without a usable exit code.";
    } else if (exitCode !== 0) {
      processStatus = "nonzero_exit_unclassified";
      if (kaneStatus === "failed") {
        status = "failed";
        message = "Kane reported failed.";
      } else if (kaneStatus === "passed") {
        message = "Kane reported passed, but no pass was recorded because the process exited non-zero.";
      } else {
        message = "Kane reported an unrecognized run status.";
      }
    } else {
      processStatus = "exited_zero";
      if (kaneStatus === "passed") {
        status = "passed";
        message = checksStatus === "verified"
          ? "Kane reported passed; both $90.00 checks were independently extracted."
          : checksStatus === "unavailable"
            ? "Kane reported passed; check details unavailable."
            : "Kane reported passed; extracted check details did not match $90.00.";
      } else if (kaneStatus === "failed") {
        status = "failed";
        message = "Kane reported failed.";
      } else {
        message = "Kane reported an unrecognized run status.";
      }
    }

    if ([
      "process_error",
      "spawn_error",
      "timed_out",
      "malformed_output",
      "output_limit_exceeded",
      "missing_run_end",
      "signaled",
      "unknown_exit",
    ].includes(processStatus)) {
      checkoutTotal = null;
      confirmationTotal = null;
      checksStatus = "unavailable";
    }

    return {
      type: "final",
      status,
      kaneStatus,
      processStatus,
      processExitCode: Number.isInteger(exitCode) ? exitCode : null,
      processWarning,
      checksStatus,
      message,
      checkoutTotal,
      confirmationTotal,
    };
  }

  return { consume, finish };
}

function parseKaneOutput(output, processResult = {}) {
  const parser = createKaneParser();
  for (const line of output.split(/\r?\n/)) parser.consume(line);
  return parser.finish(processResult);
}

module.exports = { createKaneParser, parseKaneOutput };
