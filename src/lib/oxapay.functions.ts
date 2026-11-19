import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkoutCustomer } from "@/lib/checkout-customer";

/** Public: is OxaPay usable on the website checkout? (never returns the key) */
export const getOxapayStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { oxapaySettings } = await import("@/lib/oxapay-settle.server");
    const { oxapayEnabled } = await import("@/lib/oxapay.server");
    return { enabled: oxapayEnabled(await oxapaySettings()) };
  } catch (e) {
    console.error("[oxapay] status unavailable:", e);
    return { enabled: false };
  }
});

type CheckoutInput = { product_id: string; quantity: number; customer_name?: string; customer_email?: string;  };
function validateCheckout(d: CheckoutInput) {
  const pid = String(d.product_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pid)) throw new Error("Invalid product");
  return { product_id: pid, quantity: Math.max(1, Math.min(100000, Math.floor(Number(d.quantity) || 1))), customer_name: String(d.customer_name ?? ""), customer_email: String(d.customer_email ?? "") };
}

export const startOxapayCheckout = createServerFn({ method: "POST" })
  .inputValidator(validateCheckout)
  .handler(async ({ data }) => {
    const { createOxapayCheckout } = await import("@/lib/oxapay-checkout.server");
    return createOxapayCheckout({ ...data, ...checkoutCustomer(null, data) });
  });

export const startConnectedOxapayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCheckout)
  .handler(async ({ data, context }) => {
    const { connectedCheckoutCustomer } = await import("@/lib/checkout-customer.server");
    const customer = await connectedCheckoutCustomer(context.userId);
    const { createOxapayCheckout } = await import("@/lib/oxapay-checkout.server");
    return createOxapayCheckout({ ...data, ...customer });
  });
