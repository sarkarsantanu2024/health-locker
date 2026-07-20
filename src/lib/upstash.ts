import { Client as QStashClient, Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

import { env, requireQStashEnv, requireRedisEnv } from "@/lib/env";

/**
 * Upstash Redis (cache + rate limiting) and QStash (background jobs + scheduled
 * reminders). Both are HTTP-based, so they work inside serverless functions with
 * no connection pooling and no always-on worker.
 *
 * Clients are created lazily: an unconfigured Upstash must not break `pnpm dev`.
 */

let redisClient: Redis | null = null;
let qstashClient: QStashClient | null = null;
let qstashReceiver: Receiver | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const cfg = requireRedisEnv();
    redisClient = new Redis({
      url: cfg.UPSTASH_REDIS_REST_URL,
      token: cfg.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redisClient;
}

export function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export function getQStash(): QStashClient {
  if (!qstashClient) {
    const cfg = requireQStashEnv();
    qstashClient = new QStashClient({ token: cfg.QSTASH_TOKEN });
  }

  return qstashClient;
}

/**
 * Verifies the `Upstash-Signature` header on `/api/jobs/*` requests. Job routes
 * are public URLs, so this is the only thing standing between them and the
 * internet — never skip it.
 */
export function getQStashReceiver(): Receiver {
  if (!qstashReceiver) {
    const cfg = requireQStashEnv();
    qstashReceiver = new Receiver({
      currentSigningKey: cfg.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: cfg.QSTASH_NEXT_SIGNING_KEY,
    });
  }

  return qstashReceiver;
}

export function isQStashConfigured(): boolean {
  return Boolean(env.QSTASH_TOKEN && env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY);
}
