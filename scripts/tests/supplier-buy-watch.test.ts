import { expect, test } from 'bun:test';
import { runBuyWatchWindow } from '../../src/lib/suppliers/buy-watch.server';

function clock() { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; }

test('checks stock every 5 seconds: 11 checks inside a 55-second window', async () => {
  const c = clock(), at: number[] = [];
  const r = await runBuyWatchWindow({}, { ...c, run: async () => { at.push(c.now()); return { checks: 1, purchases: 0 }; } });
  expect(at).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000]);
  expect(r.ticks).toBe(11);
});

test('a slow check does not delay later 5-second marks', async () => {
  const c = clock(), at: number[] = [];
  await runBuyWatchWindow({}, { ...c, run: async () => { at.push(c.now()); if (at.length === 1) await c.sleep(3000); return { checks: 1, purchases: 0 }; } });
  expect(at.slice(0, 3)).toEqual([0, 5000, 10000]);
});

test('stops the window after a failed save so nothing is bought twice', async () => {
  const c = clock(); let calls = 0;
  const r = await runBuyWatchWindow({}, { ...c, run: async () => { calls++; throw new Error('Purchase needs reconciliation'); } });
  expect(calls).toBe(1); expect(r.ticks).toBe(1);
});
