/** Short two-tone bell played with Web Audio (no audio file needed). Browser-only. */
export function playBell() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [
      { f: 1318.5, t: 0 },
      { f: 987.8, t: 0.18 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 1.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1600);
  } catch {
    /* sound blocked — ignore */
  }
}
