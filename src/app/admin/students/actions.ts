"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  schoolBranches,
  studentCategories,
  studentEnrollments,
  students,
  type StudentAdditionalDetails,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { canTransitionStudentStatus, studentStatuses } from "@/lib/student-policy";

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const optionalIdField = z.union([z.literal(""), idField]).transform((value) => value || null);
const dateField = z.string().refine(isCalendarDate, "Enter a valid calendar date.");
const optionalDateField = z.union([z.literal(""), dateField]).transform((value) => value || null);
const emailField = z.union([z.literal(""), z.string().trim().email().max(320)]);
const genderField = z.enum(["female", "male", "other", "non_binary", "prefer_not_to_say"]);
const bloodGroupField = z.enum(["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const shortText = z.string().trim().max(160);
const phoneField = z.string().trim().max(40);
const studentAdditionalDetailsSchema = z.object({
  caste: z.string().trim().max(120),
  heightInches: z.union([z.literal(""), z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/)]),
  weightKg: z.union([z.literal(""), z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/)]),
  nationalIdNumber: z.string().trim().max(100),
  birthCertificateNumber: z.string().trim().max(100),
  additionalNotes: z.string().trim().max(2000),
  bankName: z.string().trim().max(160),
  bankAccountNumber: z.string().trim().max(100),
  bankIfscCode: z.string().trim().max(40),
  profilePhoto: z.object({
    fileName: z.string().trim().max(160),
    objectKey: z.string().trim().max(512),
  }),
  documents: z.array(z.object({
    title: z.string().trim().max(120),
    fileName: z.string().trim().max(160),
    objectKey: z.string().trim().max(512),
  })).length(4).superRefine((documents, ctx) => {
    documents.forEach((document, index) => {
      if (Boolean(document.fileName) !== Boolean(document.objectKey)) {
        ctx.addIssue({
          code: "custom",
          message: "Each uploaded document must include its file and storage reference.",
          path: [index],
        });
      }
      if (document.objectKey && !document.title) {
        ctx.addIssue({
          code: "custom",
          message: "Add a title for each uploaded document.",
          path: [index, "title"],
        });
      }
    });
  }),
  previousSchoolDetails: z.string().trim().max(2000),
  transportRoute: z.string().trim().max(160),
  vehicleNumber: z.string().trim().max(80),
  dormitoryName: z.string().trim().max(160),
  dormitoryRoom: z.string().trim().max(80),
  customFieldName: z.string().trim().max(160),
  customFieldValue: z.string().trim().max(1000),
}) satisfies z.ZodType<StudentAdditionalDetails>;

const personalDetailsSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  gender: genderField,
  dateOfBirth: dateField.refine((value) => value <= new Date().toISOString().slice(0, 10), {
    message: "Date of birth cannot be in the future.",
  }),
  email: emailField,
  phone: z.string().trim().min(1).max(40),
  religion: z.string().trim().max(100),
  bloodGroup: bloodGroupField,
  currentAddress: z.string().trim().max(1000),
  permanentAddress: z.string().trim().max(1000),
  fatherName: shortText,
  fatherOccupation: z.string().trim().max(120),
  fatherPhone: phoneField,
  motherName: shortText,
  motherOccupation: z.string().trim().max(120),
  motherPhone: phoneField,
  guardianName: shortText,
  guardianRelation: z.string().trim().max(80),
  guardianEmail: emailField,
  guardianPhone: phoneField,
  guardianOccupation: z.string().trim().max(120),
  guardianAddress: z.string().trim().max(1000),
  additionalDetails: studentAdditionalDetailsSchema,
  categoryId: optionalIdField,
});

const admissionSchema = personalDetailsSchema.extend({
  branchId: idField,
  academicYearId: idField,
  classLevelId: idField,
  classSectionId: idField,
  admissionNumber: z.string().trim().min(1).max(40),
  rollNumber: z.string().trim().max(40),
  admissionDate: optionalDateField,
});

