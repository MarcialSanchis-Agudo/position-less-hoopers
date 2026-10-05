import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutService } from "../src/checkout.mjs";

test("successful payment marks checkout paid", () => {
  const paid = [];
  const service = createCheckoutService({
    onPaid: (event) => paid.push(event)
  });

  service.createCheckout({ id: "co-1", amountCents: 2500 });

  assert.deepEqual(service.handlePaymentCallback({
    id: "evt-1",
    checkoutId: "co-1",
    status: "payment.succeeded",
    amountCents: 2500,
    currency: "USD",
    signatureValid: true,
    processor: "primary"
  }), { status: "paid" });

  assert.equal(service.getCheckout("co-1").status, "paid");
  assert.equal(paid.length, 1);
});

test("duplicate callback does not emit a second paid event", () => {
  const paid = [];
  const service = createCheckoutService({
    onPaid: (event) => paid.push(event)
  });

  service.createCheckout({ id: "co-1", amountCents: 2500 });
  const event = {
    id: "evt-1",
    checkoutId: "co-1",
    status: "payment.succeeded",
    amountCents: 2500,
    currency: "USD",
    signatureValid: true,
    processor: "primary"
  };

  service.handlePaymentCallback(event);
  assert.deepEqual(service.handlePaymentCallback(event), {
    status: "duplicate"
  });
  assert.equal(paid.length, 1);
});

