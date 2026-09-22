import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useT } from "@/lib/i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton({ className }: { className?: string }) {
  const t = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        // ignore
      }
      setDeferred(null);
    } else {
      setHint(true);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        <Download className="h-4 w-4" />
        {t("Install App")}
      </button>
      {hint ? (
        <div className="mt-3 max-w-xs rounded-lg border border-border bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <button
            type="button"
            aria-label={t("Close")}
            onClick={() => setHint(false)}
            className="float-right -mr-1 -mt-1 ml-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
            <Share className="h-3.5 w-3.5" /> {t("How to install")}
          </span>
          {t("Computer or Android: open this site in Chrome and choose \"Install app\". iPhone/iPad: open in Safari, tap Share, then \"Add to Home Screen\".")}
        </div>
      ) : null}
    </div>
  );
}
