import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const context = await requireSchoolPermission("students.view");
  const [student] = await db
    .select({ profilePhoto: students.additionalDetails })
    .from(students)
    .where(and(eq(students.publicId, publicId), eq(students.schoolId, context.schoolId)))
    .limit(1);
  const photo = student?.profilePhoto?.profilePhoto;
  if (
    !photo?.objectKey ||
    !photo.fileName ||
    !photo.objectKey.startsWith(`${context.schoolPublicId}/`)
  ) {
    return Response.json({ error: "Student photo not found." }, { status: 404 });
  }

  const [storedFile] = await db
    .select({
      storageKey: uploadedFiles.storageKey,
      fileName: uploadedFiles.fileName,
      contentType: uploadedFiles.contentType,
    })
    .from(uploadedFiles)
    .where(and(
      eq(uploadedFiles.schoolId, context.schoolId),
      eq(uploadedFiles.storageKey, photo.objectKey),
      eq(uploadedFiles.fileName, photo.fileName),
    ))
    .limit(1);
  if (!storedFile || !["image/jpeg", "image/png", "image/webp"].includes(storedFile.contentType)) {
    return Response.json({ error: "Student photo not found." }, { status: 404 });
  }

  const photoResponse = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    disposition: "inline",
  });
  return photoResponse ?? Response.json({ error: "Student photo not found." }, { status: 404 });
}
