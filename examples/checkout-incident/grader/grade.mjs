import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const contractVersion = Number(process.argv[3] ?? 2);

if (!workspace) {
  process.stderr.write("usage: node grade.mjs <workspace> <contractVersion>\n");
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.resolve(workspace, "src/checkout.mjs")).href;
const { createCheckoutService } = await import(moduleUrl + `?grader=${Date.now()}`);

function serviceWithPaidEvents() {
  const paid = [];
  return {
    paid,
    service: createCheckoutService({
      onPaid: (event) => paid.push(event)
    })
  };
}

function validEvent(overrides = {}) {
  return {
    id: "evt-1",
    checkoutId: "co-1",
    status: "payment.succeeded",
    amountCents: 2500,
    currency: "USD",
    signatureValid: true,
    processor: "primary",
    ...overrides
  };
}

const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

check("v1-success", () => {
  const { service, paid } = serviceWithPaidEvents();
  service.createCheckout({ id: "co-1", amountCents: 2500, currency: "USD" });
  assert.deepEqual(service.handlePaymentCallback(validEvent()), { status: "paid" });
  assert.equal(service.getCheckout("co-1").status, "paid");
  assert.equal(paid.length, 1);
});

check("v1-duplicate", () => {
  const { service, paid } = serviceWithPaidEvents();
  service.createCheckout({ id: "co-1", amountCents: 2500, currency: "USD" });
  const event = validEvent();
  service.handlePaymentCallback(event);
  assert.deepEqual(service.handlePaymentCallback(event), { status: "duplicate" });
  assert.equal(paid.length, 1);
});

if (contractVersion >= 2) {
  check("v2-invalid-signature-retry", () => {
    const { service, paid } = serviceWithPaidEvents();
    service.createCheckout({ id: "co-1", amountCents: 2500, currency: "USD" });

    const invalid = service.handlePaymentCallback(validEvent({ signatureValid: false }));
    assert.notEqual(invalid.status, "paid");
    assert.equal(service.getCheckout("co-1").status, "pending");
    assert.equal(paid.length, 0);

    const corrected = service.handlePaymentCallback(validEvent({ signatureValid: true }));
    assert.deepEqual(corrected, { status: "paid" });
    assert.equal(paid.length, 1);
  });

  check("v2-amount-mismatch-retry", () => {
    const { service, paid } = serviceWithPaidEvents();
    service.createCheckout({ id: "co-1", amountCents: 2500, currency: "USD" });

    const invalid = service.handlePaymentCallback(validEvent({ amountCents: 2600 }));
    assert.notEqual(invalid.status, "paid");
    assert.equal(service.getCheckout("co-1").status, "pending");

    assert.deepEqual(
      service.handlePaymentCallback(validEvent({ amountCents: 2500 })),
      { status: "paid" }
    );
    assert.equal(paid.length, 1);
  });

  check("v2-currency-mismatch-retry", () => {
    const { service } = serviceWithPaidEvents();
    service.createCheckout({ id: "co-1", amountCents: 2500, currency: "EUR" });

    assert.notEqual(
      service.handlePaymentCallback(validEvent({ currency: "USD" })).status,
      "paid"
    );

    assert.deepEqual(
      service.handlePaymentCallback(validEvent({ currency: "EUR" })),
      { status: "paid" }
    );
  });

  check("v2-unknown-checkout-does-not-poison-id", () => {
    const { service } = serviceWithPaidEvents();

    const event = validEvent({ checkoutId: "co-missing" });
    assert.notEqual(service.handlePaymentCallback(event).status, "paid");

    service.createCheckout({ id: "co-missing", amountCents: 2500, currency: "USD" });
    assert.deepEqual(service.handlePaymentCallback(event), { status: "paid" });
  });
}

if (contractVersion >= 3) {
  check("v3-secondary-processor-retry", () => {
    const { service, paid } = serviceWithPaidEvents();
    service.createCheckout({ id: "co-1", amountCents: 2500, currency: "USD" });

    const secondary = service.handlePaymentCallback(validEvent({ processor: "secondary" }));
    assert.notEqual(secondary.status, "paid");
    assert.equal(paid.length, 0);

    const primary = service.handlePaymentCallback(validEvent({ processor: "primary" }));
    assert.deepEqual(primary, { status: "paid" });
    assert.equal(paid.length, 1);
  });
}

const passed = checks.filter((item) => item.ok).length;
const failed = checks.length - passed;
const result = {
  schemaVersion: 1,
  contractVersion,
  passed,
  failed,
  correct: failed === 0,
  evidenceRefs: failed === 0
    ? [`evidence:checkout-contract-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(failed === 0 ? 0 : 1);

