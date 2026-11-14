export type ReferralMode = 'off' | 'points' | 'commission';
export function referralMode(value: unknown): ReferralMode {
  return value === 'points' || value === 'commission' ? value : 'off';
}
export function referralCallbackAllowed(mode: ReferralMode, data: string) {
  if (data === 'refstore' || data === 'refearn') return mode !== 'off';
  if (data === 'refbought' || data.startsWith('refbuy:')) return mode === 'points';
  if (data === 'ref:list' || data.startsWith('refcomm:')) return mode === 'commission';
  return false;
}