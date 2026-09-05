import { Bot, Globe, Store, ShoppingBag, Wallet, Infinity as InfinityIcon } from "lucide-react";

const STEPS = [
  { icon: Globe, label: "Our website", sub: "Full catalogue" },
  { icon: Bot, label: "Telegram bot", sub: "Auto delivery" },
  { icon: Store, label: "You resell", sub: "Your API key" },
  { icon: ShoppingBag, label: "Product sold", sub: "Your own price" },
  { icon: Wallet, label: "Profit", sub: "Money in wallet" },
];

const COINS = [0, 0.9, 1.8, 2.7, 3.6];

export function ResellerFlowAnimation() {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-5 sm:p-8">
      <style>{`
@property --qx-money { syntax: '<integer>'; initial-value: 0; inherits: false; }
@keyframes qx-pop { 0%{opacity:0;transform:translateY(14px) scale(.94)} 14%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:1} }
@keyframes qx-flow { 0%{background-position:-160% 0} 100%{background-position:160% 0} }
@keyframes qx-flow-v { 0%{background-position:0 -160%} 100%{background-position:0 160%} }
@keyframes qx-glow { 0%,100%{box-shadow:0 0 0 0 color-mix(in oklab, var(--primary) 40%, transparent)} 50%{box-shadow:0 0 0 14px color-mix(in oklab, var(--primary) 0%, transparent)} }
@keyframes qx-count { from{--qx-money:0} to{--qx-money:25000} }
@keyframes qx-coin-fly { 0%{opacity:0;transform:translate(-50%,0) scale(.6)} 10%{opacity:1} 70%{opacity:1} 100%{opacity:0;transform:translate(-50%,-120px) scale(1.05)} }
@keyframes qx-bump { 0%,88%,100%{transform:translateY(0)} 92%{transform:translateY(-4px)} }
.qx-step{opacity:0;animation:qx-pop 6s ease-out infinite}
.qx-line{background-image:linear-gradient(90deg,transparent,var(--primary),transparent);background-size:60% 100%;background-repeat:no-repeat;animation:qx-flow 6s linear infinite}
.qx-line-v{background-image:linear-gradient(180deg,transparent,var(--primary),transparent);background-size:100% 60%;background-repeat:no-repeat;animation:qx-flow-v 6s linear infinite}
.qx-profit{animation:qx-glow 2.4s ease-out infinite}
.qx-money{animation:qx-count 6s linear infinite;counter-reset:qxm var(--qx-money)}
.qx-money::after{content:counter(qxm)}
.qx-coin{animation:qx-coin-fly 4.5s ease-out infinite}
.qx-wallet{animation:qx-bump 4.5s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.qx-step,.qx-line,.qx-line-v,.qx-profit,.qx-money,.qx-coin,.qx-wallet{animation:none;opacity:1}}
      `}</style>

      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        How resellers earn with QORIX
      </p>

      <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex flex-1 flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <div
              className="qx-step flex w-full flex-1 items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 sm:flex-col sm:text-center"
              style={{ animationDelay: `${i * 0.6}s` }}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ${
                  i === STEPS.length - 1 ? "qx-profit" : ""
                }`}
              >
                <s.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.sub}</span>
              </span>
              <span className="ml-auto text-xs font-bold text-primary sm:ml-0 sm:mt-1">
                {i === STEPS.length - 1 ? "$$$" : `0${i + 1}`}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <>
                <span
                  className="qx-line hidden h-[2px] w-full rounded-full bg-border sm:block"
                  style={{ animationDelay: `${i * 0.6}s` }}
                  aria-hidden
                />
                <span
                  className="qx-line-v block h-6 w-[2px] rounded-full bg-border sm:hidden"
                  style={{ animationDelay: `${i * 0.6}s` }}
                  aria-hidden
                />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Money-in-wallet animation */}
      <div className="relative mt-8 flex flex-col items-center">
        <div className="relative h-28 w-full max-w-xs" aria-hidden>
          {COINS.map((d, i) => (
            <span
              key={i}
              className="qx-coin absolute bottom-0 grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xs font-black text-primary ring-2 ring-primary/40"
              style={{ left: `${20 + i * 15}%`, animationDelay: `${d}s` }}
            >
              $
            </span>
          ))}
        </div>
        <div className="qx-wallet -mt-6 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-3">
          <Wallet className="h-6 w-6 text-primary" />
          <span className="text-lg font-black tabular-nums text-primary">
            $<span className="qx-money" />+
          </span>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Every sale adds profit straight to your balance (USD)
        </p>
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm font-semibold text-primary">
        <InfinityIcon className="h-4 w-4 shrink-0" /> Unlimited orders, unlimited profit — we handle the delivery
      </p>
    </div>
  );
}