const updateStudentSchema = personalDetailsSchema.extend({
  branchId: idField,
  admissionNumber: z.string().trim().max(40),
  admissionDate: optionalDateField,
});

export type StudentActionState = {
  error?: string;
  success?: boolean;
}

function revalidateStudentPages() {
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/categories");
  revalidatePath("/admin/students/disabled");
  revalidatePath("/admin/students/unassigned");
  revalidatePath("/admin/students/groups");
}

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readPersonalDetails(formData: FormData) {
  return {
    firstName: readFormValue(formData, "firstName"),
    lastName: readFormValue(formData, "lastName"),
    gender: readFormValue(formData, "gender"),
    dateOfBirth: readFormValue(formData, "dateOfBirth"),
    email: readFormValue(formData, "email"),
    phone: readFormValue(formData, "phone"),
    religion: readFormValue(formData, "religion"),
    bloodGroup: readFormValue(formData, "bloodGroup"),
    currentAddress: readFormValue(formData, "currentAddress"),
    permanentAddress: readFormValue(formData, "permanentAddress"),
    fatherName: readFormValue(formData, "fatherName"),
    fatherOccupation: readFormValue(formData, "fatherOccupation"),
    fatherPhone: readFormValue(formData, "fatherPhone"),
    motherName: readFormValue(formData, "motherName"),
    motherOccupation: readFormValue(formData, "motherOccupation"),
    motherPhone: readFormValue(formData, "motherPhone"),
    guardianName: readFormValue(formData, "guardianName"),
    guardianRelation: readFormValue(formData, "guardianRelation"),
    guardianEmail: readFormValue(formData, "guardianEmail"),
    guardianPhone: readFormValue(formData, "guardianPhone"),
    guardianOccupation: readFormValue(formData, "guardianOccupation"),
    guardianAddress: readFormValue(formData, "guardianAddress"),
    additionalDetails: {
      caste: readFormValue(formData, "caste"),
      heightInches: readFormValue(formData, "heightInches"),
      weightKg: readFormValue(formData, "weightKg"),
      nationalIdNumber: readFormValue(formData, "nationalIdNumber"),
      birthCertificateNumber: readFormValue(formData, "birthCertificateNumber"),
      additionalNotes: readFormValue(formData, "additionalNotes"),
      bankName: readFormValue(formData, "bankName"),
      bankAccountNumber: readFormValue(formData, "bankAccountNumber"),
      bankIfscCode: readFormValue(formData, "bankIfscCode"),
      profilePhoto: {
        fileName: readFormValue(formData, "profilePhotoFileName"),
        objectKey: readFormValue(formData, "profilePhotoObjectKey"),
      },
      documents: Array.from({ length: 4 }, (_, index) => {
        const slot = index + 1;
        return {
          title: readFormValue(formData, `documentTitle${slot}`),
          fileName: readFormValue(formData, `documentFileName${slot}`),
          objectKey: readFormValue(formData, `documentObjectKey${slot}`),
        };
      }),
      previousSchoolDetails: readFormValue(formData, "previousSchoolDetails"),
      transportRoute: readFormValue(formData, "transportRoute"),
      vehicleNumber: readFormValue(formData, "vehicleNumber"),
      dormitoryName: readFormValue(formData, "dormitoryName"),
      dormitoryRoom: readFormValue(formData, "dormitoryRoom"),
      customFieldName: readFormValue(formData, "customFieldName"),
      customFieldValue: readFormValue(formData, "customFieldValue"),
    },
    categoryId: readFormValue(formData, "categoryId"),
  };
}

