import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/binance")({
  head: () => ({
    meta: [
      { title: "Binance Transactions & Verification — QORIX Admin" },
      { name: "description", content: "Live list of every Binance Pay transfer and coin deposit received on your Binance account." },
      { property: "og:title", content: "Binance Transactions — Shop Bot Admin" },
      { property: "og:description", content: "See every incoming Binance payment without opening Binance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/admin/gateway-payments", replace: true }); },
});
