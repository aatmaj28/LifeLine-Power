import { describe, it, expect, vi } from "vitest";
import { ttlCache } from "../cache";

/**
 * Unit tests for ttlCache.
 *
 * ttlCache wraps an async loader and serves its value for ttlMs milliseconds.
 * While the cached entry is fresh (now - entry.at < ttlMs) it is returned
 * without calling load again; once it expires, load runs again and the fresh
 * value is cached with the new timestamp. The clock is injectable so these
 * tests drive expiry deterministically rather than relying on real time.
 *
 * Validates: Requirement 2.4
 */
describe("ttlCache", () => {
  const TTL = 5 * 60 * 1000; // 5 minutes, matching the route cache window
  const T = 1_000_000;

  it("loads on the first call", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return calls;
    };
    const cached = ttlCache(load, TTL);

    const first = await cached(T);

    expect(calls).toBe(1);
    expect(first).toBe(1);
  });

  it("returns the same cached value within the TTL without reloading", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return calls;
    };
    const cached = ttlCache(load, TTL);

    const first = await cached(T);
    const second = await cached(T + 100); // 100ms later, still < TTL

    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("reloads once the entry has expired and returns the fresh value", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return calls;
    };
    const cached = ttlCache(load, TTL);

    const first = await cached(T);
    const refreshed = await cached(T + TTL); // now - at === TTL, expired

    expect(calls).toBe(2);
    expect(first).toBe(1);
    expect(refreshed).toBe(2);
  });

  it("drives expiry from the injected clock, not real time", async () => {
    const load = vi.fn(async () => Symbol("value"));
    const cached = ttlCache(load, TTL);

    // Real time does not advance meaningfully between these awaited calls, yet
    // the injected clock crossing the TTL boundary is what forces a reload.
    await cached(T);
    await cached(T + TTL - 1); // still fresh per injected clock
    expect(load).toHaveBeenCalledTimes(1);

    await cached(T + TTL); // injected clock reaches expiry -> reload
    expect(load).toHaveBeenCalledTimes(2);

    // A later injected time within the new window reuses the refreshed entry.
    await cached(T + TTL + 50);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
