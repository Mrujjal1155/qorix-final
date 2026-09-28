/** Per-product "ask the customer for info" config for manual-delivery products. */
export const MANUAL_INPUT_PREFIX = "manual_input_";

export type ManualInputKind = "none" | "email" | "text";
export type ManualInputConfig = {
  kind: ManualInputKind;
  prompt: string;
  qty_per_line: boolean;
  eta: string;
};

export const EMPTY_MANUAL_INPUT: ManualInputConfig = { kind: "none", prompt: "", qty_per_line: false, eta: "" };

export function parseManualInput(raw: string | null | undefined): ManualInputConfig {
  try {
    const j = JSON.parse(String(raw ?? ""));
    const kind: ManualInputKind = j?.kind === "email" || j?.kind === "text" ? j.kind : "none";
    return {
      kind,
      prompt: String(j?.prompt ?? "").slice(0, 1500),
      qty_per_line: Boolean(j?.qty_per_line),
      eta: String(j?.eta ?? "").slice(0, 100),
    };
  } catch {
    return { ...EMPTY_MANUAL_INPUT };
  }
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

/** Validate the buyer's reply. Returns cleaned lines or an error message. */
export function validateManualReply(cfg: ManualInputConfig, text: string): { lines: string[] } | { error: string } {
  const raw = String(text ?? "").slice(0, 2000);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!lines.length) return { error: "Please send the requested information." };
  if (cfg.kind === "email") {
    const bad = lines.filter((l) => !EMAIL_RE.test(l) || l.length > 254);
    if (bad.length) return { error: `Invalid email: ${bad[0]!.slice(0, 80)}\nPlease send one valid email per line.` };
  }
  return { lines };
}
