const runButton = document.querySelector("#run-verification");
const runStatus = document.querySelector("#run-status");
const progressTrack = document.querySelector(".progress-track");
const progressBar = document.querySelector("#progress-bar");
const progressMessage = document.querySelector("#progress-message");
const verificationState = document.querySelector("#verification-state");
const repairState = document.querySelector("#repair-state");
const repairCopy = document.querySelector("#repair-copy");
const resultCard = document.querySelector("#result-card");
const resultLabel = document.querySelector("#result-label");
const resultMessage = document.querySelector("#result-message");
const processWarning = document.querySelector("#process-warning");
const checkStatus = document.querySelector("#check-status");
const resultTotals = document.querySelector("#result-totals");
const checkoutTotal = document.querySelector("#checkout-total");
const confirmationTotal = document.querySelector("#confirmation-total");

let confirmedFailureSeen = false;

function setState(element, state, label) {
  element.dataset.state = state;
  element.textContent = label;
}

function showError(message) {
  setState(runStatus, "error", "ERROR");
  setState(verificationState, "error", "ERROR");
  progressTrack.dataset.state = "error";
  progressMessage.textContent = message;
  resultCard.dataset.state = "error";
  resultCard.hidden = false;
  resultLabel.textContent = "VERIFICATION ERROR";
  resultMessage.textContent = message;
  processWarning.hidden = true;
  checkStatus.hidden = true;
  resultTotals.hidden = true;
}

function showFinal(outcome) {
  const state = outcome.status;
  const label = state === "passed" ? "KANE PASSED" : state === "failed" ? "KANE FAILED" : "ERROR";

  setState(runStatus, state, label);
  setState(verificationState, state, label);
  progressTrack.dataset.state = state;
  progressMessage.textContent = outcome.message;
  resultCard.dataset.state = state;
  resultCard.hidden = false;
  resultLabel.textContent = outcome.kaneStatus
    ? `KANE REPORTED / ${outcome.kaneStatus.toUpperCase()}`
    : "VERIFICATION ERROR";
  resultMessage.textContent = outcome.message;

  processWarning.hidden = typeof outcome.processWarning !== "string";
  processWarning.textContent = outcome.processWarning || "";

  const checkLabels = {
    verified: "TWO CHECKS VERIFIED",
    unavailable: "CHECK DETAILS UNAVAILABLE",
    mismatch: "EXTRACTED CHECKS DO NOT MATCH $90.00",
  };
  checkStatus.hidden = !checkLabels[outcome.checksStatus];
  checkStatus.textContent = checkLabels[outcome.checksStatus] || "";

  const hasTotals = typeof outcome.checkoutTotal === "string"
    || typeof outcome.confirmationTotal === "string";
  resultTotals.hidden = !hasTotals;
  checkoutTotal.textContent = outcome.checkoutTotal || "Not reported";
  confirmationTotal.textContent = outcome.confirmationTotal || "Not reported";

  if (state === "failed") {
    confirmedFailureSeen = true;
    setState(repairState, "guide-state", "READY");
    repairCopy.textContent = "Kane reported failed. Use Copilot Agent in VS Code to inspect the code and result, repair the issue, then rerun here.";
  } else if (state === "passed" && outcome.checksStatus === "verified" && confirmedFailureSeen) {
    setState(repairState, "passed", "RECHECK PASSED");
    repairCopy.textContent = "The checkout passed after a failure in this dashboard session. Review the repair in VS Code; this page does not invoke Copilot.";
  } else if (state === "passed" && confirmedFailureSeen) {
    setState(repairState, "running", "RECHECK UNVERIFIED");
    repairCopy.textContent = "Kane reported passed, but the dashboard could not independently verify both $90.00 checks. Review the repair and available result details in VS Code.";
  }
}

function handleProgress(event) {
  const currentStep = Number.isInteger(event.step) ? ` · STEP ${event.step}` : "";
  const progressState = event.state === "starting" ? "starting"
    : event.state === "running" ? "running"
      : "done";
  setState(runStatus, "running", progressState === "starting" ? "STARTING" : "RUNNING");
  setState(verificationState, "running", progressState === "done" ? "IN PROGRESS" : "RUNNING");
  progressTrack.dataset.state = "running";
  progressBar.style.width = event.state === "starting" ? "8%" : "";
  progressMessage.textContent = event.state === "starting"
    ? "Starting the installed Kane CLI…"
    : `Kane is processing the checkout objective${currentStep}.`;
}

function parseEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function runVerification() {
  runButton.disabled = true;
  resultCard.hidden = true;
  resultTotals.hidden = true;
  setState(runStatus, "running", "STARTING");
  setState(verificationState, "running", "RUNNING");
  progressTrack.dataset.state = "running";
  progressBar.style.width = "8%";
  progressMessage.textContent = "Connecting to the local Kane runner…";

  let finalOutcome = null;
  let malformedStream = false;
  let pending = "";
  const decoder = new TextDecoder();

  function consumeLine(line) {
    if (!line.trim()) return;
    const event = parseEvent(line);
    if (!event) {
      malformedStream = true;
      return;
    }
    if (event.type === "progress") {
      handleProgress(event);
    } else if (event.type === "final") {
      if (finalOutcome) malformedStream = true;
      else finalOutcome = event;
    } else {
      malformedStream = true;
    }
  }

  try {
    const response = await fetch("/api/kane/verify", {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
    });

    if (!response.ok || !response.body) {
      showError("The local Kane runner could not accept this verification request.");
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      let newlineIndex = pending.indexOf("\n");
      while (newlineIndex !== -1) {
        consumeLine(pending.slice(0, newlineIndex));
        pending = pending.slice(newlineIndex + 1);
        newlineIndex = pending.indexOf("\n");
      }
      if (done) break;
    }

    if (pending.trim()) consumeLine(pending);
    if (malformedStream || !finalOutcome) {
      showError("Kane output was incomplete or could not be read. No pass was recorded.");
      return;
    }
    if (!["passed", "failed", "error"].includes(finalOutcome.status)
      || (finalOutcome.kaneStatus !== undefined && finalOutcome.kaneStatus !== null
        && (typeof finalOutcome.kaneStatus !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(finalOutcome.kaneStatus)))) {
      showError("Kane returned an unknown verdict. No pass was recorded.");
      return;
    }

    showFinal(finalOutcome);
  } catch {
    showError("The connection to the local Kane runner ended before a complete verdict arrived.");
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", runVerification);