function studentInsertValues(
  schoolId: number,
  branchId: number,
  admissionNumber: string,
  admissionDate: string | null,
  personal: z.infer<typeof personalDetailsSchema>,
) {
  return {
    schoolId,
    branchId,
    categoryId: personal.categoryId,
    admissionNumber,
    admissionDate,
    dateOfBirth: personal.dateOfBirth,
    firstName: personal.firstName,
    lastName: personal.lastName,
    gender: personal.gender,
    email: personal.email || null,
    phone: personal.phone || null,
    religion: personal.religion || null,
    bloodGroup: personal.bloodGroup || null,
    currentAddress: personal.currentAddress || null,
    permanentAddress: personal.permanentAddress || null,
    fatherName: personal.fatherName || null,
    fatherOccupation: personal.fatherOccupation || null,
    fatherPhone: personal.fatherPhone || null,
    motherName: personal.motherName || null,
    motherOccupation: personal.motherOccupation || null,
    motherPhone: personal.motherPhone || null,
    guardianName: personal.guardianName || null,
    guardianRelation: personal.guardianRelation || null,
    guardianEmail: personal.guardianEmail || null,
    guardianPhone: personal.guardianPhone || null,
    guardianOccupation: personal.guardianOccupation || null,
    guardianAddress: personal.guardianAddress || null,
    additionalDetails: personal.additionalDetails,
  };
}

function hasValidDocumentScope(details: StudentAdditionalDetails, schoolPublicId: string): boolean {
  const schoolPrefix = `${schoolPublicId}/`;
  const profilePhoto = details.profilePhoto;
  const hasValidPhoto = Boolean(profilePhoto?.objectKey) === Boolean(profilePhoto?.fileName) &&
    (!profilePhoto?.objectKey || profilePhoto.objectKey.startsWith(schoolPrefix));
  return hasValidPhoto && details.documents.every(
    (document) => !document.objectKey || document.objectKey.startsWith(schoolPrefix),
  );
}

