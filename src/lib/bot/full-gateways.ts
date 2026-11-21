/** Bot menu visibility only; never overrides a gateway's own availability. */
export const BOT_FULL_GATEWAYS_KEY = "bot_full_gateways_enabled";

export function botFullGatewaysEnabled(settings: Record<string, string | undefined>): boolean {
  const value = settings[BOT_FULL_GATEWAYS_KEY];
  // Restore the original full menus until an admin explicitly turns them off.
  return value === undefined || value === "1";
}