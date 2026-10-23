import { z } from "zod";

export const stockExportInput = z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(1000) });
export const stockDeleteInput = z.object({ export_id: z.string().uuid() });
export type StockExport = { export_id: string; items: { id: string; content: string }[] };

export function stockExportText(items: StockExport["items"]) {
  return items.map((item) => item.content).join("\n\n");
}