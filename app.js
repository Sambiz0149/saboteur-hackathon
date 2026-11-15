const PRODUCT_PRICE_CENTS = 10000;
const DISCOUNT_CODE = "SAVE10";
const DISCOUNT_RATE = 0.1;

const discountForm = document.querySelector("#discount-form");
const discountInput = document.querySelector("#discount-code");
const discountMessage = document.querySelector("#discount-message");
const discountRow = document.querySelector("#discount-row");
const discountAmount = document.querySelector("#discount-amount");
const totalElement = document.querySelector("#total");
const orderButton = document.querySelector("#place-order");
const confirmation = document.querySelector("#confirmation");
const confirmedTotal = document.querySelector("#confirmed-total");
const resetButton = document.querySelector("#reset-demo");

let discountApplied = false;
let orderPlaced = false;

function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getTotalCents() {
  return PRODUCT_PRICE_CENTS - (discountApplied ? Math.round(PRODUCT_PRICE_CENTS * DISCOUNT_RATE) : 0);
}

function renderTotal() {
  const total = formatCurrency(getTotalCents());
  totalElement.textContent = total;
  discountAmount.textContent = `−${formatCurrency(PRODUCT_PRICE_CENTS - getTotalCents())}`;
  discountRow.hidden = !discountApplied;
}

discountForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (orderPlaced) return;

  if (discountInput.value.trim().toUpperCase() !== DISCOUNT_CODE) {
    discountApplied = false;
    discountMessage.textContent = "That code isn't valid. Check it and try again.";
    discountMessage.classList.remove("success");
    renderTotal();
    return;
  }

  discountApplied = true;
  discountMessage.textContent = "Nice. 10% has been taken off your order.";
  discountMessage.classList.add("success");
  renderTotal();
});

orderButton.addEventListener("click", () => {
  if (orderPlaced) return;

  orderPlaced = true;
  confirmedTotal.textContent = formatCurrency(getTotalCents());
  confirmation.hidden = false;
  orderButton.disabled = true;
  orderButton.textContent = "Order placed";
});

resetButton.addEventListener("click", () => {
  discountApplied = false;
  orderPlaced = false;
  discountInput.value = "";
  discountMessage.textContent = "";
  discountMessage.classList.remove("success");
  confirmation.hidden = true;
  orderButton.disabled = false;
  orderButton.innerHTML = 'Place order <span aria-hidden="true">↗</span>';
  renderTotal();
});

renderTotal();
