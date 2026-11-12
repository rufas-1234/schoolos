import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string; slot: string }> },
) {
  const { publicId, slot } = await params;
  const slotIndex = Number(slot) - 1;
  if (!/^[1-4]$/.test(slot)) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const context = await requireSchoolPermission("students.view");
  const [student] = await db
    .select({ additionalDetails: students.additionalDetails })
    .from(students)
    .where(and(eq(students.publicId, publicId), eq(students.schoolId, context.schoolId)))
    .limit(1);
  const document = student?.additionalDetails?.documents[slotIndex];
  if (!document?.objectKey || !document.fileName) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  if (!document.objectKey.startsWith(`${context.schoolPublicId}/`)) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  const [storedFile] = await db
    .select({ storageKey: uploadedFiles.storageKey, fileName: uploadedFiles.fileName })
    .from(uploadedFiles)
    .where(and(
      eq(uploadedFiles.schoolId, context.schoolId),
      eq(uploadedFiles.storageKey, document.objectKey),
    ))
    .limit(1);
  if (!storedFile || storedFile.fileName !== document.fileName) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const downloadResponse = await getObjectStorage().downloadObject({
    objectKey: storedFile.storageKey,
    fileName: storedFile.fileName,
  });
  return downloadResponse ?? Response.json({ error: "Document not found." }, { status: 404 });
}
