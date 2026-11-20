import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  examTeacherSignatures,
  staffMembers,
  teachers,
  uploadedFiles,
} from "@/db/schema";
import { requireSchoolMember, requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";

const maxFileSize = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function signatureNotFound() {
  return Response.json({ error: "Teacher signature not found." }, {
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

function parseTeacherId(rawTeacherId: string): number | null {
  if (!/^[1-9]\d*$/.test(rawTeacherId)) return null;
  const teacherId = Number(rawTeacherId);
  return Number.isSafeInteger(teacherId) ? teacherId : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  const [context, { teacherId: rawTeacherId }] = await Promise.all([
    requireSchoolMember(),
    params,
  ]);
  const teacherId = parseTeacherId(rawTeacherId);
  if (teacherId === null) return signatureNotFound();

  const requestedSignatureId = new URL(request.url).searchParams.get("signatureId");
  let signatureId: number | null = null;
  if (requestedSignatureId !== null) {
    if (!/^[1-9]\d*$/.test(requestedSignatureId)) return signatureNotFound();
    signatureId = Number(requestedSignatureId);
    if (!Number.isSafeInteger(signatureId)) return signatureNotFound();
  }

  const [teacher] = await db.select({ id: teachers.id }).from(teachers)
    .where(and(
      eq(teachers.id, teacherId),
      eq(teachers.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!teacher) return signatureNotFound();

  const [signature] = await db.select({
    id: examTeacherSignatures.id,
    storageKey: examTeacherSignatures.storageKey,
    fileName: examTeacherSignatures.fileName,
    contentType: examTeacherSignatures.contentType,
  }).from(examTeacherSignatures)
    .where(and(
      eq(examTeacherSignatures.schoolId, context.schoolId),
      eq(examTeacherSignatures.teacherId, teacherId),
      signatureId === null ? undefined : eq(examTeacherSignatures.id, signatureId),
    ))
    .orderBy(desc(examTeacherSignatures.createdAt), desc(examTeacherSignatures.id))
    .limit(1);
  if (!signature || !allowedTypes.has(signature.contentType)) return signatureNotFound();

  const [storedFile] = await db.select({
    storageKey: uploadedFiles.storageKey,
    fileName: uploadedFiles.fileName,
    contentType: uploadedFiles.contentType,
  }).from(uploadedFiles).where(and(
    eq(uploadedFiles.schoolId, context.schoolId),
    eq(uploadedFiles.storageKey, signature.storageKey),
  )).limit(1);
  if (!storedFile || !allowedTypes.has(storedFile.contentType)) return signatureNotFound();

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
  { params }: { params: Promise<{ teacherId: string }> },
) {
  const [context, { teacherId: rawTeacherId }] = await Promise.all([
    requireSchoolPermission(["examinations.create", "results.enter", "results.publish", "school.settings.manage"]),
    params,
  ]);
  const teacherId = parseTeacherId(rawTeacherId);
  if (teacherId === null) return Response.json({ error: "Choose a valid teacher." }, { status: 404 });

  const canManageAll = context.grantedPermissions.some((permission) =>
    ["examinations.create", "results.publish", "school.settings.manage"].includes(permission),
  );
  const [teacher] = await db.select({
    id: teachers.id,
    publicId: teachers.publicId,
  }).from(teachers)
    .leftJoin(staffMembers, and(
      eq(staffMembers.id, teachers.staffMemberId!),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.status, "active"),
    ))
    .where(and(
      eq(teachers.id, teacherId),
      eq(teachers.schoolId, context.schoolId),
      eq(teachers.status, "active"),
      canManageAll ? undefined : eq(staffMembers.linkedUserId, context.user.id),
    ))
    .limit(1);
  if (!teacher) return Response.json({ error: "You may only upload a signature for your own active teacher profile." }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an image file for this teacher signature." }, { status: 400 });
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
    await tx.insert(examTeacherSignatures).values({
      schoolId: context.schoolId,
      teacherId: teacher.id,
      storageKey: uploaded.objectKey,
      fileName,
      contentType: file.type,
      uploadedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "exam_teacher_signature.created",
      resourceType: "teacher",
      resourcePublicId: teacher.publicId,
      changedFields: ["signature"],
    });
  });
  return Response.json({ success: true });
}
