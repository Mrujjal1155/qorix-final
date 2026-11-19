import type { CategoryPremiumMedia } from "@/lib/category-premium-media";
import media0 from "@/assets/button-premium/5197434882321567830.json.asset.json";
import media1 from "@/assets/button-premium/5224607267797606837.json.asset.json";
import media2 from "@/assets/button-premium/5321391598443962485.webp.asset.json";
import media3 from "@/assets/button-premium/5787192063099408213.webm.asset.json";
import media4 from "@/assets/button-premium/5801186350744999731.webm.asset.json";
import media5 from "@/assets/button-premium/5818670707340481045.webp.asset.json";
import media6 from "@/assets/button-premium/5852614525370503272.webm.asset.json";
import media7 from "@/assets/button-premium/5854908544712707500.webm.asset.json";
import media8 from "@/assets/button-premium/6179259084722675328.json.asset.json";
import media9 from "@/assets/button-premium/6206375377925839184.json.asset.json";
const media: Record<string, CategoryPremiumMedia> = {
  "ui_icon_prod_addcart": { kind: "lottie", url: media9.url },
  "ui_icon_prod_price": { kind: "lottie", url: media0.url },
  "ui_icon_prod_sold": { kind: "image", url: media2.url },
  "ui_icon_prod_stock": { kind: "video", url: media7.url },
  "ui_icon_prod_flash": { kind: "image", url: media5.url },
  "ui_icon_prod_important_line": { kind: "video", url: media6.url },
  "ui_icon_prod_guide": { kind: "video", url: media4.url },
  "ui_icon_prod_delivery": { kind: "lottie", url: media8.url },
  "ui_icon_prod_auto_note": { kind: "lottie", url: media1.url },
  "ui_icon_prod_manual_note": { kind: "video", url: media3.url },
};
export const productMessagePremiumMedia = (key: string) => media[key];
