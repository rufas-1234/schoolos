"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  classSections,
  classSubjects,
  schoolBranches,
  schoolMemberships,
  staffDepartments,
  staffDesignations,
  staffMembers,
  teachers,
  uploadedFiles,
  user,
} from "@/db/schema";
import type { StaffDocuments } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  canTransitionStaffStatus,
  employmentTypes,
  staffContractTypes,
  staffGenders,
  staffMaritalStatuses,
  staffRoles,
  staffStatuses,
} from "@/lib/staff-policy";

export type StaffActionState = { error?: string; success?: boolean };

type StaffTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TeacherStaffData = {
  id: number;
  branchId: number | null;
  firstName: string;
  lastName: string;
  employeeCode: string;
  personnelRole: string;
  email: string;
  phone: string;
  status: string;
};

class TeacherSyncError extends Error {}

async function syncAcademicTeacher(
  tx: StaffTransaction,
  schoolId: number,
  actorUserId: string,
  staff: TeacherStaffData,
) {
  let teacher: {
    id: number;
    publicId: string;
    branchId: number;
    staffMemberId: number | null;
  } | undefined;
  [teacher] = await tx
    .select({
      id: teachers.id,
      publicId: teachers.publicId,
      branchId: teachers.branchId,
      staffMemberId: teachers.staffMemberId,
    })
    .from(teachers)
    .where(and(eq(teachers.schoolId, schoolId), eq(teachers.staffMemberId, staff.id)))
    .for("update")
    .limit(1);

  if (!teacher && staff.personnelRole === "teacher") {
    const identifiers = [];
    if (staff.employeeCode) identifiers.push(eq(teachers.employeeCode, staff.employeeCode));
    if (staff.email) identifiers.push(eq(teachers.email, staff.email));
    if (identifiers.length) {
      const matches = await tx
        .select({
          id: teachers.id,
          publicId: teachers.publicId,
          branchId: teachers.branchId,
          staffMemberId: teachers.staffMemberId,
        })
        .from(teachers)
        .where(and(eq(teachers.schoolId, schoolId), or(...identifiers)))
        .for("update");
      if (matches.length > 1) {
        throw new TeacherSyncError("This staff member matches more than one existing academic teacher. Resolve the duplicate teacher records first.");
      }
      teacher = matches[0];
      if (teacher?.staffMemberId !== null && teacher?.staffMemberId !== undefined) {
        throw new TeacherSyncError("This academic teacher is already linked to another staff member.");
      }
    }
  }

  if (staff.personnelRole !== "teacher") {
    if (teacher?.id) {
      await tx
        .update(teachers)
        .set({ status: "inactive" })
        .where(and(eq(teachers.id, teacher.id), eq(teachers.schoolId, schoolId)));
    }
    return;
  }

  if (!staff.branchId) {
    throw new TeacherSyncError("Choose a branch for this teacher in Human Resources.");
  }

  if (teacher && teacher.branchId !== staff.branchId) {
    const [[sectionCount], [subjectCount]] = await Promise.all([
      tx.select({ total: count() }).from(classSections).where(and(
        eq(classSections.schoolId, schoolId),
        eq(classSections.classTeacherId, teacher.id),
      )),
      tx.select({ total: count() }).from(classSubjects).where(and(
        eq(classSubjects.schoolId, schoolId),
        eq(classSubjects.teacherId, teacher.id),
      )),
    ]);
    if (Number(sectionCount.total) + Number(subjectCount.total) > 0) {
      throw new TeacherSyncError("A teacher's branch cannot be changed while they are assigned to a class or subject.");
    }
  }

  const teacherValues = {
    staffMemberId: staff.id,
    branchId: staff.branchId,
    firstName: staff.firstName,
    lastName: staff.lastName,
    employeeCode: staff.employeeCode || null,
    email: staff.email || null,
    phone: staff.phone || null,
    status: staff.status === "active" ? "active" : "inactive",
  };
  if (teacher) {
    await tx
      .update(teachers)
      .set(teacherValues)
      .where(and(eq(teachers.id, teacher.id), eq(teachers.schoolId, schoolId)));
  } else {
    const publicId = randomUUID();
    await tx.insert(teachers).values({
      publicId,
      schoolId,
      ...teacherValues,
    });
    const [created] = await tx
      .select({ id: teachers.id, publicId: teachers.publicId })
      .from(teachers)
      .where(and(eq(teachers.schoolId, schoolId), eq(teachers.staffMemberId, staff.id)))
      .limit(1);
    teacher = created ? { ...created, branchId: staff.branchId, staffMemberId: staff.id } : undefined;
  }

  if (!teacher) throw new Error("Unable to load the academic teacher linked to this staff member.");
  await tx.insert(auditLogs).values({
    schoolId,
    actorUserId,
    action: "academic.teacher.synced_from_staff",
    resourceType: "teacher",
    resourcePublicId: teacher.publicId,
    changedFields: ["staffMemberId", "branchId", "firstName", "lastName", "employeeCode", "email", "phone", "status"],
  });
}

