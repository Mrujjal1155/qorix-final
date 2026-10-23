import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stockExportInput, stockDeleteInput, type StockExport } from "@/lib/stock-extraction";

export const exportUnsoldStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { product_id: string; quantity: number }) => stockExportInput.parse(input))
  .handler(async ({ data, context }): Promise<StockExport> => {
    const { runStockExtraction } = await import("@/lib/stock-extraction.server");
    return runStockExtraction(context, "export", { _product_id: data.product_id, _quantity: data.quantity });
  });

export const deleteExportedStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { export_id: string }) => stockDeleteInput.parse(input))
  .handler(async ({ data, context }): Promise<{ deleted: number; already_deleted: boolean }> => {
    const { runStockExtraction } = await import("@/lib/stock-extraction.server");
    return runStockExtraction(context, "delete", { _export_id: data.export_id });
  });