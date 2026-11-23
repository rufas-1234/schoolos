import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students, uploadedFiles, userStudentLinks } from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { getObjectStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const [{ publicId }, context] = await Promise.all([params, requireSchoolMember()]);
  const [student] = await db.select({
    id: students.id,
    email: students.email,
    status: students.status,
    additionalDetails: students.additionalDetails,
  }).from(students).where(and(
    eq(students.publicId, publicId),
    eq(students.schoolId, context.schoolId),
  )).limit(1);
  if (!student || !["active", "admitted"].includes(student.status)) {
    return Response.json({ error: "Student photo not found." }, { status: 404 });
  }

  const linkedRows = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks).where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const linkedStudentIds = linkedRows.map((row) => row.studentId);
  const isLinked = linkedStudentIds.includes(student.id) ||
    (!linkedStudentIds.length && Boolean(context.user.email) && student.email === context.user.email);
  if (!isLinked) return Response.json({ error: "Student photo not found." }, { status: 404 });

  const photo = student.additionalDetails?.profilePhoto;
  if (
    !photo?.objectKey ||
    !photo.fileName ||
    !photo.objectKey.startsWith(`${context.schoolPublicId}/`)
  ) {
    return Response.json({ error: "Student photo not found." }, { status: 404 });
  }

  const [storedFile] = await db.select({
    storageKey: uploadedFiles.storageKey,
    fileName: uploadedFiles.fileName,
    contentType: uploadedFiles.contentType,
  }).from(uploadedFiles).where(and(
    eq(uploadedFiles.schoolId, context.schoolId),
    eq(uploadedFiles.storageKey, photo.objectKey),
    eq(uploadedFiles.fileName, photo.fileName),
  )).limit(1);
  if (!storedFile || !["image/jpeg", "image/png", "image/webp"].includes(storedFile.contentType)) {
    return Response.json({ error: "Student photo not found." }, { status: 404 });
  }

  const response = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    disposition: "inline",
  });
  if (!response) return Response.json({ error: "Student photo not found." }, { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}
