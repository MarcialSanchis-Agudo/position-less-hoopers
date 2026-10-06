import assert from "node:assert/strict";
import test from "node:test";
import { replayEvents } from "../src/replay.mjs";

test("v1: deduplicates ids and orders by aggregate then sequence", () => {
  const events = [
    { id: "e3", aggregateId: "b", sequence: 1, payload: {} },
    { id: "e2", aggregateId: "a", sequence: 2, payload: {} },
    { id: "e1", aggregateId: "a", sequence: 1, payload: {} },
    { id: "e1", aggregateId: "a", sequence: 1, payload: {} }
  ];

  assert.deepEqual(replayEvents(events), ["e1", "e2", "e3"]);
});

