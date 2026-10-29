import { expect, test } from "bun:test";
import { buildHomeMessage, referralCopyButton, referralShareAnchor } from "../../src/lib/bot/home-message";

const LINK = "https://t.me/QORIX3_bot?start=ref_6597840789";

test("referral row link opens the share sheet, never the bot's own /start", () => {
  const anchor = referralShareAnchor(LINK, "Join our shop", "Invite & earn");
  expect(anchor).toContain('href="https://t.me/share/url?url=');
  expect(anchor).toContain(encodeURIComponent(LINK));
  expect(anchor).not.toMatch(/href="https:\/\/t\.me\/[^"]*start=ref_/);
});

test("home message keeps the share-only referral link", () => {
  const html = buildHomeMessage({
    header: "QORIX STORE", greeting: "Welcome back!", welcome: "", choose: "Choose an option below.",
    account: [["User ID", "6597840789"]], wallet: [["Balance", "$29.97"]],
    referrals: [["Referral Link", referralShareAnchor(LINK, "Join our shop", "Invite & earn")]],
  });
  expect(html).toContain('href="https://t.me/share/url?url=');
  expect(html).not.toMatch(/href="https:\/\/t\.me\/[^"]*start=ref_/);
});

test("copy button copies the exact referral link in one tap", () => {
  expect(referralCopyButton(LINK)).toEqual({
    text: "🔗 Copy Referral Link",
    copy_text: { text: LINK },
    style: "primary",
  });
});
