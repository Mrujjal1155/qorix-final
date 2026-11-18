import type { ReactNode } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronLeft, Copy, Headphones, KeyRound, Share2, Bot, Wallet as WalletIcon } from "lucide-react";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Key, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { productionUrlFor } from "@/lib/site-url";

type Sec = { id: string; title: string; text: string; code?: string };

const sections = (base: string): Sec[] => [
  { id: "start", title: "1. Quick start", text: "1) Apply in the Reseller portal and wait for approval.\n2) Copy your API key from the Dashboard.\n3) Top up your wallet.\n4) Call the API from your server — orders are paid from your wallet and delivered instantly." },
  { id: "base", title: "2. Base URL", text: "Use exactly this URL. No www and no slash at the end.", code: base },
  { id: "auth", title: "3. Authentication", text: "Send your key in every request header. Keep the key on your server only — never in browser code or a public repo.", code: "Authorization: Bearer YOUR_API_KEY\nContent-Type: application/json" },
  { id: "me", title: "4. GET /me — account & balance", text: "Returns your account, discount and current wallet balance.", code: `curl ${base}/me \\\n  -H "Authorization: Bearer YOUR_API_KEY"` },
  { id: "products", title: "5. GET /products — catalogue", text: "Full catalogue with YOUR price, stock and in_stock flag. Add ?channel=website or ?channel=bot. Cache for 1–5 minutes. GET /products/:id returns one product.", code: `curl "${base}/products?channel=website" \\\n  -H "Authorization: Bearer YOUR_API_KEY"` },
  { id: "order", title: "6. POST /orders — buy", text: "Debits your wallet and returns the order. If status is completed, items holds the delivered accounts. Use a unique external_ref per order so retries never double-buy. Confirm your own customer's payment BEFORE calling this.", code: `curl -X POST ${base}/orders \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"product_id":"PRODUCT_ID","quantity":1,"channel":"website","external_ref":"my-1001","customer_name":"John"}'` },
  { id: "status", title: "7. GET /orders & /orders/:id", text: "Order history and one order's status/delivery. If an order is pending, keep the same order ID and check again (max once per 30 s). Show completed only when status is completed and items is not empty. Never place a replacement order." },
  { id: "errors", title: "8. Errors", text: "401 — wrong key or account not approved.\n402 — not enough wallet balance (top up).\n404 — product not found / disabled.\n409 delivery_failed — delivery failed, your wallet is refunded once.\n503 — temporary, try again later." },
  { id: "fix", title: "9. Connection problems", text: "\"Invalid redirect value … use manual\" or \"fetch failed\": use the exact Base URL (no www, no trailing slash) and redirect: \"manual\" or no redirect option in fetch." },
  { id: "js", title: "10. JavaScript helper", text: "Copy into your server code (Node / Next.js / Worker).", code: `const BASE = "${base}";\nexport async function qorix(path, options = {}) {\n  const res = await fetch(BASE + path, {\n    ...options,\n    headers: {\n      Authorization: "Bearer " + process.env.QORIX_API_KEY,\n      "Content-Type": "application/json",\n      ...(options.headers || {}),\n    },\n  });\n  return res.json();\n}` },
  { id: "live", title: "11. Go-live checklist", text: "• Key in server environment variables only\n• Unique external_ref on every order\n• Save every order and delivered items on your side\n• Customer paid before calling /orders\n• Low-balance alert so sales never fail with 402" },
];

function toText(base: string, url: string) {
  return `QORIX Reseller API documentation\nShare link: ${url}\n\n` + sections(base).map((s) => `## ${s.title}\n${s.text}${s.code ? `\n\n\`\`\`\n${s.code}\n\`\`\`` : ""}`).join("\n\n");
}

function Block({ s, onCopy }: { s: Sec; onCopy: (v: string) => void }) {
  return (
    <Bubble className="w-full scroll-mt-20">
      <div id={`doc-${s.id}`} className="font-bold">{s.title}</div>
      <p className="mt-1 whitespace-pre-line text-sm">{s.text}</p>
      {s.code && (
        <div className="mt-2 rounded-md bg-tg-quote">
          <pre className="max-w-full overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed">{s.code}</pre>
          <button type="button" onClick={() => onCopy(s.code!)} className="flex w-full items-center justify-center gap-1.5 border-t border-tg-bubble-fg/10 py-1.5 text-xs font-semibold text-tg-link"><Copy className="h-3.5 w-3.5" /> Copy</button>
        </div>
      )}
    </Bubble>
  );
}

export function BotApiDocs({ base }: { base: string }): ReactNode {
  const url = productionUrlFor("/reseller/docs");
  const copy = (v: string, msg = "Copied") => { void navigator.clipboard.writeText(v); toast.success(msg); };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "QORIX Reseller API", url }); return; } catch { /* cancelled */ } }
    copy(url, "Link copied");
  };
  const list = sections(base);
  const go = (id: string) => document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <BotFrame>
      <div className="mb-1 self-end rounded-2xl rounded-br-md bg-tg-header px-3 py-1.5 text-sm text-tg-link shadow-sm">API docs</div>
      <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Bubble className="w-full">
          <Title>API DOCS</Title>
          <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
          <p className="text-sm">Sell the full QORIX catalogue from your own website or Telegram bot. Scroll to read everything, or share this page with a developer or any AI tool.</p>
          <Quote><p className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-tg-link" /><b>Contents</b></p></Quote>
          <div className="mt-1 flex flex-col">
            {list.map((s) => <button key={s.id} type="button" onClick={() => go(s.id)} className="py-0.5 text-left text-sm text-tg-link">{s.title}</button>)}
          </div>
        </Bubble>
        <Keys cols={2}>
          <Key icon={Share2} onClick={share}>Share link</Key>
          <Key tone="green" icon={Bot} onClick={() => copy(toText(base, url), "Full docs copied — paste into any AI")}>Copy for AI</Key>
        </Keys>
        {list.map((s) => <Block key={s.id} s={s} onCopy={copy} />)}
        <Keys cols={2}>
          <KeyLink tone="green" icon={KeyRound} to="/reseller">Get API key</KeyLink>
          <KeyLink tone="green" icon={Headphones} to="/contact">Support</KeyLink>
        </Keys>
        <Keys cols={2}>
          <KeyLink icon={WalletIcon} to="/reseller">Reseller portal</KeyLink>
          <KeyLink tone="red" icon={ChevronLeft} to="/">Main Menu</KeyLink>
        </Keys>
      </div>
    </BotFrame>
  );
}
