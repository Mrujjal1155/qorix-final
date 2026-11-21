import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LockKeyhole, RefreshCw, Send, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { previewBotWebsiteLogin, claimTelegramLogin } from "@/lib/telegram-login.functions";
import { parseTelegramLoginFragment, telegramConsentReturnPath, telegramWebsiteDestination, type TelegramWebsiteDestination } from "@/lib/telegram-website-login";
import { supabase } from "@/integrations/supabase/client";
import { BotFrame, useMobileTemplate } from "@/components/mobile/BotFrame";
import { Bubble, Key, Keys, TelegramConnect } from "@/components/mobile/BotStorefront";

export const Route = createFileRoute("/tg")({
  head: () => ({ meta: [
    { title: "Connect Telegram — QORIX Store" },
    { name: "description", content: "Securely connect your Telegram account to QORIX Store." },
    { property: "og:title", content: "Connect Telegram — QORIX Store" },
    { property: "og:description", content: "Confirm your Telegram account to access your QORIX wallet and orders." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
    { name: "referrer", content: "no-referrer" },
  ] }),
  component: TelegramWebsiteConsent,
});

function TelegramWebsiteConsent() {
  const router = useRouter();
  const preview = useServerFn(previewBotWebsiteLogin);
  const claim = useServerFn(claimTelegramLogin);
  const credentials = useRef<ReturnType<typeof parseTelegramLoginFragment>>(null);
  const destination = useRef<TelegramWebsiteDestination>("/");
  const initialized = useRef(false);
  const busy = useRef(false);
  const mobile = useMobileTemplate();
  const [reconnecting, setReconnecting] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "connecting" | "invalid">("loading");
  const [message, setMessage] = useState("Checking your secure link…");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    credentials.current = parseTelegramLoginFragment(window.location.hash);
    destination.current = telegramWebsiteDestination(new URLSearchParams(window.location.search).get("next"));
    // Never persist the bearer link in browser storage, history or outgoing referrers.
    window.history.replaceState(window.history.state, "", telegramConsentReturnPath(destination.current));
    const data = credentials.current;
    if (!data) { setState("invalid"); setMessage("This link is missing or no longer valid."); return; }
    preview({ data }).then(result => {
      if (result.status !== "ok") { setState("invalid"); setMessage("This link expired or was already used."); return; }
      setName(result.name); setState("ready");
    }).catch(() => { setState("invalid"); setMessage("Could not verify this link. Please open a fresh link from the bot."); });
  }, [preview]);

  const cancel = () => {
    if (busy.current) return;
    credentials.current = null;
    void router.navigate({ to: "/" });
  };
  const continueShopping = async () => {
    await router.invalidate();
    const next = destination.current;
    const target = new URL(next, window.location.origin);
    if (target.pathname === "/checkout") {
      await router.navigate({ to: "/checkout", search: { id: target.searchParams.get("id") ?? "", qty: Number(target.searchParams.get("qty")), step: target.searchParams.get("step") === "pay" ? "pay" : "details" } });
    } else if (next.startsWith("/store/")) {
      await router.navigate({ to: "/store/$id", params: { id: target.pathname.slice("/store/".length) }, search: target.searchParams.get("stage") === "quantity" ? { stage: "quantity", qty: Number(target.searchParams.get("qty")) } : {} });
    } else if (next === "/account?deposit=1") {
      await router.navigate({ to: "/account", search: { deposit: true } });
    } else {
      await router.navigate({ to: next === "/account" ? "/account" : next === "/store" ? "/store" : "/" });
    }
  };
  const connect = async () => {
    const data = credentials.current;
    if (!data || state !== "ready" || busy.current) return;
    busy.current = true; setState("connecting"); setMessage("Connecting your Telegram account…");
    try {
      const result = await claim({ data });
      if (result.status !== "ok") throw new Error("Login unavailable");
      const { error } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: "magiclink" });
      if (error) throw error;
      credentials.current = null;
      await continueShopping();
    } catch {
      setState("invalid"); setMessage("Sign-in could not finish. Open a fresh website link from the bot.");
    } finally { busy.current = false; }
  };

  if (mobile) return <BotFrame onBack={cancel} onMenu={cancel}>
    {reconnecting ? <TelegramConnect onDone={() => void continueShopping()} onBack={() => setReconnecting(false)} /> : <>
      <Bubble>
        <p className="flex items-center gap-2 text-lg font-bold"><Send className="h-5 w-5 shrink-0 text-tg-link" />{name && state !== "invalid" ? `Continue as ${name}` : "Connect Telegram"}</p>
        <p className="mt-3 text-sm">{state === "ready" ? "Connect this Telegram account to QORIX Store — same wallet, balance and orders." : message}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-tg-muted"><LockKeyhole className="h-4 w-4 shrink-0" />One-time link · expires in 10 minutes</p>
      </Bubble>
      <Keys cols={1}>
        {(state === "ready" || state === "connecting") && <Key tone="green" icon={ShieldCheck} disabled={state === "connecting"} onClick={() => void connect()}>{state === "connecting" ? "Connecting…" : `Connect as ${name}`}</Key>}
        {state === "invalid" && <Key icon={RefreshCw} onClick={() => { credentials.current = null; setReconnecting(true); }}>Reconnect Telegram</Key>}
        <Key icon={Store} disabled={state === "connecting"} onClick={() => void continueShopping()}>Continue shopping</Key>
        <Key tone="red" icon={ArrowLeft} disabled={state === "connecting"} onClick={cancel}>Main Menu</Key>
      </Keys>
    </>}
  </BotFrame>;

  if (reconnecting) return <main className="min-h-dvh bg-tg-chat p-4 text-tg-bubble-fg"><div className="mx-auto flex max-w-md flex-col gap-2"><TelegramConnect onDone={() => void continueShopping()} onBack={() => setReconnecting(false)} /></div></main>;

  return <main className="min-h-dvh bg-tg-chat text-tg-bubble-fg">
    <div className="px-5 py-5 text-lg font-bold">QORIX Store</div>
    <Dialog open onOpenChange={open => { if (!open) cancel(); }}>
      <DialogContent className="border-border bg-tg-bubble text-tg-bubble-fg" onEscapeKeyDown={e => { if (busy.current) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-tg-btn text-tg-btn-fg"><Send className="h-8 w-8" /></div>
        <DialogTitle className="break-words text-center text-xl leading-snug">{name ? `Continue as ${name}` : "Connect Telegram"}</DialogTitle>
        <DialogDescription className="text-center text-tg-muted">
          {state === "ready" ? "Connect this Telegram account to QORIX Store — same wallet, balance and orders." : message}
        </DialogDescription>
        {(state === "ready" || state === "connecting") && <Button className="h-auto min-h-12 w-full whitespace-normal bg-tg-btn text-tg-btn-fg hover:bg-tg-btn/90" disabled={state === "connecting"} onClick={() => void connect()}><ShieldCheck className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{state === "connecting" ? "Connecting…" : `Connect as ${name}`}</span></Button>}
        {state === "invalid" && <Button className="bg-tg-btn text-tg-btn-fg" onClick={() => { credentials.current = null; setReconnecting(true); }}><RefreshCw className="h-4 w-4" />Reconnect Telegram</Button>}
        {state === "invalid" && <Button variant="outline" onClick={() => void continueShopping()}><Store className="h-4 w-4" />Continue shopping</Button>}
        <Button variant="ghost" disabled={state === "connecting"} onClick={cancel}>Not you? Cancel</Button>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-tg-muted"><LockKeyhole className="h-4 w-4 shrink-0" />One-time link · expires in 10 minutes · never share it</p>
      </DialogContent>
    </Dialog>
  </main>;
}