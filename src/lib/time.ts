export const FRESHNESS_WINDOW_PAST_MS = 5 * 60 * 1000;
export const FRESHNESS_WINDOW_FUTURE_MS = 1 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function isFresh(timestamp: string, now: number = Date.now()): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  const delta = now - t;
  if (delta > FRESHNESS_WINDOW_PAST_MS) return false; // too old
  if (delta < -FRESHNESS_WINDOW_FUTURE_MS) return false; // too far in future
  return true;
}
