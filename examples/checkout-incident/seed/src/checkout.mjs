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

      // Intentionally incomplete implementation for the benchmark seed.
      idempotencyStore.mark(event.id);

      const checkout = checkouts.get(event.checkoutId);
      if (!checkout) {
        return { status: "not_found" };
      }

      if (event.status === "payment.succeeded") {
        checkout.status = "paid";
        onPaid({ ...checkout, eventId: event.id });
      }

      return { status: checkout.status };
    }
  };
}

