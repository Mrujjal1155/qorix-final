/** Captured Telegram payment button icons; no gateway settings or credentials. */
import binanceWallet from "@/assets/payment-premium/5294341275938473936.webp.asset.json";
import binanceCheckout from "@/assets/payment-premium/5798751138647905130.webp.asset.json";
import bybit from "@/assets/payment-premium/6237535627651326216.webp.asset.json";
import bep20 from "@/assets/payment-premium/6323572167711658755.json.asset.json";
import trc20 from "@/assets/payment-premium/6325583827313890764.json.asset.json";
import usdt from "@/assets/payment-premium/5413589900450625318.webm.asset.json";
import mfs from "@/assets/payment-premium/6319109524892419726.webp.asset.json";
import card from "@/assets/payment-premium/5852440446051028724.webm.asset.json";
import type { CategoryPremiumMedia } from "@/lib/category-premium-media";

const media: Record<string, CategoryPremiumMedia> = {
  binance: { url: binanceCheckout.url, kind: "image" },
  payid: { url: binanceWallet.url, kind: "image" },
  bybit: { url: bybit.url, kind: "image" },
  chain_bep20: { url: bep20.url, kind: "lottie" },
  chain_trc20: { url: trc20.url, kind: "lottie" },
  usdt_bep20: { url: usdt.url, kind: "video" },
  usdt_trc20: { url: usdt.url, kind: "video" },
  eps: { url: mfs.url, kind: "image" },
  eps_mfs: { url: mfs.url, kind: "image" },
  eps_card: { url: card.url, kind: "video" },
};

export function paymentPremiumMedia(gateway: string): CategoryPremiumMedia | undefined {
  return media[gateway];
}