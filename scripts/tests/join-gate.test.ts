import { expect, test } from "bun:test";
import { parseJoinChannels, requiredJoinChannels, serializeJoinChannels } from "../../src/lib/bot/join-gate";

const settings = { join_gate: "on", join_channels: "@QORIXCHAT|Main Group|https://t.me/QORIXCHAT\n@qorixstoreupdate|Main Channel|https://t.me/qorixstoreupdate" };
const source = await Bun.file("src/lib/bot/engine.server.ts").text();
const start = source.indexOf("function joinGateOn(");
const end = source.indexOf("/** Shown once membership", start);
if (start < 0 || end <= start) throw new Error("Join gate functions missing");
const transpiler = new Bun.Transpiler({ loader: "ts" });
function gate(status: string) {
  const calls: string[] = [];
  const deps = {
    requiredJoinChannels,
    joinChannels: (s: Record<string, string>) => parseJoinChannels(s["join_channels"]),
    tg: async (_method: string, input: { chat_id: string }) => { calls.push(input.chat_id); return { ok: true, result: { status } }; },
    je: () => "", escapeHtml: (text: string) => text,
    jeBtn: (_s: unknown, _key: string, text: string, data: object) => ({ text, ...data }),
  };
  const functions = new Function(...Object.keys(deps), `${transpiler.transformSync(source.slice(start, end))}; return {joinGateOn, missingJoins, joinGateView};`)(...Object.values(deps)) as {
    joinGateOn: (s: Record<string, string>) => boolean;
    missingJoins: (id: number, s: Record<string, string>) => Promise<ReturnType<typeof parseJoinChannels>>;
    joinGateView: (s: Record<string, string>, missing: ReturnType<typeof parseJoinChannels>) => {kb: {url?: string; callback_data?: string}[][]};
  };
  return { ...functions, calls };
}

test("Main Group remains required and Main Channel is optional in existing settings", () => {
  expect(requiredJoinChannels(settings).map((c) => c.chat)).toEqual(["@QORIXCHAT"]);
  expect(parseJoinChannels(settings.join_channels)[1]?.required).toBe(false);
});
test("joining only Main Group unlocks full access without querying optional channel", async () => {
  const g = gate("member");
  expect(g.joinGateOn(settings)).toBe(true);
  expect(await g.missingJoins(123, settings)).toEqual([]);
  expect(g.calls).toEqual(["@QORIXCHAT"]);
});
test("not joining Main Group still blocks access and retains optional join button", async () => {
  const g = gate("left");
  const missing = await g.missingJoins(123, settings);
  expect(missing.map((c) => c.chat)).toEqual(["@QORIXCHAT"]);
  const buttons = g.joinGateView(settings, missing).kb.flat();
  expect(buttons.map((b) => b.url).filter(Boolean)).toEqual(["https://t.me/QORIXCHAT", "https://t.me/qorixstoreupdate"]);
  expect(buttons.at(-1)?.callback_data).toBe("jg:v");
});
test("admin serialization preserves optional mode and never makes unrelated chats optional", () => {
  const saved = serializeJoinChannels(parseJoinChannels(settings.join_channels));
  expect(parseJoinChannels(saved).map((c) => c.required)).toEqual([true, false]);
  expect(parseJoinChannels("@another|Other|https://t.me/another")[0]?.required).toBe(true);
});

for (const status of ["member", "left"]) {
  test(`real Verify callback ${status === "member" ? "opens menu with only Main Group joined" : "keeps non-members locked"}`, async () => {
    const g = gate(status);
    const begin = source.indexOf('  if (data === "jg:v") {');
    const finish = source.indexOf("  // Every other action stays locked", begin);
    if (begin < 0 || finish <= begin) throw new Error("Verify callback missing");
    const edits: {text: string; kb: unknown}[] = [];
    const deps = {
      ...g, data: "jg:v", chatId: 123, websiteOwner: {},
      getSettings: async () => settings,
      getUser: async () => ({telegram_id: 123}),
      escapeHtml: (text: string) => text,
      joinSuccessText: () => "Full access unlocked",
      homeText: async () => "QORIX STORE MENU",
      homeKeyboard: async () => [[{callback_data: "shop"}]],
      edit: async (text: string, kb: unknown) => { edits.push({text, kb}); },
    };
    const callback = transpiler.transformSync(`async function verifyCallback() {${source.slice(begin, finish)}}`);
    await new Function(...Object.keys(deps), `${callback}; return verifyCallback();`)(...Object.values(deps));
    expect(edits).toHaveLength(1);
    if (status === "member") {
      expect(edits[0]?.text).toContain("Full access unlocked");
      expect(edits[0]?.kb).toEqual([[{callback_data: "shop"}]]);
    } else {
      expect(edits[0]?.text).toContain("Not verified yet");
      expect(edits[0]?.text).not.toContain("Full access unlocked");
    }
    expect(g.calls).toEqual(["@QORIXCHAT"]);
  });
}