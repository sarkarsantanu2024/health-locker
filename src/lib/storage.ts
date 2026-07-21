import { createHash, randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/db";
import { getBucket, getR2, isR2Configured, presignDownload } from "@/lib/r2";
import { AppError } from "@/shared/errors";

/**
 * Object storage behind one interface, with two adapters:
 *
 *   R2       — used automatically the moment R2 credentials exist. Bytes never
 *              pass through a function; the browser gets a presigned URL.
 *   DATABASE — fallback so uploads work before R2 is provisioned. Postgres is a
 *              poor blob store, so this is bounded hard by MAX_UPLOAD_BYTES and
 *              reports itself in the health check.
 *
 * Switching is a config change, not a code change — the same rule the AI adapter
 * follows.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type StorageBackend = "R2" | "DATABASE";

export function activeBackend(): StorageBackend {
  return isR2Configured() ? "R2" : "DATABASE";
}

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
}

function assertAcceptable(contentType: string, sizeBytes: number): void {
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
    throw new AppError("BAD_REQUEST", "Upload a JPG, PNG, WEBP or PDF file.", { field: "file" });
  }

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "BAD_REQUEST",
      `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      { field: "file" },
    );
  }

  if (sizeBytes === 0) {
    throw new AppError("BAD_REQUEST", "That file is empty.", { field: "file" });
  }
}

/** Namespaced, unguessable key. Never derived from the user's filename. */
export function buildStorageKey(prefix: string, contentType: string): string {
  const extension =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" }[
      contentType
    ] ?? "bin";

  const now = new Date();
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extension}`;
}

/**
 * Persists bytes and returns the key to record on the Document row.
 *
 * `documentId` is required by the database adapter because the blob is keyed on
 * it; R2 ignores it.
 */
export async function putObject(
  documentId: string,
  bytes: Uint8Array,
  contentType: string,
  prefix = "uploads",
): Promise<StoredObject> {
  assertAcceptable(contentType, bytes.byteLength);

  const storageKey = buildStorageKey(prefix, contentType);
  const checksum = createHash("sha256").update(bytes).digest("hex");

  if (activeBackend() === "R2") {
    await getR2().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
        // Medical and financial documents are never public.
        Metadata: { checksum },
      }),
    );
  } else {
    await prisma.documentBlob.upsert({
      where: { documentId },
      update: { bytes: Buffer.from(bytes), contentType },
      create: { documentId, bytes: Buffer.from(bytes), contentType },
    });
  }

  return { storageKey, sizeBytes: bytes.byteLength, checksum };
}

export interface FetchedObject {
  /** Present for the database adapter — stream these bytes back yourself. */
  bytes: Buffer | null;
  /** Present for R2 — redirect the browser here instead. */
  url: string | null;
  contentType: string;
}

/**
 * Reads an object back. The caller MUST have already authorised access to the
 * owning Document — this function checks nothing.
 */
export async function getObject(documentId: string, storageKey: string, contentType: string): Promise<FetchedObject> {
  if (activeBackend() === "R2") {
    // Short-lived presigned GET: the bytes never pass through the function.
    return { bytes: null, url: await presignDownload(storageKey, 120), contentType };
  }

  const blob = await prisma.documentBlob.findUnique({
    where: { documentId },
    select: { bytes: true, contentType: true },
  });

  if (!blob) throw new AppError("NOT_FOUND", "Not found.");

  return { bytes: Buffer.from(blob.bytes), url: null, contentType: blob.contentType };
}

export async function deleteObject(documentId: string, storageKey: string): Promise<void> {
  if (activeBackend() === "R2") {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: storageKey }));
    return;
  }

  await prisma.documentBlob.deleteMany({ where: { documentId } });
}
