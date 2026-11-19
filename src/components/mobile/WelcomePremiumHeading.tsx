import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";

/** Exact ordered custom-emoji letters and badge captured from the bot welcome header. */
export function WelcomePremiumHeading() {
  return <p aria-label="QORIX STORE" className="flex flex-wrap items-center gap-0.5 font-bold">
    {Array.from({ length: 11 }, (_, i) => <span key={i} className={i === 5 ? "ml-2" : ""}><ButtonPremiumIcon setting={`welcome_letter_${i}`} /></span>)}
  </p>;
}