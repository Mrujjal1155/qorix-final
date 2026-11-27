/** Per-product buyer input fields (email / username / phone / text). Pure and
 * shared by the admin editor, API discovery and order validation before charge. */
export type CustomerInputType = "email" | "username" | "phone" | "text";
export type CustomerInputField = { key: string; label: string; type: CustomerInputType; required: boolean };

const TYPES: CustomerInputType[] = ["email", "username", "phone", "text"];
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** Returns the clean field list and whether the stored configuration is valid. */
export function normalizeInputFields(raw: unknown): { fields: CustomerInputField[]; valid: boolean } {
  if (raw == null) return { fields: [], valid: true };
  if (!Array.isArray(raw) || raw.length > 10) return { fields: [], valid: false };
  const fields: CustomerInputField[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== "object") return { fields: [], valid: false };
    const r = f as Record<string, unknown>;
    const key = typeof r["key"] === "string" ? r["key"].trim() : "";
    const label = typeof r["label"] === "string" ? r["label"].trim().slice(0, 80) : "";
    const type = r["type"] as CustomerInputType;
    if (!KEY_RE.test(key) || !label || !TYPES.includes(type) || seen.has(key)) return { fields: [], valid: false };
    seen.add(key);
    fields.push({ key, label, type, required: r["required"] !== false });
  }
  return { fields, valid: true };
}

// Control and bidi-override characters are never accepted in buyer text.
const UNSAFE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function cleanInputValue(type: CustomerInputType, value: string): string | null {
  const v = value.trim();
  if (type === "email") return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
  if (type === "username") {
    const u = v.replace(/^@/, "");
    return /^[A-Za-z0-9_.]{3,32}$/.test(u) ? u : null;
  }
  if (type === "phone") {
    const p = v.replace(/\s+/g, "");
    return /^\+?\d{7,15}$/.test(p) ? p : null;
  }
  return v.length <= 200 && !UNSAFE.test(v) ? v : null;
}

/**
 * Validates buyer inputs against the product fields. For a product with a
 * single email field, `{ email }` or a top-level email is accepted too.
 */
export function validateCustomerInputs(
  fields: CustomerInputField[],
  inputs: unknown,
  topLevelEmail?: string | null,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  if (inputs != null && (typeof inputs !== "object" || Array.isArray(inputs))) return { ok: false, error: "customer_inputs must be an object" };
  const given: Record<string, unknown> = { ...((inputs as Record<string, unknown>) ?? {}) };
  const emailFields = fields.filter((f) => f.type === "email");
  const single = emailFields.length === 1 ? emailFields[0] : undefined;
  if (single && given[single.key] === undefined) {
    const alias = given["email"] ?? topLevelEmail;
    if (alias !== undefined && alias !== null) given[single.key] = alias;
    if (single.key !== "email") delete given["email"];
  }
  const known = new Set(fields.map((f) => f.key));
  for (const k of Object.keys(given)) if (!known.has(k)) return { ok: false, error: `Unknown customer_inputs key: ${k}` };
  const values: Record<string, string> = {};
  for (const f of fields) {
    const raw = given[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) return { ok: false, error: `${f.key} is required` };
      continue;
    }
    if (typeof raw !== "string") return { ok: false, error: `${f.key} must be a string` };
    const clean = cleanInputValue(f.type, raw);
    if (clean === null) return { ok: false, error: `${f.key} is not a valid ${f.type}` };
    values[f.key] = clean;
  }
  return { ok: true, values };
}
