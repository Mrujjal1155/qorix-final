type AdminContext = {
  userId: string;
  supabase: { rpc: (name: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown; error: unknown }> };
};

export async function runStockExtraction(context: AdminContext, operation: "export" | "delete", args: Record<string, unknown>) {
  const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (roleError || !admin) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc(
    operation === "export" ? "admin_export_unsold_stock" : "admin_delete_exported_stock",
    { ...args, _admin_user_id: context.userId },
  );
  if (error) {
    const safeErrors = [
      "Not enough available accounts. Refresh and try again.",
      "Only admin in-house stock can be exported",
      "Only admin in-house stock can be deleted",
      "Export not found",
      "Export expired. Export again before deleting.",
      "An exported account was sold, removed or is being processed. Nothing was deleted. Export again.",
    ];
    throw new Error(safeErrors.includes(error.message) ? error.message : "Stock operation failed. Refresh and try again.");
  }
  return data;
}