import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, schools, uploadedFiles } from "@/db/schema";
import { requireSchoolMember, requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";
import { getBoundedRequest, maxUploadRequestBodyBytes } from "@/lib/request-body-limit";

export const runtime = "nodejs";

const maxFileSize = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isValidImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return contentType === "image/webp" && bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function GET() {
  const context = await requireSchoolMember();
  const [school] = await db.select({ logoUrl: schools.logoUrl })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const objectKey = school?.logoUrl;
  if (!objectKey || objectKey.startsWith("https://") || !objectKey.startsWith(`${context.schoolPublicId}/`)) {
    return Response.json({ error: "School logo not found." }, { status: 404 });
  }
  const [storedFile] = await db.select({
    storageKey: uploadedFiles.storageKey,
    fileName: uploadedFiles.fileName,
    contentType: uploadedFiles.contentType,
  }).from(uploadedFiles).where(and(
    eq(uploadedFiles.schoolId, context.schoolId),
    eq(uploadedFiles.storageKey, objectKey),
  )).limit(1);
  if (!storedFile || !allowedTypes.has(storedFile.contentType)) {
    return Response.json({ error: "School logo not found." }, { status: 404 });
  }
  const response = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    disposition: "inline",
  });
  if (!response) return Response.json({ error: "School logo not found." }, { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

export async function POST(request: Request) {
  const context = await requireSchoolPermission("school.settings.manage");
  const bounded = await getBoundedRequest(request, maxUploadRequestBodyBytes);
  if (!bounded.ok) return bounded.response;
  const formData = await bounded.request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an image file for the school logo." }, { status: 400 });
  }
  if (file.size === 0 || file.size > maxFileSize || !allowedTypes.has(file.type)) {
    return Response.json({ error: "Choose a PNG, JPEG, or WebP image no larger than 4 MB." }, { status: 400 });
  }
  if (!isObjectStorageConfigured()) {
    return Response.json({ error: "Uploads are unavailable because object storage is not configured." }, { status: 503 });
  }

  const body = new Uint8Array(await file.arrayBuffer());
  if (!isValidImageSignature(file.type, body)) {
    return Response.json({ error: "The selected file contents do not match a supported image format." }, { status: 400 });
  }
  const uploaded = await getObjectStorage().uploadObject({
    contentType: file.type,
    fileName: file.name,
    schoolPublicId: context.schoolPublicId,
    body,
  });
  const fileName = file.name.slice(0, 160);
  await db.transaction(async (tx) => {
    await tx.insert(uploadedFiles).values({
      publicId: randomUUID(),
      schoolId: context.schoolId,
      uploadedBy: context.user.id,
      storageKey: uploaded.objectKey,
      fileName,
      contentType: file.type,
      byteSize: file.size,
    });
    await tx.update(schools).set({ logoUrl: uploaded.objectKey })
      .where(eq(schools.id, context.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "school.logo.updated",
      resourceType: "school",
      resourcePublicId: context.schoolPublicId,
      changedFields: ["logoUrl"],
    });
  });
  return Response.json({ success: true });
}
