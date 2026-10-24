// lib/app/cache.ts
//
// A tiny in-memory time-to-live cache. emPOWER and outages are
// filesystem-backed and effectively static for the demo, so a small per-route
// TTL avoids re-reading on every request. The clock is injectable so tests can
// drive cache expiry deterministically.

/**
 * Wraps an async loader with a time-to-live cache.
 *
 * The returned function caches the loaded value for `ttlMs` milliseconds.
 * While the cached entry is still fresh (`now - entry.at < ttlMs`) it is
 * returned without calling `load` again. Once it expires, `load` is called
 * again and the result is cached with the new timestamp.
 *
 * @param load  Async function that produces the value to cache.
 * @param ttlMs How long (in ms) a cached value stays fresh.
 * @returns A function `(now?) => Promise<T>` where `now` defaults to
 *          `Date.now()` and can be injected for testing.
 */
export function ttlCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
): (now?: number) => Promise<T> {
  let entry: { at: number; value: T } | null = null;
  return async (now = Date.now()) => {
    if (entry && now - entry.at < ttlMs) return entry.value;
    const value = await load();
    entry = { at: now, value };
    return value;
  };
}
