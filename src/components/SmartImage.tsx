import { useEffect, useState } from "react";
import brandMark from "@/assets/qorix-shop-logo-new.png";

type Props = {
  src?: string | null | undefined;
  alt: string;
  className?: string;
  /** Above-the-fold images load immediately; everything else is lazy. */
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
};

/**
 * The one placeholder used across the whole site: our own brand mark on a soft
 * brand gradient. Shown whenever a picture is missing or fails to load, so a
 * broken-image icon or a generic placeholder can never appear.
 */
export function BrandImageFallback({ className = "", alt }: { className?: string; alt?: string }) {
  return (
    <span
      className={`${className} flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-background to-chart-4/15`}
      role="img"
      aria-label={alt || "QORIX STORE"}
    >
      <img
        src={brandMark}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="h-3/5 w-3/5 max-h-full max-w-full object-contain opacity-80"
      />
    </span>
  );
}

/**
 * Swap any plain <img> to the brand placeholder when its source fails, without
 * changing the surrounding layout. Used by the few images that are not
 * rendered through <SmartImage />.
 */
export function brandFallbackOnError(event: { currentTarget: HTMLImageElement }) {
  const el = event.currentTarget;
  if (el.dataset["brandFallback"] === "1") return;
  el.dataset["brandFallback"] = "1";
  el.src = brandMark;
  el.style.objectFit = "contain";
}

/** Decorative images (payment banners, icons) simply disappear when missing. */
export function hideOnError(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.style.display = "none";
}

/**
 * Fast image: native lazy-loading + async decoding + soft fade-in, with our
 * brand placeholder as the fallback for a missing or failing source.
 */
export function SmartImage({
  src,
  alt,
  className = "",
  priority = false,
  sizes,
  width,
  height,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new source gets a fresh chance to load.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) return <BrandImageFallback className={className} alt={alt} />;

  return (
    <img
      src={src}
      alt={alt}
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
      {...(sizes ? { sizes } : {})}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "low"}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