const optionalDate = z.union([z.literal(""), z.string().refine(isCalendarDate)]);
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]);
const staffSchema = z.object({
  branchId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  employeeCode: z.string().trim().max(40),
  personnelRole: z.union([z.literal(""), z.enum(staffRoles)]),
  jobTitle: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  dateOfBirth: optionalDate,
  fatherName: z.string().trim().max(160),
  motherName: z.string().trim().max(160),
  gender: z.union([z.literal(""), z.enum(staffGenders)]),
  maritalStatus: z.union([z.literal(""), z.enum(staffMaritalStatuses)]),
  address: z.string().trim().max(1000),
  permanentAddress: z.string().trim().max(1000),
  emergencyContactName: z.string().trim().max(160),
  emergencyContactPhone: z.string().trim().max(40),
  drivingLicense: z.string().trim().max(80),
  showAsExpert: z.enum(["yes", "no"]),
  qualification: z.string().trim().max(2000),
  experience: z.string().trim().max(2000),
  epfNumber: z.string().trim().max(80),
  basicSalary: z.union([
    z.literal(""),
    z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine((amount) => Number(amount) >= 0),
  ]),
  contractType: z.union([z.literal(""), z.enum(staffContractTypes)]),
  location: z.string().trim().max(255),
  bankAccountName: z.string().trim().max(160),
  bankAccountNumber: z.string().trim().max(80),
  bankName: z.string().trim().max(160),
  bankBranch: z.string().trim().max(160),
  facebookUrl: optionalUrl,
  twitterUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  instagramUrl: optionalUrl,
  profilePhotoFileName: z.string().trim().max(160),
  profilePhotoObjectKey: z.string().trim().max(700),
  resumeFileName: z.string().trim().max(160),
  resumeObjectKey: z.string().trim().max(700),
  joiningLetterFileName: z.string().trim().max(160),
  joiningLetterObjectKey: z.string().trim().max(700),
  otherDocumentFileName: z.string().trim().max(160),
  otherDocumentObjectKey: z.string().trim().max(700),
  customFieldName1: z.string().trim().max(120),
  customFieldValue1: z.string().trim().max(500),
  customFieldName2: z.string().trim().max(120),
  customFieldValue2: z.string().trim().max(500),
  linkedUserId: z.union([z.literal(""), z.string().uuid()]),
  employmentType: z.enum(employmentTypes),
  startDate: optionalDate,
}).superRefine((staff, issueContext) => {
  for (const [fileName, objectKey] of [
    ["profilePhotoFileName", "profilePhotoObjectKey"],
    ["resumeFileName", "resumeObjectKey"],
    ["joiningLetterFileName", "joiningLetterObjectKey"],
    ["otherDocumentFileName", "otherDocumentObjectKey"],
  ] as const) {
    if (Boolean(staff[fileName]) !== Boolean(staff[objectKey])) {
      issueContext.addIssue({ code: "custom", path: [fileName], message: "Invalid uploaded file." });
    }
  }
  for (const [name, value] of [
    ["customFieldName1", "customFieldValue1"],
    ["customFieldName2", "customFieldValue2"],
  ] as const) {
    if (Boolean(staff[name]) !== Boolean(staff[value])) {
      issueContext.addIssue({ code: "custom", path: [name], message: "Enter both a custom field name and value." });
    }
  }
});

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseStaffForm(formData: FormData) {
  const fieldNames = [
    "branchId", "firstName", "lastName", "employeeCode", "personnelRole", "jobTitle", "department",
    "email", "phone", "dateOfBirth", "fatherName", "motherName", "gender", "maritalStatus",
    "address", "permanentAddress", "emergencyContactName", "emergencyContactPhone", "drivingLicense", "showAsExpert",
    "qualification", "experience", "epfNumber", "basicSalary", "contractType", "location",
    "bankAccountName", "bankAccountNumber", "bankName", "bankBranch", "facebookUrl", "twitterUrl",
    "linkedinUrl", "instagramUrl", "profilePhotoFileName", "profilePhotoObjectKey",
    "resumeFileName", "resumeObjectKey", "joiningLetterFileName", "joiningLetterObjectKey",
    "otherDocumentFileName", "otherDocumentObjectKey", "customFieldName1", "customFieldValue1",
    "customFieldName2", "customFieldValue2", "linkedUserId", "employmentType", "startDate",
  ] as const;
  return staffSchema.safeParse(Object.fromEntries(
    fieldNames.map((name) => [name, readFormValue(formData, name)]),
  ));
}

