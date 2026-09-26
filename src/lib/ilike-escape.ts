/** Escape LIKE wildcards so ilike does an exact case-insensitive match. */
export function likeExact(v: string): string {
  return String(v ?? "").replace(/[\\%_]/g, (c) => `\\${c}`);
}
