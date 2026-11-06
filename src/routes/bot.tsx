import { createFileRoute, redirect } from "@tanstack/react-router";

/** /bot is an alias; the canonical page is /telegram-bot. */
export const Route = createFileRoute("/bot")({
  beforeLoad: () => {
    throw redirect({ to: "/telegram-bot", statusCode: 301 });
  },
});
