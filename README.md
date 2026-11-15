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

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

No additional packages or install step are required. To stop the server, press
Ctrl+C in the terminal.

Enter `SAVE10` and select **Apply** to see the total change to $90.00. An
unrecognized code displays an error. Select **Place Order** to see the final
total, or **Reset demo** to start over.
