import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { students, uploadedFiles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";

const maxFileSize = 4 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const uploadMode = z.enum(["create", "update"]).safeParse(formData.get("mode"));
  const uploadPurpose = z.enum(["document", "profile-photo"]).safeParse(
    formData.get("purpose") ?? "document",
  );
  const studentPublicId = z.string().uuid().optional().safeParse(formData.get("studentPublicId") || undefined);
  const file = formData.get("file");

  if (!uploadMode.success || !uploadPurpose.success || !studentPublicId.success || !(file instanceof File)) {
    return Response.json({ error: "Choose a valid document file." }, { status: 400 });
  }
  const validContentType = uploadPurpose.data === "profile-photo"
    ? new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)
    : allowedTypes.has(file.type);
  if (file.size === 0 || file.size > maxFileSize || !validContentType) {
    return Response.json(
      {
        error: uploadPurpose.data === "profile-photo"
          ? "Choose a JPEG, PNG, or WebP photo no larger than 4 MB."
          : "Choose a PDF, JPEG, PNG, or WebP file no larger than 4 MB.",
      },
      { status: 400 },
    );
  }
  if (uploadMode.data === "update" && !studentPublicId.data) {
    return Response.json({ error: "The student record for this upload is missing." }, { status: 400 });
  }

  const context = await requireSchoolPermission(
    uploadMode.data === "create" ? "students.create" : "students.update",
  );
  if (studentPublicId.data) {
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.publicId, studentPublicId.data),
        eq(students.schoolId, context.schoolId),
      ))
      .limit(1);
    if (!student) return Response.json({ error: "Student record was not found." }, { status: 404 });
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
  await db.insert(uploadedFiles).values({
    publicId: randomUUID(),
    schoolId: context.schoolId,
    uploadedBy: context.user.id,
    storageKey: uploaded.objectKey,
    fileName: file.name.slice(0, 160),
    contentType: file.type,
    byteSize: file.size,
  });
  return Response.json({ ...uploaded, fileName: file.name.slice(0, 160) });
}
