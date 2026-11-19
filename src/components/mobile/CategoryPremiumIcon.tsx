import { useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { CategoryPremiumMedia } from "@/lib/category-premium-media";
import { premiumAssetUrl } from "@/lib/premium-asset-url";

/** Load the browser-only animation player after hydration; keep the icon footprint fixed. */
export function CategoryPremiumIcon({ media }: { media: CategoryPremiumMedia }) {
  const container = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const url = premiumAssetUrl(media.url);
  useEffect(() => {
    if (media.kind !== "lottie") return;
    const node = container.current;
    if (!node) return;
    let stopped = false;
    let dispose: (() => void) | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.all([import("lottie-web"), fetch(url, { credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error("Icon unavailable");
      return r.json();
    })]).then(([{ default: lottie }, animationData]) => {
      if (stopped) return;
      const animation = lottie.loadAnimation({ container: node, renderer: "svg", loop: true, autoplay: !reduced.matches, animationData });
      const change = () => reduced.matches ? animation.goToAndStop(0, true) : animation.play();
      reduced.addEventListener("change", change);
      animation.addEventListener("data_failed", () => setFailed(true));
      dispose = () => { reduced.removeEventListener("change", change); animation.destroy(); };
    }).catch(() => { if (!stopped) setFailed(true); });
    return () => { stopped = true; dispose?.(); };
  }, [url, media.kind]);
  return <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
    {failed ? <LayoutGrid className="h-5 w-5" />
      : media.kind === "lottie" ? <span ref={container} className="block h-8 w-8" />
      : media.kind === "video" ? <video src={url} muted autoPlay loop playsInline className="h-8 w-8 object-contain" onError={() => setFailed(true)} />
      : <img src={url} alt="" className="h-8 w-8 object-contain" onError={() => setFailed(true)} />}
  </span>;
}