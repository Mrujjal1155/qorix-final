import { beforeEach, expect, mock, test } from "bun:test";

let accepted = true;
let fileAccepted = false;
let messages = 0;
let documents = 0;
mock.module("@/lib/telegram.server", () => ({
  sendMessage: async () => { messages++; return { ok: accepted }; },
  sendDocumentUpload: async () => { documents++; return { ok: fileAccepted }; },
}));
const { deliverItemsToChat } = await import("../../src/lib/bot/deliver-items.server");

beforeEach(() => { accepted = true; fileAccepted = false; messages = 0; documents = 0; });

test("successful single-item delivery sends one follow-up after the credential", async () => {
  const result = await deliverItemsToChat(123, "Test", ["synthetic-test-item"]);
  expect(result.sent).toBe(1);
  expect(result.failed).toBe(0);
  expect(messages).toBe(2);
});

test("rejected delivery does not send a success follow-up", async () => {
  accepted = false;
  const result = await deliverItemsToChat(123, "Test", ["synthetic-test-item"]);
  expect(result.sent).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.fallbackFile).toBe(false);
  expect(messages).toBe(2); // delivery + single-item retry, no appreciation
  expect(documents).toBe(1);
});

test("accepted bulk file sends one follow-up for the whole delivery", async () => {
  fileAccepted = true;
  const result = await deliverItemsToChat(123, "Test", Array(6).fill("synthetic-test-item"));
  expect(result.sent).toBe(6);
  expect(documents).toBe(1);
  expect(messages).toBe(1);
});

test("empty delivery never sends a success message", async () => {
  const result = await deliverItemsToChat(123, "Test", []);
  expect(result.sent).toBe(0);
  expect(messages).toBe(0);
});