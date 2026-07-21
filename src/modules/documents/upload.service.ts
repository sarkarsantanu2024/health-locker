import type { DocumentKind } from "@prisma/client";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, putObject } from "@/lib/storage";
import { AppError } from "@/shared/errors";

/**
 * Direct upload through a server action.
 *
 * Phase 4 replaces this with presigned R2 uploads so the bytes never touch a
 * function — but that needs R2 credentials, and a payment screenshot is small
 * enough (a few hundred KB) that routing it through the server is acceptable
 * today. The Document row it produces is identical either way, so nothing
 * downstream changes when the presigned path lands.
 */

export interface UploadResult {
  documentId: string;
  fileName: string;
  sizeBytes: number;
}

export async function uploadFile(
  file: File,
  options: {
    kind: DocumentKind;
    patientId?: string | null;
    orgId?: string | null;
    uploadedById?: string | null;
    prefix?: string;
  },
): Promise<UploadResult> {
  if (!file || file.size === 0) {
    throw new AppError("BAD_REQUEST", "Choose a file to upload.", { field: "file" });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "BAD_REQUEST",
      `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      { field: "file" },
    );
  }

  // Trust the sniffed type over the declared one where they disagree: a browser
  // on some Android builds reports application/octet-stream for a camera photo.
  const contentType = (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)
    ? file.type
    : sniffContentType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));

  if (!contentType) {
    throw new AppError("BAD_REQUEST", "Upload a JPG, PNG, WEBP or PDF file.", { field: "file" });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // The row exists before the bytes, so an interrupted upload leaves a
  // PENDING_UPLOAD row that can be reaped rather than an orphaned object.
  const document = await prisma.document.create({
    data: {
      patientId: options.patientId ?? null,
      orgId: options.orgId ?? null,
      uploadedById: options.uploadedById ?? null,
      // Never the user's filename — it is attacker-controlled and often full of
      // personal information.
      storageKey: `pending-${crypto.randomUUID()}`,
      fileName: sanitiseFileName(file.name),
      mimeType: contentType,
      sizeBytes: bytes.byteLength,
      kind: options.kind,
      status: "PENDING_UPLOAD",
    },
    select: { id: true, fileName: true },
  });

  try {
    const stored = await putObject(document.id, bytes, contentType, options.prefix ?? "uploads");

    await prisma.document.update({
      where: { id: document.id },
      data: {
        storageKey: stored.storageKey,
        checksum: stored.checksum,
        sizeBytes: stored.sizeBytes,
        status: "UPLOADED",
      },
    });

    await audit({
      action: "document.uploaded",
      entityType: "Document",
      entityId: document.id,
      actorId: options.uploadedById ?? null,
      orgId: options.orgId ?? null,
      metadata: { kind: options.kind, sizeBytes: stored.sizeBytes, mimeType: contentType },
    });

    return { documentId: document.id, fileName: document.fileName, sizeBytes: stored.sizeBytes };
  } catch (error) {
    await prisma.document.update({ where: { id: document.id }, data: { status: "FAILED" } });
    throw error;
  }
}

/** Magic-number sniffing for the handful of types we accept. */
function sniffContentType(head: Uint8Array): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  // RIFF....WEBP
  if (startsWith(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45) return "image/webp";

  return null;
}

function sanitiseFileName(name: string): string {
  return (
    name
      .replace(/[/\\]/g, "-")
      .replace(/[^\w.\- ]/g, "")
      .trim()
      .slice(0, 120) || "upload"
  );
}
