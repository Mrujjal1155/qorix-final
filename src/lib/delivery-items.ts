/** Split saved delivery text into individual accounts (items are stored joined by a "---" line). */
export function deliveryItems(content: string | null | undefined): string[] {
  return String(content ?? "")
    .split(/\r?\n-{3,}\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Bot rule: up to 5 items are shown one by one; 6 or more come as a single TXT file. */
export const SINGLE_ITEM_LIMIT = 5;
export function showItemsSingly(count: number): boolean {
  return count > 0 && count <= SINGLE_ITEM_LIMIT;
}

export function deliveryTxt(items: string[]): string {
  return items.join("\n\n---\n\n") + "\n";
}
