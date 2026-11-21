import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { previewBotWebsiteLogin, claimTelegramLogin } from "@/lib/telegram-login.functions";
import { parseTelegramLoginFragment, telegramWebsiteDestination } from "@/lib/telegram-website-login";
import { supabase } from "@/integrations/supabase/client";

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
  const destination = useRef<"/" | "/account">("/");
  const initialized = useRef(false);
  const busy = useRef(false);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "connecting" | "invalid">("loading");
  const [message, setMessage] = useState("Checking your secure link…");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    credentials.current = parseTelegramLoginFragment(window.location.hash);
    destination.current = telegramWebsiteDestination(new URLSearchParams(window.location.search).get("next"));
    // Never persist the bearer link in browser storage, history or outgoing referrers.
    window.history.replaceState(window.history.state, "", window.location.pathname);
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
      await router.invalidate();
      await router.navigate({ to: destination.current });
    } catch {
      setState("invalid"); setMessage("Sign-in could not finish. Open a fresh website link from the bot.");
    } finally { busy.current = false; }
  };

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
        {state === "invalid" && <Button asChild className="bg-tg-btn text-tg-btn-fg"><Link to="/telegram-bot">Open Telegram bot</Link></Button>}
        <Button variant="ghost" disabled={state === "connecting"} onClick={cancel}>Not you? Cancel</Button>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-tg-muted"><LockKeyhole className="h-4 w-4 shrink-0" />One-time link · expires in 10 minutes · never share it</p>
      </DialogContent>
    </Dialog>
  </main>;
}