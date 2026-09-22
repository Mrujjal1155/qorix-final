import { useEffect, useState } from "react";
import { getBrandMark, setBrandMark } from "@/lib/brand-mark";

/**
 * Renders the current site logo — always the image uploaded in admin
 * (Website content → Brand logo). The last known URL is cached in
 * localStorage so the real logo shows instantly while fresh content loads.
 * Nothing is bundled in the code, so there is no old logo to fall back to.
 */
export function BrandLogo({
  src,
  name,
  className,
  textClassName,
}: {
  src?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  textClassName?: string | undefined;
}) {
  const [cached, setCached] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const clean = (src || "").trim();
    if (clean) {
      setBrandMark(clean);
      setFailed(false);
      setCached("");
      return;
    }
    setCached(getBrandMark());
  }, [src]);

  const label = (name ?? "").trim();
  const effective = (src || "").trim() || cached;

  if (!effective || failed) {
    return <span className={textClassName || "font-semibold"}>{label || "QORIX STORE"}</span>;
  }

  return (
    <img
      src={effective}
      alt={label ? `${label} logo` : "QORIX STORE logo"}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