function staffDocuments(staff: z.infer<typeof staffSchema>): StaffDocuments {
  const file = (fileName: string, objectKey: string) =>
    fileName && objectKey ? { fileName, objectKey } : null;
  return {
    profilePhoto: file(staff.profilePhotoFileName, staff.profilePhotoObjectKey),
    resume: file(staff.resumeFileName, staff.resumeObjectKey),
    joiningLetter: file(staff.joiningLetterFileName, staff.joiningLetterObjectKey),
    otherDocument: file(staff.otherDocumentFileName, staff.otherDocumentObjectKey),
  };
}

function staffCustomFields(staff: z.infer<typeof staffSchema>) {
  return [
    { label: staff.customFieldName1, value: staff.customFieldValue1 },
    { label: staff.customFieldName2, value: staff.customFieldValue2 },
  ].filter((field) => field.label && field.value);
}

async function validateStaffExtras(
  staff: z.infer<typeof staffSchema>,
  schoolId: number,
  schoolPublicId: string,
) {
  const [branch, department, designation] = await Promise.all([
    db.select({ id: schoolBranches.id })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.id, staff.branchId),
        eq(schoolBranches.schoolId, schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .limit(1),
    db.select({ id: staffDepartments.id })
      .from(staffDepartments)
      .where(and(
        eq(staffDepartments.schoolId, schoolId),
        eq(staffDepartments.name, staff.department),
        or(eq(staffDepartments.branchId, staff.branchId), isNull(staffDepartments.branchId)),
      ))
      .limit(1),
    db.select({ id: staffDesignations.id })
      .from(staffDesignations)
      .where(and(
        eq(staffDesignations.schoolId, schoolId),
        eq(staffDesignations.name, staff.jobTitle),
        or(eq(staffDesignations.branchId, staff.branchId), isNull(staffDesignations.branchId)),
      ))
      .limit(1),
  ]);
  if (!branch.length) return "Choose an active branch belonging to this school.";
  if (!department.length) return "Choose a department assigned to the selected branch.";
  if (!designation.length) return "Choose a designation assigned to the selected branch.";

  const prefix = `${schoolPublicId}/`;
  const documents = staffDocuments(staff);
  const files = [
    { file: documents.profilePhoto, isPhoto: true },
    { file: documents.resume, isPhoto: false },
    { file: documents.joiningLetter, isPhoto: false },
    { file: documents.otherDocument, isPhoto: false },
  ];
  for (const item of files) {
    if (!item.file) continue;
    const { file, isPhoto } = item;
    if (!file.objectKey.startsWith(prefix)) return "One or more uploaded files are invalid.";
    const [storedFile] = await db.select({ fileName: uploadedFiles.fileName, contentType: uploadedFiles.contentType })
      .from(uploadedFiles)
      .where(and(
        eq(uploadedFiles.schoolId, schoolId),
        eq(uploadedFiles.storageKey, file.objectKey),
        eq(uploadedFiles.fileName, file.fileName),
      ))
      .limit(1);
    if (!storedFile) return "One or more uploaded files are missing.";
    const allowedTypes = isPhoto
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(storedFile.contentType)) {
      return "One or more uploaded files have an invalid format.";
    }
  }
  return null;
}

