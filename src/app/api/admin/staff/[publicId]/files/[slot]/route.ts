import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffMembers, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage } from "@/lib/storage";

const slots = ["profilePhoto", "resume", "joiningLetter", "otherDocument"] as const;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set([...photoTypes, "application/pdf"]);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string; slot: string }> },
) {
  const { publicId, slot } = await params;
  const parsedPublicId = z.string().uuid().safeParse(publicId);
  const parsedSlot = z.enum(slots).safeParse(slot);
  if (!parsedPublicId.success || !parsedSlot.success) {
    return Response.json({ error: "Staff file not found." }, { status: 404 });
  }

  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [staff] = await db.select({
    documents: staffMembers.documents,
  }).from(staffMembers).where(and(
    eq(staffMembers.publicId, parsedPublicId.data),
    eq(staffMembers.schoolId, context.schoolId),
  )).limit(1);
  const document = staff?.documents?.[parsedSlot.data];
  if (!document?.fileName || !document.objectKey ||
      !document.objectKey.startsWith(`${context.schoolPublicId}/`)) {
    return Response.json({ error: "Staff file not found." }, { status: 404 });
  }

  const [storedFile] = await db.select({
    storageKey: uploadedFiles.storageKey,
    fileName: uploadedFiles.fileName,
    contentType: uploadedFiles.contentType,
  }).from(uploadedFiles).where(and(
    eq(uploadedFiles.schoolId, context.schoolId),
    eq(uploadedFiles.storageKey, document.objectKey),
    eq(uploadedFiles.fileName, document.fileName),
  )).limit(1);
  const allowedTypes = parsedSlot.data === "profilePhoto" ? photoTypes : documentTypes;
  if (!storedFile || !allowedTypes.has(storedFile.contentType)) {
    return Response.json({ error: "Staff file not found." }, { status: 404 });
  }

  const response = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    disposition: parsedSlot.data === "profilePhoto" ? "inline" : "attachment",
  });
  return response ?? Response.json({ error: "Staff file not found." }, { status: 404 });
}
