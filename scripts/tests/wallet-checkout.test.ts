import { expect, test } from "bun:test";
import { canPayCheckoutWallet } from "../../src/lib/wallet-checkout";
test("only a connected account can pay", () => expect(canPayCheckoutWallet(false, false, 10, 1)).toBe(false));
test("insufficient balance cannot pay", () => expect(canPayCheckoutWallet(true, false, 0.02, 0.03)).toBe(false));
test("exact balance can pay", () => expect(canPayCheckoutWallet(true, false, 0.03, 0.03)).toBe(true));
test("banned account cannot pay", () => expect(canPayCheckoutWallet(true, true, 10, 1)).toBe(false));