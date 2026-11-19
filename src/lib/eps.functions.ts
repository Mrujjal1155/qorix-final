import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkoutCustomer } from "@/lib/checkout-customer";

/* Public EPS (Easy Payment System) checkout — bKash, Nagad, Rocket, Visa,
   Mastercard and bank, all on the EPS hosted page. No auth required: the buyer
   is a guest, and the payment itself is verified server-side on return. */

/** Is the local gateway usable, and at what BDT rate? Shown on /checkout. */
export const getEpsStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { epsSettings } = await import("@/lib/eps-settle.server");
    const { epsConfig, EPS_CHANNELS } = await import("@/lib/eps.server");
    const cfg = epsConfig(await epsSettings());
    return { enabled: cfg.enabled, rate: cfg.rate, channels: EPS_CHANNELS };
  } catch (e) {
    console.error("[eps] status unavailable:", e);
    return { enabled: false, rate: 0, channels: [] as string[] };
  }
});

type CheckoutInput = { product_id: string; quantity: number; customer_name?: string; customer_email?: string; customer_phone?: string; };
function validateCheckout(d: CheckoutInput) {
  const pid = String(d.product_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pid)) throw new Error("Invalid product");
  const phone = String(d.customer_phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  if (phone.replace(/\D/g, "").length < 11) throw new Error("A valid Bangladeshi mobile number is required");
  return { product_id: pid, quantity: Math.max(1, Math.min(100000, Math.floor(Number(d.quantity) || 1))), customer_name: String(d.customer_name ?? ""), customer_email: String(d.customer_email ?? ""), customer_phone: phone };
}

export const startEpsCheckout = createServerFn({ method: "POST" })
  .inputValidator(validateCheckout)
  .handler(async ({ data }) => {
    const { createEpsCheckout } = await import("@/lib/eps-checkout.server");
    return createEpsCheckout({ ...data, ...checkoutCustomer(null, data) });
  });

export const startConnectedEpsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCheckout)
  .handler(async ({ data, context }) => {
    const { connectedCheckoutCustomer } = await import("@/lib/checkout-customer.server");
    const customer = await connectedCheckoutCustomer(context.userId);
    const { createEpsCheckout } = await import("@/lib/eps-checkout.server");
    return createEpsCheckout({ ...data, ...customer });
  });