export async function createStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = parseStaffForm(formData);

  if (!result.success) return { error: "Please review the staff details and try again." };

  const staff = result.data;
  const extrasError = await validateStaffExtras(staff, context.schoolId, context.schoolPublicId);
  if (extrasError) return { error: extrasError };
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(staffMembers).values({
        publicId,
        schoolId: context.schoolId,
        branchId: staff.branchId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        employeeCode: staff.employeeCode || null,
        personnelRole: staff.personnelRole || null,
        jobTitle: staff.jobTitle,
        department: staff.department,
        email: staff.email || null,
        phone: staff.phone || null,
        dateOfBirth: staff.dateOfBirth || null,
        fatherName: staff.fatherName || null,
        motherName: staff.motherName || null,
        gender: staff.gender || null,
        maritalStatus: staff.maritalStatus || null,
        address: staff.address || null,
        permanentAddress: staff.permanentAddress || null,
        emergencyContactName: staff.emergencyContactName || null,
        emergencyContactPhone: staff.emergencyContactPhone || null,
        drivingLicense: staff.drivingLicense || null,
        showAsExpert: staff.showAsExpert === "yes",
        qualification: staff.qualification || null,
        experience: staff.experience || null,
        epfNumber: staff.epfNumber || null,
        basicSalary: staff.basicSalary || null,
        contractType: staff.contractType || null,
        location: staff.location || null,
        bankAccountName: staff.bankAccountName || null,
        bankAccountNumber: staff.bankAccountNumber || null,
        bankName: staff.bankName || null,
        bankBranch: staff.bankBranch || null,
        facebookUrl: staff.facebookUrl || null,
        twitterUrl: staff.twitterUrl || null,
        linkedinUrl: staff.linkedinUrl || null,
        instagramUrl: staff.instagramUrl || null,
        documents: staffDocuments(staff),
        customFields: staffCustomFields(staff),
        linkedUserId: staff.linkedUserId || null,
        employmentType: staff.employmentType,
        status: "active",
        startDate: staff.startDate || null,
      });
      if (staff.personnelRole === "teacher") {
        const [createdStaff] = await tx
          .select({ id: staffMembers.id })
          .from(staffMembers)
          .where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.publicId, publicId)))
          .limit(1);
        if (!createdStaff) throw new Error("Unable to load the newly created staff record.");
        await syncAcademicTeacher(tx, context.schoolId, context.user.id, {
          id: createdStaff.id,
          branchId: staff.branchId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          employeeCode: staff.employeeCode,
          personnelRole: staff.personnelRole,
          email: staff.email,
          phone: staff.phone,
          status: "active",
        });
      }
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "staff.member.created",
        resourceType: "staff_member",
        resourcePublicId: publicId,
        changedFields: [
          "firstName",
          "lastName",
          "employeeCode",
          "branchId",
          "personnelRole",
          "jobTitle",
          "department",
          "email",
          "phone",
          "dateOfBirth",
          "fatherName",
          "motherName",
          "gender",
          "maritalStatus",
          "address",
          "permanentAddress",
          "emergencyContactName",
          "emergencyContactPhone",
          "drivingLicense",
          "showAsExpert",
          "qualification",
          "experience",
          "epfNumber",
          "basicSalary",
          "contractType",
          "location",
          "bankAccountName",
          "bankAccountNumber",
          "bankName",
          "bankBranch",
          "facebookUrl",
          "twitterUrl",
          "linkedinUrl",
          "instagramUrl",
          "documents",
          "customFields",
          "linkedUserId",
          "employmentType",
          "startDate",
          "status",
        ],
      });
    });
  } catch (error) {
    if (error instanceof TeacherSyncError) return { error: error.message };
    if (isDuplicateEntryError(error)) {
      return { error: "That employee code, email, or linked account is already used by this school." };
    }
    throw error;
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/hr/payroll");
  revalidatePath("/admin/hr/departments");
  revalidatePath("/admin/hr/designations");
  revalidatePath("/admin/hr/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/academics");
  return { success: true };
}