export async function createStudent(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const context = await requireSchoolPermission("students.create");
  const result = admissionSchema.safeParse({
    ...readPersonalDetails(formData),
    branchId: readFormValue(formData, "branchId"),
    academicYearId: readFormValue(formData, "academicYearId"),
    classLevelId: readFormValue(formData, "classLevelId"),
    classSectionId: readFormValue(formData, "classSectionId"),
    admissionNumber: readFormValue(formData, "admissionNumber"),
    rollNumber: readFormValue(formData, "rollNumber"),
    admissionDate: readFormValue(formData, "admissionDate"),
  });
  if (!result.success) {
    return { error: "Review the required fields, dates, email addresses, and student details." };
  }

  const admission = result.data;
  if (!hasValidDocumentScope(admission.additionalDetails, context.schoolPublicId)) {
    return { error: "The uploaded documents do not belong to this school." };
  }
  const admissionDate = admission.admissionDate ?? new Date().toISOString().slice(0, 10);
  if (!isCalendarDate(admissionDate)) return { error: "Enter a valid admission date." };
  const publicId = randomUUID();
  const enrollmentPublicId = randomUUID();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: schoolBranches.id })
        .from(schoolBranches)
        .where(
          and(
            eq(schoolBranches.id, admission.branchId),
            eq(schoolBranches.schoolId, context.schoolId),
            eq(schoolBranches.status, "active"),
          ),
        )
        .limit(1);
      if (!branch) return "branch-not-found";

      const [year] = await tx
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.id, admission.academicYearId),
            eq(academicYears.schoolId, context.schoolId),
            eq(academicYears.status, "active"),
          ),
        )
        .limit(1);
      if (!year) return "year-not-found";

      const [classLevel] = await tx
        .select({ id: classLevels.id })
        .from(classLevels)
        .where(
          and(
            eq(classLevels.id, admission.classLevelId),
            eq(classLevels.schoolId, context.schoolId),
            eq(classLevels.branchId, admission.branchId),
          ),
        )
        .limit(1);
      if (!classLevel) return "class-not-found";

      const [section] = await tx
        .select({ id: classSections.id })
        .from(classSections)
        .where(
          and(
            eq(classSections.id, admission.classSectionId),
            eq(classSections.schoolId, context.schoolId),
            eq(classSections.academicYearId, admission.academicYearId),
            eq(classSections.classLevelId, admission.classLevelId),
          ),
        )
        .limit(1);
      if (!section) return "section-not-found";

      if (admission.categoryId !== null) {
        const [category] = await tx
          .select({ id: studentCategories.id })
          .from(studentCategories)
          .where(
            and(
              eq(studentCategories.id, admission.categoryId),
              eq(studentCategories.schoolId, context.schoolId),
              eq(studentCategories.branchId, admission.branchId),
            ),
          )
          .limit(1);
        if (!category) return "category-not-found";
      }

      const [duplicate] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.schoolId, context.schoolId),
            eq(students.admissionNumber, admission.admissionNumber),
          ),
        )
        .limit(1);
      if (duplicate) return "duplicate-admission-number";

      const [createdStudent] = await tx
        .insert(students)
        .values({
          publicId,
          ...studentInsertValues(
            context.schoolId,
            admission.branchId,
            admission.admissionNumber,
            admissionDate,
            admission,
          ),
          status: "pending",
        })
        .$returningId();
      await tx.insert(studentEnrollments).values({
        publicId: enrollmentPublicId,
        schoolId: context.schoolId,
        studentId: createdStudent.id,
        academicYearId: admission.academicYearId,
        classSectionId: admission.classSectionId,
        rollNumber: admission.rollNumber || null,
        status: "pending",
        enrolledAt: admissionDate,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "student.admission.created",
        resourceType: "student",
        resourcePublicId: publicId,
        changedFields: [
          "branchId",
          "categoryId",
          "admissionNumber",
          "academicYearId",
          "classSectionId",
          "dateOfBirth",
          "firstName",
          "lastName",
          "gender",
          "email",
          "phone",
          "guardianName",
          "guardianPhone",
          "additionalDetails",
        ],
      });
      return "created";
    });

    if (outcome === "branch-not-found") return { error: "Choose an active branch in your school." };
    if (outcome === "year-not-found") return { error: "Choose an active academic year in your school." };
    if (outcome === "class-not-found") return { error: "Choose a class belonging to the selected branch." };
    if (outcome === "section-not-found") {
      return { error: "Choose a section belonging to the selected class and academic year." };
    }
    if (outcome === "category-not-found") {
      return { error: "Choose a category belonging to the selected branch." };
    }
    if (outcome === "duplicate-admission-number") {
      return { error: "That admission number is already in use at this school." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "That admission number is already in use at this school." };
    }
    throw error;
  }

  revalidateStudentPages();
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function updateStudent(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const context = await requireSchoolPermission("students.update");
  const publicId = z.string().uuid().safeParse(formData.get("publicId"));
  const admissionNumber = readFormValue(formData, "admissionNumber");
  const result = updateStudentSchema.safeParse({
    ...readPersonalDetails(formData),
    branchId: readFormValue(formData, "branchId"),
    admissionNumber,
    admissionDate: readFormValue(formData, "admissionDate"),
  });
  if (!publicId.success || !result.success) {
    return { error: "Review the required fields, dates, email addresses, and student details." };
  }

  const details = result.data;
  if (!hasValidDocumentScope(details.additionalDetails, context.schoolPublicId)) {
    return { error: "The uploaded documents do not belong to this school." };
  }
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        branchId: students.branchId,
      })
      .from(students)
      .where(and(eq(students.publicId, publicId.data), eq(students.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!student) return "student-not-found";
    if (student.branchId !== null && student.branchId !== details.branchId) return "branch-mismatch";

    const [branch] = await tx
      .select({ id: schoolBranches.id })
      .from(schoolBranches)
      .where(
        and(
          eq(schoolBranches.id, details.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    if (!branch) return "branch-not-found";
    if (details.categoryId !== null) {
      const [category] = await tx
        .select({ id: studentCategories.id })
        .from(studentCategories)
        .where(
          and(
            eq(studentCategories.id, details.categoryId),
            eq(studentCategories.schoolId, context.schoolId),
            eq(studentCategories.branchId, details.branchId),
          ),
        )
        .limit(1);
      if (!category) return "category-not-found";
    }

    if (admissionNumber) {
      const [duplicate] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.schoolId, context.schoolId),
            eq(students.admissionNumber, admissionNumber),
            ne(students.id, student.id),
          ),
        )
        .limit(1);
      if (duplicate) return "duplicate-admission-number";
    }

    await tx
      .update(students)
      .set({
        ...studentInsertValues(
          context.schoolId,
          details.branchId,
          admissionNumber,
          details.admissionDate,
          details,
        ),
      })
      .where(and(eq(students.id, student.id), eq(students.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.profile.updated",
      resourceType: "student",
      resourcePublicId: publicId.data,
      changedFields: [
        "categoryId",
        "dateOfBirth",
        "firstName",
        "lastName",
        "gender",
        "email",
        "phone",
        "religion",
        "bloodGroup",
        "currentAddress",
        "permanentAddress",
        "parentAndGuardianDetails",
        "additionalDetails",
      ],
    });
    return "updated";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate-admission-number" as const;
    console.error("Student profile update failed; transaction rolled back.", error);
    return "update-failed" as const;
  });

  if (outcome === "update-failed") {
    return { error: "Student record could not be saved. No changes were made; check the details and try again." };
  }
  if (outcome === "student-not-found") return { error: "Student record was not found in this school." };
  if (outcome === "branch-mismatch") {
    return { error: "An assigned student cannot be moved to another branch by editing the profile." };
  }
  if (outcome === "branch-not-found") return { error: "Choose a branch in your school." };
  if (outcome === "category-not-found") {
    return { error: "Choose a category belonging to the student's branch." };
  }
  if (outcome === "duplicate-admission-number") {
    return { error: "That admission number is already in use at this school." };
  }

  revalidateStudentPages();
  revalidatePath("/admin/dashboard");
  return { success: true };
}

