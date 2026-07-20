import { Ratelimit } from "@upstash/ratelimit";

import { isProduction } from "@/lib/env";
import { getRedis, isRedisConfigured } from "@/lib/upstash";

/**
 * IP-level rate limiting, backed by Upstash Redis.
 *
 * This is the OUTER defence only. The account lockout that actually protects a
 * user lives in the database (`User.failedLoginCount` / `lockedUntil`) and works
 * with or without Redis — so an unconfigured Upstash degrades throttling, never
 * account protection.
 *
 * With no Redis, we fall back to a per-instance in-memory window. On serverless
 * that is weak (each lambda has its own memory), which is why production without
 * Redis is a loud warning rather than a silent downgrade.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  reset: number;
}

const limiters = new Map<string, Ratelimit>();

/** Sliding window: 10 login attempts per IP per minute. */
export const LOGIN_IP_LIMIT = { tokens: 10, window: "1 m" } as const;
/** Password changes and 2FA verification are cheaper to brute force — tighter. */
export const SENSITIVE_LIMIT = { tokens: 5, window: "1 m" } as const;

function getLimiter(name: string, tokens: number, window: string): Ratelimit {
  const key = `${name}:${tokens}:${window}`;

  if (!limiters.has(key)) {
    limiters.set(
      key,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(tokens, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
        prefix: `hl:rl:${name}`,
        analytics: false,
      }),
    );
  }

  return limiters.get(key)!;
}

// --- in-memory fallback ----------------------------------------------------

const memoryHits = new Map<string, number[]>();
let warnedAboutFallback = false;

function memoryLimit(identifier: string, tokens: number, windowMs: number): RateLimitResult {
  if (isProduction && !warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[ratelimit] Upstash Redis is not configured in production — falling back to " +
        "per-instance memory, which does not throttle across serverless instances. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (memoryHits.get(identifier) ?? []).filter((t) => t > cutoff);

  hits.push(now);
  memoryHits.set(identifier, hits);

  // Opportunistic sweep so a long-lived instance does not grow unboundedly.
  if (memoryHits.size > 5_000) {
    for (const [key, times] of memoryHits) {
      if (times.every((t) => t <= cutoff)) memoryHits.delete(key);
    }
  }

  return {
    success: hits.length <= tokens,
    limit: tokens,
    remaining: Math.max(0, tokens - hits.length),
    reset: (hits[0] ?? now) + windowMs,
  };
}

const WINDOW_MS: Record<string, number> = { "1 m": 60_000, "5 m": 300_000, "1 h": 3_600_000 };

export async function rateLimit(
  name: string,
  identifier: string,
  config: { tokens: number; window: string } = LOGIN_IP_LIMIT,
): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    return memoryLimit(`${name}:${identifier}`, config.tokens, WINDOW_MS[config.window] ?? 60_000);
  }

  try {
    const result = await getLimiter(name, config.tokens, config.window).limit(identifier);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // Redis being down must not lock every user out of the product. Fall back
    // rather than fail closed, and make the degradation visible.
    console.error("[ratelimit] Redis error, falling back to memory", error);
    return memoryLimit(`${name}:${identifier}`, config.tokens, WINDOW_MS[config.window] ?? 60_000);
  }
}

/** Test seam — clears the in-memory window between cases. */
export function resetMemoryLimiter(): void {
  memoryHits.clear();
}
