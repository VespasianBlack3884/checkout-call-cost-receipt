import assert from "node:assert/strict";
import test from "node:test";
import { prepareCustomerUpdate, type UpdateGenerator } from "../src/order_update_service.js";

test("a shipped checkout combines the receipt and tracking update in one measured call", async () => {
  let observedPrompt = "";
  let observedKey = "";
  const generate: UpdateGenerator = async (prompt, idempotencyKey) => {
    observedPrompt = prompt;
    observedKey = idempotencyKey;
    return {
      update: { subject: "Your order has shipped", message: "Receipt R-7 and tracking TRK-9 are ready." },
      costUsd: "0.00031",
      vendor: "example-vendor"
    };
  };

  const result = await prepareCustomerUpdate(
    {
      orderId: "order-7",
      customerName: "Ari",
      checkout: { status: "paid", total: 42, currency: "USD" },
      fulfillment: { status: "shipped", carrier: "North Parcel", trackingNumber: "TRK-9" },
      receiptNumber: "R-7"
    },
    generate
  );

  assert.equal(result.updateKind, "receipt_and_shipping");
  assert.equal(result.modelCostUsd, "0.00031");
  assert.match(observedPrompt, /Receipt: R-7/);
  assert.match(observedPrompt, /North Parcel tracking TRK-9/);
  assert.equal(observedKey, "order-update:order-7:receipt_and_shipping");
});
