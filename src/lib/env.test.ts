import { describe, expect, it } from "vitest";

import { env, requireR2Env, requireRedisEnv } from "@/lib/env";

describe("env", () => {
  it("parses required config and applies defaults", () => {
    expect(env.NODE_ENV).toBe("test");
    expect(env.APP_NAME).toBe("HealthLocker");
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.AUTH_ACCESS_TOKEN_TTL).toBe(900);
  });

  it("names every missing var when an optional service is used unconfigured", () => {
    expect(() => requireRedisEnv()).toThrowError(
      /UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN/,
    );
  });

  it("does not fail at boot just because storage is unconfigured", () => {
    // The whole point of lazy validation: importing env must succeed anyway.
    expect(env.DATABASE_URL).toBeTruthy();
    expect(() => requireR2Env()).toThrowError(/Cloudflare R2 is not configured/);
  });
});
