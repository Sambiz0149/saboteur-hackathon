# SABOTEUR

A small, local checkout demo for the Kane CLI hackathon. It includes one
$100.00 product, the `SAVE10` discount code, order confirmation, and a reset
button. The checkout flow is a local demo and does not process payments.

## Requirements

- Node.js 18 or newer

## Install and run

1. Install Node.js if it is not already installed.
2. Open a terminal in this project folder.
3. Start the server:

   ```powershell
   npm start
   ```

4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

No additional packages or install step are required. To stop the server, press
Ctrl+C in the terminal.

Enter `SAVE10` and select **Apply** to see the total change to $90.00. An
unrecognized code displays an error. Select **Place Order** to see the final
total, or **Reset demo** to start over.

## Verification dashboard

Open [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard) for the
four-stage SABOTEUR workflow. The checkout remains available at
[http://127.0.0.1:3000](http://127.0.0.1:3000).

Select **Run checkout verification** to execute the fixed SAVE10 objective with
the installed Kane CLI using agent output and headless Chrome. The dashboard
shows Kane's `run_end.status` separately from its own check extraction. It
extracts a checkout total or order-confirmation final total only from an
explicitly labeled text value; it does not depend on undocumented `run_end`
fields. A passed Kane status with unavailable check details is shown as
“Kane reported passed; check details unavailable,” not as a verified two-check
pass or an infrastructure error. Malformed or incomplete NDJSON, signals,
timeouts, and process errors remain errors. A failed `run_end` with a non-zero
process exit is shown as Kane's failed verdict plus an unclassified process
warning; the dashboard does not assume what that exit code means. A passed
verdict with a non-zero exit is not counted as a pass.

The server binds only to `127.0.0.1`. The runner is available only to the local
dashboard. It sends a small, whitelisted projection of Kane progress and final
totals to the browser; raw NDJSON, credentials, local evidence paths, and
private result URLs are not served to the page. Existing `.testmuai` files
remain local and ignored.

Kane runs are limited to five minutes. If a run exceeds that limit, the
dashboard reports a timeout error and the server attempts to terminate the Kane
process tree before releasing the run lock.

Run `npm test` for local parser tests. Their clearly named synthetic NDJSON
fixtures are parser test inputs only; they are not Kane runs or real evidence.

Copilot is not invoked automatically. For a repair cycle, open the workspace in
VS Code, ask Copilot Agent to inspect the checkout code and the actual Kane
failure, review the proposed source change, then rerun the objective from the
dashboard.
