import { MemoryIdempotencyStore } from "./idempotency.mjs";

export function createCheckoutService({
  idempotencyStore = new MemoryIdempotencyStore(),
  onPaid = () => {}
} = {}) {
  const checkouts = new Map();

  return {
    createCheckout({ id, amountCents, currency = "USD" }) {
      const checkout = {
        id,
        amountCents,
        currency,
        status: "pending"
      };
      checkouts.set(id, checkout);
      return { ...checkout };
    },

    getCheckout(id) {
      const checkout = checkouts.get(id);
      return checkout ? { ...checkout } : null;
    },

    handlePaymentCallback(event) {
      if (idempotencyStore.has(event.id)) {
        return { status: "duplicate" };
      }

      const checkout = checkouts.get(event.checkoutId);
      if (!checkout) {
        return { status: "not_found" };
      }

      if (event.signatureValid !== true) {
        return { status: "invalid_signature" };
      }

      if (
        event.amountCents !== checkout.amountCents ||
        event.currency !== checkout.currency
      ) {
        return { status: "mismatch" };
      }

      if (event.processor != null && event.processor !== "primary") {
        return { status: "unsupported_processor" };
      }

      if (event.status !== "payment.succeeded") {
        return { status: checkout.status };
      }

      idempotencyStore.mark(event.id);
      checkout.status = "paid";
      onPaid({ ...checkout, eventId: event.id });

      return { status: "paid" };
    }
  };
}

