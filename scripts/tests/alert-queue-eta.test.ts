import { describe, expect, test } from "bun:test";
import { formatEta, minQueueMinutes } from "../../src/lib/alert-queue-eta";

describe("alert queue ETA", () => {
  test("empty queue needs no time", () => expect(minQueueMinutes(0, 0)).toBe(0));
  test("default 1500 per minute: 23,383 notices take ~16 min", () => expect(minQueueMinutes(23383)).toBe(16));
  test("5,230 notices take ~4 min", () => expect(minQueueMinutes(5230)).toBe(4));
  test("custom rate is used", () => expect(minQueueMinutes(9000, 0, 900)).toBe(10));
  test("a waiting group post needs at least one minute", () => expect(minQueueMinutes(0, 2)).toBe(1));
  test("formats hours", () => expect(formatEta(125)).toBe("~2 h 5 min"));
});
