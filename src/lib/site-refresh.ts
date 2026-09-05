/* Cross-tab / cross-panel signal so every shell (admin, reseller, user, store)
   re-fetches editable site content the moment the admin saves something. */

const CHANNEL = "qorix-site-content";
const STORAGE_KEY = "qorix:site-content-updated";

export function broadcastSiteUpdate() {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(CHANNEL).postMessage(Date.now());
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function subscribeSiteUpdate(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => cb();
  } catch {
    bc = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    bc?.close();
  };
}