export async function updateStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const publicId = z.string().uuid().safeParse(readFormValue(formData, "publicId"));
  const result = parseStaffForm(formData);
  if (!publicId.success || !result.success) {
    return { error: "Please review the staff details and try again." };
  }

  const staff = result.data;
  const extrasError = await validateStaffExtras(staff, context.schoolId, context.schoolPublicId);
  if (extrasError) return { error: extrasError };
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: staffMembers.id, status: staffMembers.status })
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.publicId, publicId.data),
            eq(staffMembers.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) return false;

      await tx
        .update(staffMembers)
        .set({
          branchId: staff.branchId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          employeeCode: staff.employeeCode || null,
          personnelRole: staff.personnelRole || null,
          jobTitle: staff.jobTitle,
          department: staff.department,
          email: staff.email || null,
          phone: staff.phone || null,
          dateOfBirth: staff.dateOfBirth || null,
          fatherName: staff.fatherName || null,
          motherName: staff.motherName || null,
          gender: staff.gender || null,
          maritalStatus: staff.maritalStatus || null,
          address: staff.address || null,
          permanentAddress: staff.permanentAddress || null,
          emergencyContactName: staff.emergencyContactName || null,
          emergencyContactPhone: staff.emergencyContactPhone || null,
          drivingLicense: staff.drivingLicense || null,
          showAsExpert: staff.showAsExpert === "yes",
          qualification: staff.qualification || null,
          experience: staff.experience || null,
          epfNumber: staff.epfNumber || null,
          basicSalary: staff.basicSalary || null,
          contractType: staff.contractType || null,
          location: staff.location || null,
          bankAccountName: staff.bankAccountName || null,
          bankAccountNumber: staff.bankAccountNumber || null,
          bankName: staff.bankName || null,
          bankBranch: staff.bankBranch || null,
          facebookUrl: staff.facebookUrl || null,
          twitterUrl: staff.twitterUrl || null,
          linkedinUrl: staff.linkedinUrl || null,
          instagramUrl: staff.instagramUrl || null,
          documents: staffDocuments(staff),
          customFields: staffCustomFields(staff),
          linkedUserId: staff.linkedUserId || null,
          employmentType: staff.employmentType,
          startDate: staff.startDate || null,
        })
        .where(
          and(
            eq(staffMembers.id, existing.id),
            eq(staffMembers.schoolId, context.schoolId),
          ),
        );
      await syncAcademicTeacher(tx, context.schoolId, context.user.id, {
        id: existing.id,
        branchId: staff.branchId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        employeeCode: staff.employeeCode,
        personnelRole: staff.personnelRole,
        email: staff.email,
        phone: staff.phone,
        status: existing.status,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "staff.member.updated",
        resourceType: "staff_member",
        resourcePublicId: publicId.data,
        changedFields: [
          "firstName",
          "lastName",
          "employeeCode",
          "branchId",
          "personnelRole",
          "jobTitle",
          "department",
          "email",
          "phone",
          "dateOfBirth",
          "fatherName",
          "motherName",
          "gender",
          "maritalStatus",
          "address",
          "permanentAddress",
          "emergencyContactName",
          "emergencyContactPhone",
          "drivingLicense",
          "showAsExpert",
          "qualification",
          "experience",
          "epfNumber",
          "basicSalary",
          "contractType",
          "location",
          "bankAccountName",
          "bankAccountNumber",
          "bankName",
          "bankBranch",
          "facebookUrl",
          "twitterUrl",
          "linkedinUrl",
          "instagramUrl",
          "documents",
          "customFields",
          "linkedUserId",
          "employmentType",
          "startDate",
        ],
      });
      return true;
    });

    if (!outcome) return { error: "Staff record was not found in this school." };
  } catch (error) {
    if (error instanceof TeacherSyncError) return { error: error.message };
    if (isDuplicateEntryError(error)) {
      return { error: "That employee code, email, or linked account is already used by this school." };
    }
    throw error;
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/hr/payroll");
  revalidatePath("/admin/hr/departments");
  revalidatePath("/admin/hr/designations");
  revalidatePath("/admin/hr/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/academics");
  return { success: true };
}

