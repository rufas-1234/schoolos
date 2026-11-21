import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffMembers, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";
import { getBoundedRequest, maxUploadRequestBodyBytes } from "@/lib/request-body-limit";

const maxFileSize = 4 * 1024 * 1024;
const allowedDocuments = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedPhotos = new Set(["image/jpeg", "image/png", "image/webp"]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const bounded = await getBoundedRequest(request, maxUploadRequestBodyBytes);
  if (!bounded.ok) return bounded.response;
  const formData = await bounded.request.formData();
  const purpose = z.enum(["profilePhoto", "resume", "joiningLetter", "otherDocument"])
    .safeParse(formData.get("purpose"));
  const staffPublicId = z.string().uuid().optional()
    .safeParse(formData.get("staffPublicId") || undefined);
  const file = formData.get("file");
  if (!purpose.success || !staffPublicId.success || !(file instanceof File)) {
    return Response.json({ error: "Choose a valid staff document." }, { status: 400 });
  }
  const allowedTypes = purpose.data === "profilePhoto" ? allowedPhotos : allowedDocuments;
  if (file.size === 0 || file.size > maxFileSize || !allowedTypes.has(file.type)) {
    return Response.json({
      error: purpose.data === "profilePhoto"
        ? "Choose a JPEG, PNG, or WebP photo no larger than 4 MB."
        : "Choose a PDF, JPEG, PNG, or WebP file no larger than 4 MB.",
    }, { status: 400 });
  }

  if (staffPublicId.data) {
    const [staff] = await db.select({ id: staffMembers.id })
      .from(staffMembers)
      .where(and(
        eq(staffMembers.publicId, staffPublicId.data),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .limit(1);
    if (!staff) return Response.json({ error: "Staff record was not found." }, { status: 404 });
  }
  if (!isObjectStorageConfigured()) {
    return Response.json(
      { error: "Uploads are unavailable because object storage is not configured." },
      { status: 503 },
    );
  }

  const uploaded = await getObjectStorage().uploadObject({
    contentType: file.type,
    fileName: file.name,
    schoolPublicId: context.schoolPublicId,
    body: new Uint8Array(await file.arrayBuffer()),
  });
  const fileName = file.name.slice(0, 160);
  await db.insert(uploadedFiles).values({
    publicId: randomUUID(),
    schoolId: context.schoolId,
    uploadedBy: context.user.id,
    storageKey: uploaded.objectKey,
    fileName,
    contentType: file.type,
    byteSize: file.size,
  });
  return Response.json({ fileName, objectKey: uploaded.objectKey });
}
