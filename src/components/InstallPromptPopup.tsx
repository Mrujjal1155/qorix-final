import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useT } from "@/lib/i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install_prompt_dismissed_at";
/** Once closed, stay quiet for this long before asking again. */
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
/** Wait a little after page load so it doesn't pop instantly. */
const SHOW_DELAY_MS = 6000;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Occasional "install our app" popup. Shows at most once every 3 days,
 * never when the app is already installed, and stays closed once installed.
 */
export function InstallPromptPopup() {
  const t = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const timer = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(timer);
    };
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          close();
          return;
        }
      } catch {
        /* ignore */
      }
      setDeferred(null);
    } else {
      // No native prompt available (iOS/Safari etc.) — show manual steps.
      setHint(true);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={t("Install App")}
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/40 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0"
    >
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <img
          src="/app-icon-192.png"
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl border border-border/60"
        />
        <div className="min-w-0 pr-4">
          <p className="text-sm font-semibold text-foreground">{t("Install our app")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t("Add QORIX to your home screen for faster access and one-tap ordering.")}
          </p>
        </div>
      </div>

      {hint ? (
        <p className="mt-3 rounded-lg border border-border bg-secondary/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
          <Share className="mr-1 inline h-3.5 w-3.5" />
          {t("iPhone/iPad: open in Safari, tap Share, then \"Add to Home Screen\".")}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={install}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          {t("Install App")}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {t("Not now")}
        </button>
      </div>
    </div>
  );
}
