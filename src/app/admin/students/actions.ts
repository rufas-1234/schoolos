"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  schoolBranches,
  schools,
  session,
  studentCategories,
  studentEnrollments,
  studentSettings,
  students,
  roles,
  schoolMemberships,
  user,
  userLoginIdentifiers,
  userRoles,
  userStudentLinks,
  uploadedFiles,
  type StudentAdditionalDetails,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { issuePasswordSetupLink } from "@/lib/account-setup";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { normalizeAdmissionIdentifier } from "@/lib/login-identifier-policy";
import { consumePublicAdmissionRateLimit } from "@/lib/public-admission-rate-limit";
import { canTransitionStudentStatus, studentStatuses } from "@/lib/student-policy";
import {
  defaultStudentFieldSettings,
  formatStudentIdentifier,
  normalizeStudentFieldSettings,
  studentSettingFields,
} from "@/lib/student-settings";

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
  gender: z.union([z.literal(""), genderField]),
  dateOfBirth: optionalDateField.refine((value) => !value || value <= new Date().toISOString().slice(0, 10), {
    message: "Date of birth cannot be in the future.",
  }),
  email: emailField,
  phone: phoneField,
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
  admissionDate: optionalDateField,
});

const updateStudentSchema = personalDetailsSchema.extend({
  branchId: idField,
  admissionDate: optionalDateField,
});

export type StudentActionState = {
  error?: string;
  success?: boolean;
  setupUrls?: string[];
  message?: string;
  completed?: number;
  failures?: string[];
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

function requiredStudentFieldError(
  formData: FormData,
  fieldSettings: ReturnType<typeof normalizeStudentFieldSettings>,
) {
  for (const field of studentSettingFields) {
    if (!fieldSettings[field.name].enabled || !fieldSettings[field.name].required) continue;
    if (field.locked && field.group === "Admission") continue;
    const value = field.name === "profilePhoto"
      ? readFormValue(formData, "profilePhotoFileName")
      : field.name === "studentDocuments"
        ? Array.from({ length: 4 }, (_, index) => readFormValue(formData, `documentFileName${index + 1}`)).find(Boolean) ?? ""
        : readFormValue(formData, field.name);
    if (!value.trim()) return `${field.label} is required.`;
  }
  return null;
}

type StudentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function generateIdentifier(
  tx: StudentTransaction,
  schoolId: number,
  format: string,
  startSequence: number,
  kind: "admission" | "roll",
  date: string,
) {
  for (let sequence = startSequence; sequence < startSequence + 100_000; sequence++) {
    const value = formatStudentIdentifier(format, sequence, date);
    if (!value) throw new Error(`The configured ${kind} number format is invalid.`);
    const [existing] = kind === "admission"
      ? await tx.select({ id: students.id }).from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.admissionNumber, value))).limit(1)
      : await tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
        .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.rollNumber, value))).limit(1);
    if (!existing) return { value, nextSequence: sequence + 1 };
  }
  throw new Error(`Unable to generate an unused ${kind} number.`);
}

