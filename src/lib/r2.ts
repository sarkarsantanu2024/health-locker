import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env, requireR2Env } from "@/lib/env";

/**
 * Cloudflare R2 over the S3 API. Browsers upload directly to R2 with a presigned
 * URL so file bytes never pass through a Vercel function (which has a small body
 * limit and metered egress).
 *
 * Local/offline dev points R2_ENDPOINT at MinIO — same code path.
 */

let client: S3Client | null = null;

function resolveEndpoint(): string {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT;
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export function getR2(): S3Client {
  if (!client) {
    const cfg = requireR2Env();
    client = new S3Client({
      region: "auto",
      endpoint: resolveEndpoint(),
      // MinIO serves buckets as path segments, Cloudflare does not care.
      forcePathStyle: Boolean(env.R2_ENDPOINT),
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return client;
}

export function getBucket(): string {
  return requireR2Env().R2_BUCKET;
}

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && (env.R2_ENDPOINT || env.R2_ACCOUNT_ID),
  );
}

export interface PresignedUpload {
  url: string;
  key: string;
  expiresIn: number;
}

export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<PresignedUpload> {
  const url = await getSignedUrl(
    getR2(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );

  return { url, key, expiresIn };
}

/**
 * Medical documents are never public. Downloads always go through a short-lived
 * presigned GET issued after an authorization check.
 */
export async function presignDownload(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(getR2(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn });
}
