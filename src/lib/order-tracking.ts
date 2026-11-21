import { z } from "zod";

export const trackingInput = z.object({
  query: z.string().trim().min(1).max(160),
  token: z.string().max(64).optional(),
});

export function trackingQuery(value: string): { kind: "number" | "code" | "email"; value: string } {
  const query = value.trim().replace(/^#/, "");
  if (/^[1-9][0-9]{0,11}$/.test(query)) return { kind: "number", value: query };
  if (/^(ORD-[a-f0-9]{8}|QX-[a-z0-9]{4,32})$/i.test(query)) return { kind: "code", value: query.toUpperCase() };
  if (z.string().email().max(160).safeParse(query).success) return { kind: "email", value: query.toLowerCase() };
  throw new Error("Enter a valid order ID or email.");
}

export type TrackingResult = {
  order_no: number; order_code: string; status: string; locked: boolean;
  product_name: string | null; quantity: number | null; total: number | null;
  delivered_content: string | null;
};

export function trackingProjection(row: { order_no: number; order_code: string; status: string; product_name: string; quantity: number; total: number; delivered_content: string | null }, owner: boolean): TrackingResult {
  return { order_no: row.order_no, order_code: row.order_code, status: row.status, locked: !owner,
    product_name: owner ? row.product_name : null, quantity: owner ? row.quantity : null,
    total: owner ? row.total : null, delivered_content: owner ? row.delivered_content : null };
}