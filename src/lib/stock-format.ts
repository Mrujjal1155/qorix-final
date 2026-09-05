/* Shared bulk-stock parsing — used by the website admin panel and the Telegram
   admin flow so both accept exactly the same formats. Pure functions only. */

export type StockFormat = "auto" | "lines" | "colon" | "pipe" | "csv" | "block" | "json";

export const STOCK_FORMATS: { value: StockFormat; label: string; example: string; help: string }[] = [
  {
    value: "auto",
    label: "Auto detect",
    example: "Paste any format",
    help: "Automatically detects any of the formats below.",
  },
  {
    value: "lines",
    label: "One item per line",
    example: "PROMO-A1B2\nPROMO-C3D4",
    help: "One promo code / key / link per line.",
  },
  {
    value: "colon",
    label: "email:password",
    example: "user1@mail.com:pass123\nuser2@mail.com:pass456",
    help: "Email and password are delivered neatly on separate lines.",
  },
  {
    value: "pipe",
    label: "email | password | note",
    example: "user@mail.com | pass123 | 30 days\nuser2@mail.com | pass456 | 1 year",
    help: "If a third part exists it is delivered as a Note.",
  },
  {
    value: "csv",
    label: "CSV (comma separated)",
    example: "email,password,note\nuser@mail.com,pass123,warranty 30d",
    help: "If the first line is a header, it becomes the labels.",
  },
  {
    value: "block",
    label: "Multi-line block (separated by ---)",
    example: "Email: a@mail.com\nPass: 123\nProfile: 2\n---\nEmail: b@mail.com\nPass: 456",
    help: "Full info of one account together; separate blocks with ---.",
  },
  {
    value: "json",
    label: "JSON array",
    example: '[{"email":"a@mail.com","password":"123"},"PROMO-XYZ"]',
    help: "String or object array — object keys become the labels.",
  },
];

function fmtPairs(pairs: [string, string][]): string {
  return pairs
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

function title(k: string): string {
  const s = k.trim().replace(/[_-]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function detectFormat(raw: string): StockFormat {
  const text = raw.trim();
  if (!text) return "lines";
  if ((text.startsWith("[") || text.startsWith("{")) && /[}\]]$/.test(text)) return "json";
  if (/^\s*---+\s*$/m.test(text)) return "block";
  const first = text.split("\n").find((l) => l.trim())!.trim();
  if (first.includes("|")) return "pipe";
  if (first.includes(",") && !first.includes(" ") && first.split(",").length >= 2) return "csv";
  if (/^[^\s:]+:[^\s:]+/.test(first)) return "colon";
  return "lines";
}

/** Returns one delivery-ready text block per stock item. */
export function parseStock(raw: string, format: StockFormat = "auto"): string[] {
  const text = String(raw ?? "").replace(/\r/g, "");
  if (!text.trim()) return [];
  const fmt = format === "auto" ? detectFormat(text) : format;

  if (fmt === "json") {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .map((item) => {
          if (item == null) return "";
          if (typeof item === "string" || typeof item === "number") return String(item).trim();
          if (typeof item === "object")
            return fmtPairs(Object.entries(item as Record<string, unknown>).map(([k, v]) => [title(k), String(v)]));
          return String(item);
        })
        .filter(Boolean);
    } catch {
      throw new Error("Invalid JSON format — provide a valid JSON array");
    }
  }

  if (fmt === "block") {
    const chunks = /^\s*---+\s*$/m.test(text) ? text.split(/^\s*---+\s*$/m) : text.split(/\n{2,}/);
    return chunks.map((c) => c.trim()).filter(Boolean);
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (fmt === "lines") return lines;

  if (fmt === "colon") {
    return lines.map((l) => {
      const i = l.indexOf(":");
      if (i < 1) return l;
      const rest = l.slice(i + 1).trim();
      const parts = rest.split(":");
      return fmtPairs([
        ["Email", l.slice(0, i)],
        ["Password", parts[0] ?? ""],
        ["Note", parts.slice(1).join(":")],
      ]);
    });
  }

  if (fmt === "pipe") {
    return lines.map((l) => {
      const p = l.split("|").map((x) => x.trim());
      if (p.length === 1) return p[0]!;
      return fmtPairs([
        ["Email", p[0] ?? ""],
        ["Password", p[1] ?? ""],
        ["Note", p.slice(2).join(" | ")],
      ]);
    });
  }

  // csv
  const firstCols = (lines[0] ?? "").split(",").map((c) => c.trim().toLowerCase());
  const hasHeader = firstCols.some((c) => ["email", "user", "username", "password", "pass", "code", "note", "pin"].includes(c));
  const header = hasHeader ? (lines[0] ?? "").split(",").map((c) => title(c)) : [];
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows
    .map((l) => {
      const cols = l.split(",").map((c) => c.trim());
      if (cols.length === 1) return cols[0]!;
      const labels = header.length ? header : ["Email", "Password", "Note", "Extra"];
      return fmtPairs(cols.map((c, i) => [labels[i] ?? `Field ${i + 1}`, c]));
    })
    .filter(Boolean);
}

export const MANUAL_NOTE_PREFIX = "manual_note_";
