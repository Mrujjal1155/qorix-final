import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, Home, Plus, RefreshCw, ShoppingCart } from "lucide-react";
import { BotFrame } from "@/components/mobile/BotFrame";
import { BotProductMessage } from "@/components/mobile/BotProductMessage";
import { Key, KeyLink, QtyPicker } from "@/components/mobile/BotStorefront";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { Button } from "@/components/ui/button";

type Product = Parameters<typeof BotProductMessage>[0]["product"] & {
  in_stock?: boolean; slug?: string | null;
};

/** Direct product links use the same messages and quantity keyboard as the home catalogue. */
export function BotProductPage({ product, quantity, botUsername, refresh }: {
  product: Product; quantity: number; botUsername: string; refresh: () => void;
}) {
  const [choosingQuantity, setChoosingQuantity] = useState(false);
  const navigate = useNavigate();
  const back = () => choosingQuantity ? setChoosingQuantity(false) : void navigate({ to: "/store" });
  return <BotFrame onBack={back}>
    {choosingQuantity ? <QtyPicker p={product} onBack={() => setChoosingQuantity(false)} /> : <div className="w-full self-start">
      <BotProductMessage product={product} />
      <div className="mt-px grid grid-cols-2 gap-px [&_button]:rounded-md [&_a]:rounded-md [&_button]:text-base [&_a]:text-base [&_button]:font-medium [&_a]:font-medium [&_button]:shadow-none [&_a]:shadow-none [&_span]:whitespace-normal [&_span]:break-words">
        {product.in_stock === true ? <>
          <Key premium="ui_icon_prod_buy" tone="green" icon={ShoppingCart} onClick={() => setChoosingQuantity(true)}>Buy Now</Key>
          <KeyLink premium="ui_icon_prod_addcart" tone="green" icon={Plus} to="/checkout" search={{ id: product.id, qty: quantity, step: "details" }}>Add to Cart</KeyLink>
        </> : <Button asChild variant="ghost" className="col-span-2 h-auto min-h-11 whitespace-normal bg-tg-btn-green text-tg-btn-fg hover:bg-tg-btn-green/90">
          <a href={`https://t.me/${botUsername || "QORIX3_bot"}?start=p_${product.id}`} target="_blank" rel="noreferrer"><ButtonPremiumIcon setting="ui_icon_prod_notify" fallback={Bell} />Notify Me When Available</a>
        </Button>}
        <Key premium="ui_icon_prod_refresh" tone="green" icon={RefreshCw} onClick={refresh}>Refresh</Key>
        <Key premium="ui_icon_prod_back" tone="red" icon={ArrowLeft} onClick={back}>Back</Key>
        <KeyLink premium="ui_icon_prod_cart" tone="green" icon={ShoppingCart} to="/store">Cart</KeyLink>
        <KeyLink premium="ui_icon_prod_home" tone="green" icon={Home} to="/">Home</KeyLink>
      </div>
    </div>}
  </BotFrame>;
}