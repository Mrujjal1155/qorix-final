import { z } from "zod";

export const categoryNameSchema = z.string().trim().min(1, "Enter a category name").max(150, "Name must be 150 characters or fewer");
export const categorySaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: categoryNameSchema,
  emoji: z.string().max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
  channel: z.enum(["both", "telegram", "website"]).optional(),
  image_url: z.string().trim().max(2048).refine((v) => !v || /^https?:\/\//i.test(v), "Use an HTTP or HTTPS image URL").nullable().optional(),
});
export const categoryOrderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000).refine((ids) => new Set(ids).size === ids.length, "Duplicate categories are not allowed"),
});

export function moveCategoryToPosition(ids: string[], id: string, value: string): string[] {
  if (!/^\d+$/.test(value.trim())) throw new Error(`Enter a serial from 1 to ${ids.length}`);
  const position = Number(value);
  if (!Number.isSafeInteger(position) || position < 1 || position > ids.length) throw new Error(`Enter a serial from 1 to ${ids.length}`);
  if (!ids.includes(id)) throw new Error("Category no longer exists");
  const reordered = ids.filter((entry) => entry !== id);
  reordered.splice(position - 1, 0, id);
  return reordered;
}