async function isSchoolMember(userId: string, schoolId: number) {
  const [membership] = await db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .innerJoin(user, eq(schoolMemberships.userId, user.id))
    .where(and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.status, "active"),
      eq(user.isActive, true),
    ))
    .limit(1);
  return Boolean(membership);
}

export async function transitionStaffStatus(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z
    .object({
      publicId: z.string().uuid(),
      nextStatus: z.enum(staffStatuses),
    })
    .safeParse({
      publicId: readFormValue(formData, "publicId"),
      nextStatus: readFormValue(formData, "nextStatus"),
    });
  if (!result.success) throw new Error("Invalid staff status request.");

  const outcome = await db.transaction(async (tx) => {
    const [staff] = await tx
      .select({
        id: staffMembers.id,
        publicId: staffMembers.publicId,
        status: staffMembers.status,
        branchId: staffMembers.branchId,
        firstName: staffMembers.firstName,
        lastName: staffMembers.lastName,
        employeeCode: staffMembers.employeeCode,
        personnelRole: staffMembers.personnelRole,
        email: staffMembers.email,
        phone: staffMembers.phone,
      })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.publicId, result.data.publicId),
          eq(staffMembers.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);

    if (!staff) return "not-found";
    if (!canTransitionStaffStatus(staff.status, result.data.nextStatus)) {
      return "invalid-transition";
    }

    await tx
      .update(staffMembers)
      .set({ status: result.data.nextStatus })
      .where(and(eq(staffMembers.id, staff.id), eq(staffMembers.schoolId, context.schoolId)));
    await syncAcademicTeacher(tx, context.schoolId, context.user.id, {
      id: staff.id,
      branchId: staff.branchId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      employeeCode: staff.employeeCode ?? "",
      personnelRole: staff.personnelRole ?? "",
      email: staff.email ?? "",
      phone: staff.phone ?? "",
      status: result.data.nextStatus,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `staff.status.${staff.status}.to.${result.data.nextStatus}`,
      resourceType: "staff_member",
      resourcePublicId: staff.publicId,
      changedFields: ["status"],
    });
    return "updated";
  });

  if (outcome === "not-found") throw new Error("Staff record was not found in this school.");
  if (outcome === "invalid-transition") {
    throw new Error("This staff status cannot be changed through that transition.");
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/academics");
}