const transitionSchema = z.object({
  publicId: z.string().uuid(),
  nextStatus: z.enum(studentStatuses),
});

export async function transitionStudentStatus(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.update");
  const result = transitionSchema.safeParse({
    publicId: formData.get("publicId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) throw new Error("Invalid admission status request.");

  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        status: students.status,
      })
      .from(students)
      .where(
        and(
          eq(students.publicId, result.data.publicId),
          eq(students.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);

    if (!student) return "not-found";
    if (!canTransitionStudentStatus(student.status, result.data.nextStatus)) {
      return "invalid-transition";
    }

    await tx
      .update(students)
      .set({ status: result.data.nextStatus })
      .where(and(eq(students.id, student.id), eq(students.schoolId, context.schoolId)));

    if (result.data.nextStatus === "admitted") {
      await tx
        .update(studentEnrollments)
        .set({ status: "enrolled" })
        .where(
          and(
            eq(studentEnrollments.studentId, student.id),
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.status, "pending"),
          ),
        );
    } else if (result.data.nextStatus === "rejected") {
      await tx
        .update(studentEnrollments)
        .set({ status: "rejected" })
        .where(
          and(
            eq(studentEnrollments.studentId, student.id),
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.status, "pending"),
          ),
        );
    } else if (result.data.nextStatus === "pending") {
      await tx
        .update(studentEnrollments)
        .set({ status: "pending" })
        .where(
          and(
            eq(studentEnrollments.studentId, student.id),
            eq(studentEnrollments.schoolId, context.schoolId),
            inArray(studentEnrollments.status, ["enrolled", "rejected"]),
          ),
        );
    }

    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `student.status.${student.status}.to.${result.data.nextStatus}`,
      resourceType: "student",
      resourcePublicId: student.publicId,
      changedFields: ["status", "enrollmentStatus"],
    });
    return "updated";
  });

  if (outcome === "not-found") throw new Error("Student record was not found in this school.");
  if (outcome === "invalid-transition") {
    throw new Error("This student status cannot be changed through that transition.");
  }

  revalidateStudentPages();
  revalidatePath("/admin/dashboard");
}
