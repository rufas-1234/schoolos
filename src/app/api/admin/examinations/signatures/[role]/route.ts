import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, examReportSignatures, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";
import { getBoundedRequest, maxUploadRequestBodyBytes } from "@/lib/request-body-limit";

export const runtime = "nodejs";

const maxFileSize = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedRoles = new Set(["headteacher"]);

function signatureNotFound() {
  return Response.json({ error: "Signature not found." }, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

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

async function signatureContext(params: Promise<{ role: string }>) {
  const [{ role }, context] = await Promise.all([
    params,
    requireSchoolPermission(["examinations.create", "results.enter", "results.publish", "school.settings.manage"]),
  ]);
  if (!allowedRoles.has(role)) return null;
  return { role, context };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ role: string }> },
) {
  const result = await signatureContext(params);
  if (!result) return signatureNotFound();
  const [signature] = await db.select({
    storageKey: examReportSignatures.storageKey,
    fileName: examReportSignatures.fileName,
    contentType: examReportSignatures.contentType,
  }).from(examReportSignatures).where(and(
    eq(examReportSignatures.schoolId, result.context.schoolId),
    eq(examReportSignatures.role, result.role),
  )).limit(1);
  if (!signature || !allowedTypes.has(signature.contentType)) {
    return signatureNotFound();
  }
  const [storedFile] = await db.select({
    storageKey: uploadedFiles.storageKey,
    fileName: uploadedFiles.fileName,
    contentType: uploadedFiles.contentType,
  }).from(uploadedFiles).where(and(
    eq(uploadedFiles.schoolId, result.context.schoolId),
    eq(uploadedFiles.storageKey, signature.storageKey),
  )).limit(1);
  if (!storedFile || !allowedTypes.has(storedFile.contentType)) {
    return signatureNotFound();
  }
  const response = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    disposition: "inline",
  });
  if (!response) return signatureNotFound();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ role: string }> },
) {
  const result = await signatureContext(params);
  if (!result) return Response.json({ error: "Choose a valid exam report signature role." }, { status: 404 });
  const { context, role } = result;
  if (!context.grantedPermissions.some((permission) =>
    ["examinations.create", "results.publish", "school.settings.manage"].includes(permission),
  )) {
    return Response.json({ error: "Only examination managers can update the headteacher signature." }, { status: 403 });
  }
  const bounded = await getBoundedRequest(request, maxUploadRequestBodyBytes);
  if (!bounded.ok) return bounded.response;
  const formData = await bounded.request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an image file for this signature." }, { status: 400 });
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
    await tx.insert(examReportSignatures).values({
      schoolId: context.schoolId,
      role,
      storageKey: uploaded.objectKey,
      fileName,
      contentType: file.type,
      updatedBy: context.user.id,
    }).onDuplicateKeyUpdate({
      set: {
        storageKey: uploaded.objectKey,
        fileName,
        contentType: file.type,
        updatedBy: context.user.id,
        updatedAt: new Date(),
      },
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "exam_report_signature.updated",
      resourceType: "exam_report_signature",
      resourcePublicId: context.schoolPublicId,
      changedFields: [role],
    });
  });
  return Response.json({ success: true });
}
