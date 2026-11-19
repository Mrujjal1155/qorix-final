export function canPayCheckoutWallet(linked: boolean, banned: boolean, balance: number, total: number): boolean {
  return linked && !banned && Number.isFinite(balance) && Number.isFinite(total) && total > 0 && balance >= total;
}