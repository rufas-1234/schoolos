"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  studentCertificates,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type CertificateActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  certificatePublicId?: string;
};

const idField = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().positive().safe());
const issueCertificateSchema = z.object({
  academicYearId: idField,
  studentId: idField,
  category: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(160),
  achievement: z.string().trim().min(6).max(2000),
  issuedAt: z.string().refine(isCalendarDate),
});

export async function issueStudentCertificate(
  _previousState: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const result = issueCertificateSchema.safeParse({
    academicYearId: formData.get("academicYearId"),
    studentId: formData.get("studentId"),
    category: formData.get("category"),
    title: formData.get("title"),
    achievement: formData.get("achievement"),
    issuedAt: formData.get("issuedAt"),
  });
  if (!result.success) {
    return { error: "Choose an enrolled student and enter a category, certificate title, achievement, and valid issue date." };
  }

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [year] = await tx
        .select({ id: academicYears.id, startDate: academicYears.startDate })
        .from(academicYears)
        .where(and(
          eq(academicYears.id, result.data.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .limit(1);
      if (!year) return "year-not-found" as const;

      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .innerJoin(studentEnrollments, and(
          eq(studentEnrollments.studentId, students.id),
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, year.id),
          eq(studentEnrollments.status, "enrolled"),
        ))
        .where(and(
          eq(students.id, result.data.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .limit(1);
      if (!student) return "student-not-enrolled" as const;

      const certificateNumber =
        `CERT-${year.startDate.slice(0, 4)}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
      await tx.insert(studentCertificates).values({
        publicId,
        schoolId: context.schoolId,
        academicYearId: year.id,
        studentId: student.id,
        certificateNumber,
        category: result.data.category,
        title: result.data.title,
        achievement: result.data.achievement,
        issuedAt: result.data.issuedAt,
        issuedBy: context.user.id,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "academic.certificate.issued",
        resourceType: "student_certificate",
        resourcePublicId: publicId,
        changedFields: [
          "academicYearId",
          "studentId",
          "certificateNumber",
          "category",
          "title",
          "achievement",
          "issuedAt",
        ],
      });
      return "issued" as const;
    });

    if (outcome === "year-not-found") return { error: "Choose an academic year belonging to this school." };
    if (outcome === "student-not-enrolled") {
      return { error: "The selected student is not enrolled in the chosen academic year." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "A certificate number collision occurred. Please try issuing the certificate again." };
    }
    throw error;
  }

  revalidatePath("/admin/academics/certificates");
  revalidatePath("/admin/academics/overview");
  revalidatePath("/admin/dashboard");
  return {
    success: true,
    message: "Certificate issued successfully.",
    certificatePublicId: publicId,
  };
}
