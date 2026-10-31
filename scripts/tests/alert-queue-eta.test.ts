import { describe, expect, test } from "bun:test";
import { formatEta, minQueueMinutes } from "../../src/lib/alert-queue-eta";

describe("alert queue ETA", () => {
  test("empty queue needs no time", () => expect(minQueueMinutes(0, 0)).toBe(0));
  test("300 notices per minute", () => expect(minQueueMinutes(9739)).toBe(33));
  test("a waiting group post needs at least one minute", () => expect(minQueueMinutes(0, 2)).toBe(1));
  test("formats hours", () => expect(formatEta(125)).toBe("~2 h 5 min"));
});
