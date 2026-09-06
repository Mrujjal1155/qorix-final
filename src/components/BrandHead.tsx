import { useEffect } from "react";
import { useSiteContent } from "@/lib/use-site-content";

/**
 * Applies the admin-configured favicon and social share (OG) image to the
 * document head at runtime. Falls back to the bundled QORIX assets so a
 * placeholder icon is never shown.
 */
function setLink(rel: string, href: string, type?: string) {
  if (typeof document === "undefined") return;
  const selector = `link[rel="${rel}"]`;
  document.querySelectorAll(selector).forEach((el) => el.parentNode?.removeChild(el));
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (type) link.type = type;
  document.head.appendChild(link);
}

function setMeta(attr: "property" | "name", key: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function BrandHead() {
  const { v } = useSiteContent();
  const favicon = (v("site_favicon") || "").trim() || "/favicon.png";
  const appleIcon = (v("site_apple_icon") || "").trim() || favicon;
  const ogImage = (v("site_og_image") || "").trim() || "/og-image.png";

  useEffect(() => {
    const type = favicon.endsWith(".ico") ? "image/x-icon" : favicon.endsWith(".svg") ? "image/svg+xml" : "image/png";
    setLink("icon", favicon, type);
    setLink("shortcut icon", favicon, type);
    setLink("apple-touch-icon", appleIcon);
  }, [favicon, appleIcon]);

  useEffect(() => {
    const abs = ogImage.startsWith("http")
      ? ogImage
      : typeof window !== "undefined"
        ? `${window.location.origin}${ogImage.startsWith("/") ? "" : "/"}${ogImage}`
        : ogImage;
    setMeta("property", "og:image", abs);
    setMeta("name", "twitter:image", abs);
    setMeta("name", "twitter:card", "summary_large_image");
  }, [ogImage]);

  return null;
}
