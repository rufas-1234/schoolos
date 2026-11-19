import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { schools, uploadedFiles } from "@/db/schema";
import { consumePublicAdmissionRateLimit } from "@/lib/public-admission-rate-limit";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";

const maxFileSize = 4 * 1024 * 1024;
const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function matchesFileSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "application/pdf") {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return contentType === "image/webp" && bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 &&
    bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

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
  }).from(schools).where(eq(schools.publicId, schoolPublicId)).limit(1);
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
