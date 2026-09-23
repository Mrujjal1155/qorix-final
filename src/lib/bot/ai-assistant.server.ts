/**
 * Telegram AI product assistant.
 *
 * Runs only for free-text messages that no existing command, button or state
 * machine step already handled. The AI never queries the database itself: it
 * only sees the rows `searchProducts` returns, so it can never invent a price,
 * a plan or a stock figure.
 */
import { listCategories, searchProducts, type ProductHit } from "./product-search.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Compact, AI-readable snapshot of the products we found. */
function productFacts(hits: ProductHit[]): string {
  return hits
    .map((p, i) => {
      const bits = [
        `${i + 1}. ${p.name}`,
        p.category ? `category: ${p.category}` : "",
        `price: ${money(p.price)}`,
        p.old_price && p.old_price > p.price ? `old price: ${money(p.old_price)}` : "",
        p.delivery_time ? `delivery: ${p.delivery_time}` : "",
        p.delivery_type === "manual" ? "delivery: manual" : "",
        p.available == null ? "stock: made to order" : `stock: ${p.available}`,
        p.in_stock ? "status: available" : "status: out of stock",
        p.badge ? `badge: ${p.badge}` : "",
        p.description ? `info: ${String(p.description).replace(/\s+/g, " ").slice(0, 300)}` : "",
      ].filter(Boolean);
      return bits.join(" | ");
    })
    .join("\n");
}

const SYSTEM = [
  "You are the product assistant of a Telegram store bot.",
  "Answer in natural, simple, friendly Bengali (Bangla script), professional tone, short but informative.",
  "Keep product names, plan names and prices in their original English/number form.",
  "Use at most 2-3 emoji. Plain text only — no markdown, no HTML tags, no links.",
  "CRITICAL: use ONLY the product data given in the PRODUCT DATA block. Never invent or guess a price, stock, plan, duration or feature.",
  "If the PRODUCT DATA block is empty or does not contain what the customer asked about, reply exactly:",
  "দুঃখিত ভাই, এই product-এর current information আমাদের database-এ পাওয়া যাচ্ছে না।",
  "If the question is unclear, ask: আপনি কোন product সম্পর্কে জানতে চাচ্ছেন? Product-এর নাম লিখে দিলে আমি current information জানিয়ে দিচ্ছি।",
  "When you list products, show at most 6 with name and price.",
  "End a positive answer by offering order help in one short line.",
  "Never mention databases, AI, tools, or any technical detail.",
].join(" ");

/** Fallback card straight from the database when the AI layer is unavailable. */
function plainAnswer(hits: ProductHit[]): string {
  if (!hits.length) return "দুঃখিত ভাই, এই product-এর current information আমাদের database-এ পাওয়া যাচ্ছে না।";
  const lines = hits.slice(0, 6).map((p) => {
    const stock = p.available == null ? "Available" : p.in_stock ? `In stock (${p.available})` : "Out of stock";
    return `• <b>${escapeHtml(p.name)}</b> — ${money(p.price)} · ${stock}`;
  });
  return `আমাদের কাছে যা আছে:\n\n${lines.join("\n")}\n\nঅর্ডার করতে চাইলে Products বোতামে চাপুন।`;
}

async function askGateway(prompt: string, key: string): Promise<string> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: SYSTEM,
      input: prompt,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }

  // Streaming keeps bytes flowing; we only need the finished text.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw) as any;
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
          else if (evt.type === "response.completed" && !text) text = String(evt.response?.output_text ?? "");
        } catch {
          /* ignore partial frames */
        }
      }
    }
  }
  return text.trim();
}

export type AiReply = { text: string; matched: string[] };

/**
 * Build the answer for one customer question.
 * `recent` holds the last few product names this chat asked about, so a
 * follow-up like "কত টাকা?" still resolves to the right product. Prices and
 * stock are always re-read from the database, never from the conversation.
 */
export async function aiProductReply(question: string, recent: string[] = []): Promise<AiReply | null> {
  const q = question.trim();
  if (!q || q.length > 400) return null;

  let hits = await searchProducts(q, 8);
  if (!hits.length && recent.length) hits = await searchProducts(`${recent.join(" ")} ${q}`, 8);
  const matched = hits.slice(0, 3).map((h) => h.name);

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { text: plainAnswer(hits), matched };

  const categories = hits.length ? [] : await listCategories();
  const prompt = [
    recent.length ? `EARLIER TOPICS IN THIS CHAT: ${recent.join(", ")}` : "",
    "PRODUCT DATA (the only allowed source of facts):",
    hits.length ? productFacts(hits) : "(no matching product found)",
    categories.length ? `AVAILABLE CATEGORIES: ${categories.join(", ")}` : "",
    "",
    `CUSTOMER MESSAGE: ${q}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const answer = await askGateway(prompt, key);
    if (!answer) return { text: plainAnswer(hits), matched };
    return { text: escapeHtml(answer), matched };
  } catch (error) {
    console.error("AI assistant failed:", error);
    return { text: plainAnswer(hits), matched };
  }
}
