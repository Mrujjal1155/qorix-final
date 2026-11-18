import { describe, expect, it } from "bun:test";
import { activeTemplate, mobileImageFor, parseMobileImages } from "../../src/lib/mobile-template";

describe("template switch", () => {
  it("only an explicit mobile choice activates the Mobile View template", () => {
    expect(activeTemplate("mobile")).toBe("mobile");
    expect(activeTemplate("")).toBe("basic");
    expect(activeTemplate(undefined)).toBe("basic");
    expect(activeTemplate("something")).toBe("basic");
  });
  it("uses the mobile image when uploaded, otherwise the normal product image", () => {
    const map = parseMobileImages('{"a":"https://x/a.png","b":""}');
    expect(mobileImageFor(map, "a", "https://x/old.png")).toBe("https://x/a.png");
    expect(mobileImageFor(map, "b", "https://x/old.png")).toBe("https://x/old.png");
    expect(parseMobileImages("not json")).toEqual({});
  });
});

import { stripEmoji } from "../../src/lib/mobile-template";
describe("no emojis in Mobile View", () => {
  it("removes bot custom-emoji tags and emoji characters", () => {
    expect(stripEmoji("{ce:5413879192267805083:⚡} Duration: 12 Month")).toBe("Duration: 12 Month");
    expect(stripEmoji("Lovable Pro 🔥 12m")).toBe("Lovable Pro 12m");
  });
});
