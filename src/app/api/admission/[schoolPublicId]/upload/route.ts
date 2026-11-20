import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { schools, uploadedFiles } from "@/db/schema";
import { matchesFileSignature } from "@/lib/file-signature";
import { consumePublicAdmissionRateLimit } from "@/lib/public-admission-rate-limit";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";

const maxFileSize = 4 * 1024 * 1024;
const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ schoolPublicId: string }> },
) {
  const { schoolPublicId } = await params;
  if (!z.string().uuid().safeParse(schoolPublicId).success) {
    return Response.json({ error: "This registration link is invalid." }, { status: 404 });
  }
  const [school] = await db.select({
    id: schools.id,
    publicId: schools.publicId,
  }).from(schools).where(and(
    eq(schools.publicId, schoolPublicId),
    eq(schools.status, schoolWorkspaceStatuses.active),
    isNull(schools.archivedAt),
  )).limit(1);
  if (!school) return Response.json({ error: "This registration link is no longer available." }, { status: 404 });

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "";
  const allowed = await consumePublicAdmissionRateLimit({
    schoolId: school.id,
    operation: "upload",
    clientAddress: address,
    maxRequests: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) return Response.json({ error: "Too many uploads. Please wait before trying again." }, { status: 429 });

  const formData = await request.formData();
  const purpose = z.enum(["document", "profile-photo"]).safeParse(formData.get("purpose"));
  const file = formData.get("file");
  if (!purpose.success || !(file instanceof File)) {
    return Response.json({ error: "Choose a valid file." }, { status: 400 });
  }
  const allowedTypes = purpose.data === "profile-photo" ? allowedPhotoTypes : allowedDocumentTypes;
  if (!file.size || file.size > maxFileSize || !allowedTypes.has(file.type)) {
    return Response.json({
      error: purpose.data === "profile-photo"
        ? "Choose a JPEG, PNG, or WebP photo no larger than 4 MB."
        : "Choose a PDF, JPEG, PNG, or WebP file no larger than 4 MB.",
    }, { status: 400 });
  }
  if (!isObjectStorageConfigured()) {
    return Response.json({ error: "Uploads are unavailable because object storage is not configured." }, { status: 503 });
  }

  const body = new Uint8Array(await file.arrayBuffer());
  if (!matchesFileSignature(file.type, body)) {
    return Response.json({ error: "The file contents do not match the selected file type." }, { status: 400 });
  }
  const fileName = file.name.slice(0, 160);
  const uploaded = await getObjectStorage().uploadObject({
    contentType: file.type,
    fileName,
    schoolPublicId: school.publicId,
    body,
  });
  await db.insert(uploadedFiles).values({
    publicId: randomUUID(),
    schoolId: school.id,
    uploadedBy: null,
    storageKey: uploaded.objectKey,
    fileName,
    contentType: file.type,
    byteSize: file.size,
  });
  return Response.json({ ...uploaded, fileName });
}
