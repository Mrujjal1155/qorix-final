import { useState } from "react";

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
 * Fast image: native lazy-loading + async decoding + soft fade-in.
 * No skeleton / placeholder box — the image itself is the placeholder.
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

  if (!src) {
    const initial = (alt || "?").trim().charAt(0).toUpperCase();
    return (
      <span
        className={`${className} flex items-center justify-center bg-gradient-to-br from-primary/20 to-chart-4/20 text-3xl font-extrabold text-primary`}
        aria-label={alt}
      >
        {initial}
      </span>
    );
  }

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
      onError={() => setLoaded(true)}
      className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
