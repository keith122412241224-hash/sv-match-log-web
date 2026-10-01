// Best-effort storage for optional form preferences only. Guest match records
// must continue reporting persistence failures rather than silently losing data.
export function safeGetItem(key: string): string | null {
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

export function safeSetItem(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true; }
  catch { return false; }
}

export function safeRemoveItem(key: string): boolean {
  try { window.localStorage.removeItem(key); return true; }
  catch { return false; }
}
