import type { ReactElement, SVGProps } from "react";

/** Crisp inline-SVG country flags (no emoji dependency, works on every device). */
const FLAGS: Record<string, () => ReactElement> = {
  US: () => (
    <>
      <rect width="20" height="14" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(14 / 13) * i} width="20" height={14 / 13} fill="#B22234" />
      ))}
      <rect width="9" height={14 * (7 / 13)} fill="#3C3B6E" />
      {[1, 2.2, 3.4, 4.6].map((y) =>
        [1.5, 3.5, 5.5, 7.5].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.55" fill="#fff" />
        )),
      )}
    </>
  ),
  BR: () => (
    <>
      <rect width="20" height="14" fill="#009C3B" />
      <path d="M10 1.8 17.6 7 10 12.2 2.4 7Z" fill="#FFDF00" />
      <circle cx="10" cy="7" r="2.6" fill="#002776" />
      <path d="M7.6 6.4a4.8 4.8 0 0 1 4.8.4" stroke="#fff" strokeWidth="0.55" fill="none" />
    </>
  ),
  ES: () => (
    <>
      <rect width="20" height="14" fill="#F1BF00" />
      <rect width="20" height="3.5" fill="#AA151B" />
      <rect y="10.5" width="20" height="3.5" fill="#AA151B" />
    </>
  ),
  IN: () => (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect width="20" height={14 / 3} fill="#FF9933" />
      <rect y={(14 / 3) * 2} width="20" height={14 / 3} fill="#138808" />
      <circle cx="10" cy="7" r="1.7" fill="none" stroke="#000080" strokeWidth="0.5" />
      <circle cx="10" cy="7" r="0.5" fill="#000080" />
    </>
  ),
  PK: () => (
    <>
      <rect width="20" height="14" fill="#01411C" />
      <rect width="5" height="14" fill="#fff" />
      <circle cx="11.8" cy="7" r="3.1" fill="#fff" />
      <circle cx="13" cy="6.3" r="2.7" fill="#01411C" />
      <path d="m14.6 4.1.5 1 1.1.1-.8.8.2 1.1-1-.5-1 .5.2-1.1-.8-.8 1.1-.1Z" fill="#fff" />
    </>
  ),
  BD: () => (
    <>
      <rect width="20" height="14" fill="#006A4E" />
      <circle cx="8.8" cy="7" r="3.9" fill="#F42A41" />
    </>
  ),
  NG: () => (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect width={20 / 3} height="14" fill="#008751" />
      <rect x={(20 / 3) * 2} width={20 / 3} height="14" fill="#008751" />
    </>
  ),
  SA: () => (
    <>
      <rect width="20" height="14" fill="#006C35" />
      <path d="M5 5.2h10M5 6.6h7.5" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M5.2 9.6h9.6l-4.8-1.1Z" fill="#fff" />
    </>
  ),
  EU: () => (
    <>
      <rect width="20" height="14" fill="#003399" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <circle
            key={i}
            cx={10 + Math.sin(a) * 4}
            cy={7 - Math.cos(a) * 4}
            r="0.6"
            fill="#FFCC00"
          />
        );
      })}
    </>
  ),
};


type FlagProps = { country: string } & SVGProps<SVGSVGElement>;

export function CountryFlag({ country, ...props }: FlagProps) {
  const Art = FLAGS[country.toUpperCase()];
  if (!Art) return null;
  return (
    <svg viewBox="0 0 20 14" aria-hidden focusable="false" {...props}>
      <clipPath id={`flag-clip-${country}`}>
        <rect width="20" height="14" rx="2.5" />
      </clipPath>
      <g clipPath={`url(#flag-clip-${country})`}>
        <Art />
      </g>
      <rect width="19" height="13" x="0.5" y="0.5" rx="2.2" fill="none" stroke="currentColor" strokeOpacity="0.18" />
    </svg>
  );
}
