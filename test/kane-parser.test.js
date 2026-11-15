const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parseKaneOutput } = require("../kane-parser");

function readSyntheticFixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", `synthetic-${name}.ndjson`), "utf8");
}

test("extracts both explicitly labeled totals from synthetic passed output", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("passed"), { exitCode: 0 });

  assert.equal(outcome.status, "passed");
  assert.equal(outcome.kaneStatus, "passed");
  assert.equal(outcome.checksStatus, "verified");
  assert.equal(outcome.checkoutTotal, "$90.00");
  assert.equal(outcome.confirmationTotal, "$90.00");
});

test("reports the actual failed run_end status without extra Kane fields", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("failed"), { exitCode: 0 });

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.kaneStatus, "failed");
  assert.equal(outcome.processStatus, "exited_zero");
  assert.equal(outcome.message, "Kane reported failed.");
});

test("keeps a failed verdict and warns when the non-zero exit meaning is unclassified", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("failed"), { exitCode: 7 });

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.kaneStatus, "failed");
  assert.equal(outcome.processStatus, "nonzero_exit_unclassified");
  assert.equal(outcome.processExitCode, 7);
  assert.equal(outcome.message, "Kane reported failed.");
  assert.match(outcome.processWarning, /exit code 7.*meaning is unclassified/);
});

test("does not record a passed verdict with a non-zero exit as a pass", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("passed"), { exitCode: 7 });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.kaneStatus, "passed");
  assert.equal(outcome.processStatus, "nonzero_exit_unclassified");
  assert.equal(outcome.processExitCode, 7);
  assert.match(outcome.processWarning, /exit code 7.*meaning is unclassified/);
  assert.match(outcome.message, /no pass was recorded/);
});

test("keeps a passed run separate from unavailable check details", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("missing-details"), { exitCode: 0 });

  assert.equal(outcome.status, "passed");
  assert.equal(outcome.kaneStatus, "passed");
  assert.equal(outcome.checksStatus, "unavailable");
  assert.equal(outcome.message, "Kane reported passed; check details unavailable.");
});

test("rejects malformed synthetic NDJSON as an output error", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("malformed-output"), { exitCode: 0 });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.kaneStatus, "passed");
  assert.match(outcome.message, /malformed/);
});

test("treats a synthetic run without run_end as incomplete", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("incomplete-run"), { exitCode: 0 });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.kaneStatus, null);
  assert.equal(outcome.processStatus, "missing_run_end");
  assert.match(outcome.message, /without a complete final verdict/);
});

test("does not record a verdict as complete when the process is signaled", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("passed"), {
    exitCode: null,
    signal: "SIGTERM",
  });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.kaneStatus, "passed");
  assert.equal(outcome.processStatus, "signaled");
  assert.equal(outcome.message, "Kane process terminated by signal SIGTERM.");
});

test("keeps timeout failures explicit even when output contains a passed run_end", () => {
  const outcome = parseKaneOutput(readSyntheticFixture("passed"), {
    timedOut: true,
    terminationSucceeded: true,
  });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.kaneStatus, "passed");
  assert.equal(outcome.processStatus, "timed_out");
  assert.match(outcome.message, /timed out/);
});

test("keeps spawn failures explicit", () => {
  const outcome = parseKaneOutput("", { spawnError: true });

  assert.equal(outcome.status, "error");
  assert.equal(outcome.processStatus, "spawn_error");
  assert.equal(outcome.message, "Kane CLI could not be started.");
});
