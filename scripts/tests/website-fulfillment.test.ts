import { expect, test } from 'bun:test';
import { websitePaymentVerified, websiteFulfillmentEligible } from '../../src/lib/website-fulfillment';

const order = { source: 'website', status: 'pending', meta: { paid: true } };
for (const gateway of ['binance', 'bybit', 'blockchain']) {
  test(`${gateway} verified payment allows automatic website fulfillment`, () => {
    expect(websiteFulfillmentEligible({ ...order, meta: { [gateway]: { status: 'verified' } } })).toBe(true);
    expect(websiteFulfillmentEligible({ ...order, meta: { [gateway]: { status: 'not_found' } } })).toBe(false);
  });
}
for (const flag of ['paid', 'eps_paid', 'oxapay_paid']) {
  test(`${flag} verified settlement permits fulfillment`, () => {
    expect(websitePaymentVerified({ [flag]: true })).toBe(true);
    expect(websitePaymentVerified({ [flag]: false })).toBe(false);
  });
}
test('a typed transaction ID alone never authorizes delivery', () => {
  expect(websiteFulfillmentEligible({ ...order, meta: { txid: '466913417582903296' } })).toBe(false);
});
test('refunded and awaiting-payment orders never deliver', () => {
  expect(websiteFulfillmentEligible({ ...order, meta: { paid: true, refunded: true } })).toBe(false);
  expect(websiteFulfillmentEligible({ ...order, meta: { paid: true, awaiting_payment: true } })).toBe(false);
});
test('terminal, reseller and delivered orders cannot begin another purchase', () => {
  for (const status of ['completed', 'cancelled', 'expired', 'failed', 'refunded']) expect(websiteFulfillmentEligible({ ...order, status })).toBe(false);
  expect(websiteFulfillmentEligible({ ...order, reseller_id: 'reseller' })).toBe(false);
  expect(websiteFulfillmentEligible({ ...order, delivered_content: 'account' })).toBe(false);
});
test('malformed JSON and bot orders fail closed', () => {
  expect(websiteFulfillmentEligible({ ...order, source: 'telegram' })).toBe(false);
  for (const meta of [null, 'paid', 1, [], { paid: 'true' }]) expect(websitePaymentVerified(meta)).toBe(false);
});