function studentInsertValues(
  schoolId: number,
  branchId: number,
  admissionNumber: string | null,
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
    gender: personal.gender || null,
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
  const [savedSettings] = await db.select({ fields: studentSettings.fields })
    .from(studentSettings).where(eq(studentSettings.schoolId, context.schoolId)).limit(1);
  const fieldSettings = normalizeStudentFieldSettings(savedSettings?.fields);
  const requiredError = requiredStudentFieldError(formData, fieldSettings);
  if (requiredError) return { error: requiredError };
  const result = admissionSchema.safeParse({
    ...readPersonalDetails(formData),
    branchId: readFormValue(formData, "branchId"),
    academicYearId: readFormValue(formData, "academicYearId"),
    classLevelId: readFormValue(formData, "classLevelId"),
    classSectionId: readFormValue(formData, "classSectionId"),
    admissionDate: readFormValue(formData, "admissionDate"),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Student details")}: ${issue.message}` : "Review the student details and try again." };
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
      await tx.insert(studentSettings).values({
        schoolId: context.schoolId,
        fields: defaultStudentFieldSettings,
      }).onDuplicateKeyUpdate({ set: { schoolId: context.schoolId } });
      const [identifierSettings] = await tx.select().from(studentSettings)
        .where(eq(studentSettings.schoolId, context.schoolId)).for("update").limit(1);
      if (!identifierSettings) throw new Error("Student identifier settings could not be initialized.");

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

      const generatedAdmission = await generateIdentifier(
        tx,
        context.schoolId,
        identifierSettings.admissionFormat,
        identifierSettings.nextAdmissionSequence,
        "admission",
        admissionDate,
      );
      const generatedRoll = await generateIdentifier(
        tx,
        context.schoolId,
        identifierSettings.rollFormat,
        identifierSettings.nextRollSequence,
        "roll",
        admissionDate,
      );

      const [createdStudent] = await tx
        .insert(students)
        .values({
          publicId,
          ...studentInsertValues(
            context.schoolId,
            admission.branchId,
            generatedAdmission.value,
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
        rollNumber: generatedRoll.value,
        status: "pending",
        enrolledAt: admissionDate,
      });
      await tx.update(studentSettings).set({
        nextAdmissionSequence: generatedAdmission.nextSequence,
        nextRollSequence: generatedRoll.nextSequence,
      }).where(eq(studentSettings.id, identifierSettings.id));
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
          "rollNumber",
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
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "A generated student identifier collided with an existing record. No changes were saved; try again." };
    }
    throw error;
  }

  revalidateStudentPages();
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function createPublicStudentAdmissionApplication(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const schoolPublicId = z.string().uuid().safeParse(formData.get("schoolPublicId"));
  if (!schoolPublicId.success) return { error: "This registration link is invalid." };
  if (formData.get("consent") !== "on") return { error: "Please confirm that the information is accurate." };

  const [school] = await db.select({
    id: schools.id,
    publicId: schools.publicId,
  }).from(schools).where(and(
    eq(schools.publicId, schoolPublicId.data),
    eq(schools.status, schoolWorkspaceStatuses.active),
    isNull(schools.archivedAt),
  )).limit(1);
  if (!school) return { error: "This registration link is no longer available." };

  const [savedSettings] = await db.select({ fields: studentSettings.fields })
    .from(studentSettings).where(eq(studentSettings.schoolId, school.id)).limit(1);
  const fieldSettings = normalizeStudentFieldSettings(savedSettings?.fields);
  for (const field of studentSettingFields) {
    if (fieldSettings[field.name].enabled) continue;
    if (field.name === "profilePhoto") {
      formData.set("profilePhotoFileName", "");
      formData.set("profilePhotoObjectKey", "");
    } else if (field.name === "studentDocuments") {
      for (let slot = 1; slot <= 4; slot++) {
        formData.set(`documentTitle${slot}`, "");
        formData.set(`documentFileName${slot}`, "");
        formData.set(`documentObjectKey${slot}`, "");
      }
    } else {
      formData.set(field.name, "");
    }
  }
  const requiredError = requiredStudentFieldError(formData, fieldSettings);
  if (requiredError) return { error: requiredError };
  const result = admissionSchema.safeParse({
    ...readPersonalDetails(formData),
    branchId: readFormValue(formData, "branchId"),
    academicYearId: readFormValue(formData, "academicYearId"),
    classLevelId: readFormValue(formData, "classLevelId"),
    classSectionId: readFormValue(formData, "classSectionId"),
    admissionDate: readFormValue(formData, "admissionDate"),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Student details")}: ${issue.message}` : "Review the student details and try again." };
  }

  const admission = result.data;
  if (!hasValidDocumentScope(admission.additionalDetails, school.publicId)) {
    return { error: "The uploaded documents do not belong to this school." };
  }
  const documentReferences = [
    ...(admission.additionalDetails.profilePhoto?.objectKey
      ? [{ objectKey: admission.additionalDetails.profilePhoto.objectKey, fileName: admission.additionalDetails.profilePhoto.fileName, photo: true }]
      : []),
    ...admission.additionalDetails.documents.filter((document) => document.objectKey)
      .map((document) => ({ objectKey: document.objectKey, fileName: document.fileName, photo: false })),
  ];
  if (documentReferences.length) {
    const fileRows = await db.select({
      storageKey: uploadedFiles.storageKey,
      fileName: uploadedFiles.fileName,
      contentType: uploadedFiles.contentType,
    }).from(uploadedFiles).where(and(
      eq(uploadedFiles.schoolId, school.id),
      inArray(uploadedFiles.storageKey, documentReferences.map((file) => file.objectKey)),
    ));
    if (fileRows.length !== documentReferences.length || documentReferences.some((file) => {
      const saved = fileRows.find((candidate) => candidate.storageKey === file.objectKey);
      return !saved || saved.fileName !== file.fileName ||
        (file.photo ? !["image/jpeg", "image/png", "image/webp"].includes(saved.contentType) :
          !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(saved.contentType));
    })) {
      return { error: "One or more uploaded files are invalid. Upload them again and retry." };
    }
  }

  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || "";
  const allowed = await consumePublicAdmissionRateLimit({
    schoolId: school.id,
    operation: "submission",
    clientAddress,
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) return { error: "Too many registration attempts. Please wait before submitting again." };

  const admissionDate = admission.admissionDate ?? new Date().toISOString().slice(0, 10);
  if (!isCalendarDate(admissionDate)) return { error: "Enter a valid admission date." };
  const publicId = randomUUID();
  const enrollmentPublicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.insert(studentSettings).values({
        schoolId: school.id,
        fields: defaultStudentFieldSettings,
      }).onDuplicateKeyUpdate({ set: { schoolId: school.id } });
      const [identifierSettings] = await tx.select().from(studentSettings)
        .where(eq(studentSettings.schoolId, school.id)).for("update").limit(1);
      if (!identifierSettings) throw new Error("Student identifier settings could not be initialized.");

      const [branch] = await tx.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
        eq(schoolBranches.id, admission.branchId),
        eq(schoolBranches.schoolId, school.id),
        eq(schoolBranches.status, "active"),
      )).limit(1);
      if (!branch) return "branch-not-found";

      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(
        eq(academicYears.id, admission.academicYearId),
        eq(academicYears.schoolId, school.id),
        eq(academicYears.status, "active"),
      )).limit(1);
      if (!year) return "year-not-found";

      const [classLevel] = await tx.select({ id: classLevels.id }).from(classLevels).where(and(
        eq(classLevels.id, admission.classLevelId),
        eq(classLevels.schoolId, school.id),
        eq(classLevels.branchId, admission.branchId),
      )).limit(1);
      if (!classLevel) return "class-not-found";

      const [section] = await tx.select({ id: classSections.id }).from(classSections).where(and(
        eq(classSections.id, admission.classSectionId),
        eq(classSections.schoolId, school.id),
        eq(classSections.academicYearId, admission.academicYearId),
        eq(classSections.classLevelId, admission.classLevelId),
      )).limit(1);
      if (!section) return "section-not-found";

      if (admission.categoryId !== null) {
        const [category] = await tx.select({ id: studentCategories.id }).from(studentCategories).where(and(
          eq(studentCategories.id, admission.categoryId),
          eq(studentCategories.schoolId, school.id),
          eq(studentCategories.branchId, admission.branchId),
        )).limit(1);
        if (!category) return "category-not-found";
      }

      const generatedAdmission = await generateIdentifier(
        tx,
        school.id,
        identifierSettings.admissionFormat,
        identifierSettings.nextAdmissionSequence,
        "admission",
        admissionDate,
      );
      const generatedRoll = await generateIdentifier(
        tx,
        school.id,
        identifierSettings.rollFormat,
        identifierSettings.nextRollSequence,
        "roll",
        admissionDate,
      );
      const [createdStudent] = await tx.insert(students).values({
        publicId,
        ...studentInsertValues(
          school.id,
          admission.branchId,
          generatedAdmission.value,
          admissionDate,
          admission,
        ),
        status: "pending",
      }).$returningId();
      await tx.insert(studentEnrollments).values({
        publicId: enrollmentPublicId,
        schoolId: school.id,
        studentId: createdStudent.id,
        academicYearId: admission.academicYearId,
        classSectionId: admission.classSectionId,
        rollNumber: generatedRoll.value,
        status: "pending",
        enrolledAt: admissionDate,
      });
      await tx.update(studentSettings).set({
        nextAdmissionSequence: generatedAdmission.nextSequence,
        nextRollSequence: generatedRoll.nextSequence,
      }).where(eq(studentSettings.id, identifierSettings.id));
      return "created";
    });

    if (outcome === "branch-not-found") return { error: "Choose an active branch in this school." };
    if (outcome === "year-not-found") return { error: "Choose an active academic year in this school." };
    if (outcome === "class-not-found") return { error: "Choose a class belonging to the selected branch." };
    if (outcome === "section-not-found") return { error: "Choose a section belonging to the selected class and academic year." };
    if (outcome === "category-not-found") return { error: "Choose a category belonging to the selected branch." };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "We could not assign a unique admission number. Please submit again." };
    }
    throw error;
  }

  revalidatePath("/admin/admissions");
  revalidatePath("/admin/students");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function updateStudent(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const context = await requireSchoolPermission("students.update");
  const publicId = z.string().uuid().safeParse(formData.get("publicId"));
  const [savedSettings] = await db.select({ fields: studentSettings.fields })
    .from(studentSettings).where(eq(studentSettings.schoolId, context.schoolId)).limit(1);
  const fieldSettings = normalizeStudentFieldSettings(savedSettings?.fields);
  const requiredError = requiredStudentFieldError(formData, fieldSettings);
  if (requiredError) return { error: requiredError };
  const result = updateStudentSchema.safeParse({
    ...readPersonalDetails(formData),
    branchId: readFormValue(formData, "branchId"),
    admissionDate: readFormValue(formData, "admissionDate"),
  });
  if (!publicId.success || !result.success) {
    const issue = result.success ? null : result.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Student details")}: ${issue.message}` : "Student record could not be saved. Check the details and try again." };
  }

  const details = result.data;
  const issueSetupLink = formData.get("issuePasswordSetup") === "true";
  if (!hasValidDocumentScope(details.additionalDetails, context.schoolPublicId)) {
    return { error: "The uploaded documents do not belong to this school." };
  }
  const setupUrls: string[] = [];
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        branchId: students.branchId,
        admissionNumber: students.admissionNumber,
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

    const linkedStudentUsers = await tx.select({
      userId: userStudentLinks.userId,
      email: user.email,
    })
      .from(userStudentLinks)
      .innerJoin(user, eq(user.id, userStudentLinks.userId))
      .where(and(
        eq(userStudentLinks.schoolId, context.schoolId),
        eq(userStudentLinks.studentId, student.id),
        eq(userStudentLinks.accessType, "student"),
      ))
      .for("update");
    if (issueSetupLink && linkedStudentUsers.length === 0) return "student-login-not-found";
    const loginEmail = details.email.trim().toLowerCase();
    for (const linkedAccount of linkedStudentUsers) {
      const emailChanged = Boolean(loginEmail && linkedAccount.email.toLowerCase() !== loginEmail);
      if (!emailChanged && !issueSetupLink) continue;
      const [otherActiveMembership] = await tx.select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .where(and(
          eq(schoolMemberships.userId, linkedAccount.userId),
          eq(schoolMemberships.status, "active"),
          ne(schoolMemberships.schoolId, context.schoolId),
        ))
        .limit(1);
      if (otherActiveMembership) return "student-login-shared";
    }
    for (const linkedAccount of linkedStudentUsers) {
      const emailChanged = Boolean(loginEmail && linkedAccount.email.toLowerCase() !== loginEmail);
      if (emailChanged) {
        await tx.update(user).set({ email: loginEmail }).where(eq(user.id, linkedAccount.userId));
      }
      if (issueSetupLink) setupUrls.push(await issuePasswordSetupLink(tx, linkedAccount.userId));
      if (emailChanged || issueSetupLink) {
        await tx.delete(session).where(eq(session.userId, linkedAccount.userId));
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "student.login.credentials_reset",
          resourceType: "student",
          resourcePublicId: publicId.data,
          changedFields: [
            ...(emailChanged ? ["credential.email"] : []),
            ...(issueSetupLink ? ["credential.password", "user.isActive"] : []),
          ],
        });
      }
    }

    await tx
      .update(students)
      .set({
        ...studentInsertValues(
          context.schoolId,
          details.branchId,
          student.admissionNumber,
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
    if (isDuplicateEntryError(error)) {
      console.error("Student profile update failed due to a conflicting record.", error);
      return "update-failed" as const;
    }
    console.error("Student profile update failed; transaction rolled back.", error);
    return "update-failed" as const;
  });

  if (outcome === "update-failed") {
    return { error: "Student record could not be saved. No changes were made; check the details and try again." };
  }
  if (outcome === "student-not-found") return { error: "Student record was not found in this school." };
  if (outcome === "student-login-not-found") return { error: "This student has no student login account to reset. Create or link a student login first." };
  if (outcome === "student-login-shared") return { error: "This student login is active in another school. Only a platform admin can change its credentials." };
  if (outcome === "branch-mismatch") {
    return { error: "An assigned student cannot be moved to another branch by editing the profile." };
  }
  if (outcome === "branch-not-found") return { error: "Choose a branch in your school." };
  if (outcome === "category-not-found") {
    return { error: "Choose a category belonging to the student's branch." };
  }
  revalidateStudentPages();
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/users");
  return { success: true, ...(setupUrls.length ? { setupUrls } : {}) };
}

