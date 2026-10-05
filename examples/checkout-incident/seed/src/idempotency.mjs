export class MemoryIdempotencyStore {
  constructor() {
    this.processed = new Set();
  }

  has(eventId) {
    return this.processed.has(eventId);
  }

  mark(eventId) {
    this.processed.add(eventId);
  }
}