const transitionSchema = z.object({
  publicId: z.string().uuid(),
  nextStatus: z.enum(studentStatuses),
});

export async function transitionStudentStatus(formData: FormData): Promise<StudentActionState> {
  const context = await requireSchoolPermission("students.update");
  const result = transitionSchema.safeParse({
    publicId: formData.get("publicId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) throw new Error("Invalid admission status request.");

  let setupUrl: string | undefined;
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        status: students.status,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
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

    if (result.data.nextStatus === "admitted") {
      const admissionIdentifier = normalizeAdmissionIdentifier(student.admissionNumber ?? "");
      if (!admissionIdentifier) return "admission-required";

      const [existingIdentifier] = await tx.select({
        userId: userLoginIdentifiers.userId,
        kind: userLoginIdentifiers.kind,
      })
        .from(userLoginIdentifiers)
        .where(and(
          eq(userLoginIdentifiers.schoolId, context.schoolId),
          eq(userLoginIdentifiers.identifier, admissionIdentifier),
        ))
        .limit(1);

      if (existingIdentifier) {
        if (existingIdentifier.kind !== "student_admission") return "account-conflict";
        const [existingLink] = await tx.select({ studentId: userStudentLinks.studentId })
          .from(userStudentLinks)
          .where(and(
            eq(userStudentLinks.schoolId, context.schoolId),
            eq(userStudentLinks.userId, existingIdentifier.userId),
            eq(userStudentLinks.studentId, student.id),
            eq(userStudentLinks.accessType, "student"),
          ))
          .limit(1);
        if (!existingLink) return "account-conflict";
      } else {
        const email = `student-${context.schoolId}-${student.id}@accounts.schoolos.invalid`;
        const [existingEmail] = await tx.select({ id: user.id })
          .from(user)
          .where(eq(user.email, email))
          .limit(1);
        if (existingEmail) return "account-conflict";

        const userId = randomUUID();
        await tx.insert(user).values({
          id: userId,
          name: `${student.firstName} ${student.lastName}`,
          email,
          emailVerified: false,
          isActive: false,
        });
        setupUrl = await issuePasswordSetupLink(tx, userId);
        await tx.insert(schoolMemberships).values({
          schoolId: context.schoolId,
          userId,
          status: "active",
        });
        const [membership] = await tx.select({ id: schoolMemberships.id })
          .from(schoolMemberships)
          .where(and(
            eq(schoolMemberships.schoolId, context.schoolId),
            eq(schoolMemberships.userId, userId),
          ))
          .limit(1);
        if (!membership) throw new Error("The student account membership could not be loaded.");
        const [studentRole] = await tx.select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.schoolId, context.schoolId), eq(roles.name, "Student")))
          .limit(1);
        if (studentRole) {
          await tx.insert(userRoles).values({ membershipId: membership.id, roleId: studentRole.id });
        }
        await tx.insert(userLoginIdentifiers).values({
          schoolId: context.schoolId,
          userId,
          kind: "student_admission",
          identifier: admissionIdentifier,
        });
        await tx.insert(userStudentLinks).values({
          schoolId: context.schoolId,
          userId,
          studentId: student.id,
          accessType: "student",
        });
      }

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

    await tx
      .update(students)
      .set({ status: result.data.nextStatus })
      .where(and(eq(students.id, student.id), eq(students.schoolId, context.schoolId)));

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
  if (outcome === "admission-required") {
    throw new Error("Add an admission number before approving this student so their portal account can be created.");
  }
  if (outcome === "account-conflict") {
    throw new Error("A login account or admission number is already linked to another profile. Resolve the conflict before approving this student.");
  }

  revalidateStudentPages();
  revalidatePath("/admin/admissions");
  revalidatePath("/admin/dashboard");
  return {
    success: true,
    ...(setupUrl ? { setupUrls: [setupUrl] } : {}),
  };
}

export async function transitionStudentStatusAction(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  return transitionStudentStatus(formData);
}

export async function approveAllPendingAdmissions(
  _previousState: StudentActionState,
  _formData: FormData,
): Promise<StudentActionState> {
  void _previousState;
  void _formData;
  const context = await requireSchoolPermission("students.update");
  const pendingStudentRows = await db.select({
    publicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
  }).from(students).innerJoin(studentEnrollments, and(
    eq(studentEnrollments.studentId, students.id),
    eq(studentEnrollments.schoolId, context.schoolId),
    eq(studentEnrollments.status, "pending"),
  )).where(and(
    eq(students.schoolId, context.schoolId),
    eq(students.status, "pending"),
  ));
  const pendingStudents = [...new Map(pendingStudentRows.map((student) => [student.publicId, student])).values()];
  if (pendingStudents.length === 0) {
    return { success: true, message: "There are no pending student applications to approve.", completed: 0 };
  }

  let completed = 0;
  const failures: string[] = [];
  const setupUrls: string[] = [];
  for (const student of pendingStudents) {
    const formData = new FormData();
    formData.set("publicId", student.publicId);
    formData.set("nextStatus", "admitted");
    const name = `${student.firstName} ${student.lastName}`;
    try {
      const result = await transitionStudentStatus(formData);
      if (!result.success) {
        failures.push(`${name}: ${result.error ?? "Could not approve this application."}`);
        continue;
      }
      completed += 1;
      setupUrls.push(...(result.setupUrls ?? []));
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : "Could not approve this application."}`);
    }
  }

  return {
    success: completed > 0,
    completed,
    failures: failures.slice(0, 20),
    setupUrls,
    message: `Approved ${completed} of ${pendingStudents.length} pending student applications.${failures.length > 20 ? ` ${failures.length - 20} more errors were not listed.` : ""}`,
  };
}

export async function transitionStudentStatusDirect(formData: FormData): Promise<void> {
  await transitionStudentStatus(formData);
}
