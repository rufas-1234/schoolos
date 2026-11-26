"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, asc, count, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  account as authAccount,
  auditLogs,
  classSections,
  classSectionSubjectTeachers,
  classSubjects,
  schoolBranches,
  schoolMemberships,
  schools,
  session,
  staffDepartments,
  staffDesignations,
  staffApplications,
  staffMembers,
  staffSettings,
  teachers,
  uploadedFiles,
  roles,
  user,
  userLoginIdentifiers,
  userRoles,
} from "@/db/schema";
import type { StaffDocuments } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { issuePasswordSetupLink } from "@/lib/account-setup";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { normalizeAdmissionIdentifier, normalizePhoneIdentifier } from "@/lib/login-identifier-policy";
import { consumePublicAdmissionRateLimit } from "@/lib/public-admission-rate-limit";
import {
  defaultRequiredStaffFields,
  getStaffRequiredFieldError,
  normalizePublicStaffVisibleFields,
  normalizeRequiredStaffFields,
  staffSettingFields,
} from "@/lib/staff-settings";
import {
  canTransitionStaffStatus,
  employmentTypes,
  staffContractTypes,
  staffGenders,
  staffMaritalStatuses,
  staffRoles,
  staffStatuses,
} from "@/lib/staff-policy";

export type StaffActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  setupUrl?: string;
  temporaryPassword?: string;
  temporaryUsername?: string;
  completed?: number;
  failures?: string[];
  temporaryCredentials?: { applicantName: string; staffNumber: string; password: string }[];
};

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
class StaffLoginError extends Error {}

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
    const [[sectionCount], [subjectCount], [sectionSubjectTeacherCount]] = await Promise.all([
      tx.select({ total: count() }).from(classSections).where(and(
        eq(classSections.schoolId, schoolId),
        eq(classSections.classTeacherId, teacher.id),
      )),
      tx.select({ total: count() }).from(classSubjects).where(and(
        eq(classSubjects.schoolId, schoolId),
        eq(classSubjects.teacherId, teacher.id),
      )),
      tx.select({ total: count() }).from(classSectionSubjectTeachers).where(and(
        eq(classSectionSubjectTeachers.schoolId, schoolId),
        eq(classSectionSubjectTeachers.teacherId, teacher.id),
      )),
    ]);
    if (
      Number(sectionCount.total) +
      Number(subjectCount.total) +
      Number(sectionSubjectTeacherCount.total) > 0
    ) {
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
  email: z.union([
    z.literal(""),
    z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  ]),
  loginAccessEnabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  issuePasswordSetup: z.string().transform((value) => value === "true"),
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
  if (staff.loginAccessEnabled && !staff.email && !staff.linkedUserId) {
    issueContext.addIssue({
      code: "custom",
      path: ["email"],
      message: "Enter the staff email or select a linked account to enable login access.",
    });
  }
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

const staffFormFieldNames = [
  "branchId", "firstName", "lastName", "employeeCode", "personnelRole", "jobTitle", "department",
  "email", "loginAccessEnabled", "issuePasswordSetup",
  "phone", "dateOfBirth", "fatherName", "motherName", "gender", "maritalStatus",
  "address", "permanentAddress", "emergencyContactName", "emergencyContactPhone", "drivingLicense", "showAsExpert",
  "qualification", "experience", "epfNumber", "basicSalary", "contractType", "location",
  "bankAccountName", "bankAccountNumber", "bankName", "bankBranch", "facebookUrl", "twitterUrl",
  "linkedinUrl", "instagramUrl", "profilePhotoFileName", "profilePhotoObjectKey",
  "resumeFileName", "resumeObjectKey", "joiningLetterFileName", "joiningLetterObjectKey",
  "otherDocumentFileName", "otherDocumentObjectKey", "customFieldName1", "customFieldValue1",
  "customFieldName2", "customFieldValue2", "linkedUserId", "employmentType", "startDate",
] as const;

function parseStaffForm(formData: FormData) {
  return staffSchema.safeParse(Object.fromEntries(
    staffFormFieldNames.map((name) => [name, readFormValue(formData, name)]),
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

type StaffLoginResult = {
  linkedUserId: string | null;
  action: "staff.login_access.enabled" | "staff.login_access.disabled" | "staff.login_access.credentials_reset" | null;
  emailChanged: boolean;
  passwordChanged: boolean;
  setupUrl: string | null;
  temporaryPassword: string | null;
};

async function applyStaffLoginAccess(
  tx: StaffTransaction,
  schoolId: number,
  actorUserId: string,
  staff: z.infer<typeof staffSchema>,
  previousLinkedUserId: string | null,
): Promise<StaffLoginResult> {
  const submittedLinkedUserId = staff.linkedUserId || null;
  if (!staff.loginAccessEnabled) {
    let emailChanged = false;
    if (previousLinkedUserId) {
      if (previousLinkedUserId === actorUserId) {
        throw new StaffLoginError("You cannot disable your own school access from the staff profile.");
      }
      const [linkedUser] = await tx.select({ email: user.email }).from(user)
        .where(eq(user.id, previousLinkedUserId))
        .for("update")
        .limit(1);
      if (!linkedUser) throw new StaffLoginError("The linked school account could not be found.");
      const email = staff.email.trim().toLowerCase();
      emailChanged = Boolean(email && linkedUser.email.toLowerCase() !== email);
      if (emailChanged) {
        const [otherActiveMembership] = await tx.select({ id: schoolMemberships.id })
          .from(schoolMemberships)
          .where(and(
            eq(schoolMemberships.userId, previousLinkedUserId),
            eq(schoolMemberships.status, "active"),
            ne(schoolMemberships.schoolId, schoolId),
          ))
          .limit(1);
        if (otherActiveMembership) {
          throw new StaffLoginError("This account belongs to another school; only a platform admin can change its email.");
        }
      }
      if (emailChanged) await tx.update(user).set({ email }).where(eq(user.id, previousLinkedUserId));
      await tx.delete(session).where(eq(session.userId, previousLinkedUserId));
      await tx.update(schoolMemberships)
        .set({ status: "inactive" })
        .where(and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.userId, previousLinkedUserId),
          eq(schoolMemberships.status, "active"),
        ));
    }
    return {
      linkedUserId: submittedLinkedUserId,
      action: emailChanged
        ? "staff.login_access.credentials_reset"
        : previousLinkedUserId
          ? "staff.login_access.disabled"
          : null,
      emailChanged,
      passwordChanged: false,
      setupUrl: null,
      temporaryPassword: null,
    };
  }

  const email = staff.email?.trim().toLowerCase() ?? "";
  if (!email && !submittedLinkedUserId) {
    throw new StaffLoginError("Enter the staff email or select a linked account before enabling login access.");
  }
  let accountUser: { id: string; email: string; isActive: boolean } | undefined;
  if (submittedLinkedUserId) {
    [accountUser] = await tx.select({
      id: user.id,
      email: user.email,
      isActive: user.isActive,
    }).from(user)
      .where(eq(user.id, submittedLinkedUserId))
      .for("update")
      .limit(1);
    if (!accountUser) throw new StaffLoginError("The selected school account could not be found.");
  } else {
    [accountUser] = await tx.select({
      id: user.id,
      email: user.email,
      isActive: user.isActive,
    }).from(user)
      .where(eq(user.email, email))
      .for("update")
      .limit(1);
  }

  if (accountUser && !accountUser.isActive && !staff.issuePasswordSetup) {
    throw new StaffLoginError("This SchoolOS account is inactive. Issue a new one-time password setup link before enabling login access.");
  }

  let userId = accountUser?.id;
  const emailChanged = Boolean(accountUser && email && accountUser.email.toLowerCase() !== email);
  let passwordChanged = false;
  let setupUrl: string | null = null;
  let temporaryPassword: string | null = null;
  if (!userId) {
    if (!email) throw new StaffLoginError("Enter an email before creating a staff login this way.");
    const staffNumber = normalizeAdmissionIdentifier(staff.employeeCode);
    if (!staffNumber) throw new StaffLoginError("A staff number is required before creating a login.");
    temporaryPassword = `Staff@${staffNumber}`;
    userId = randomUUID();
    await tx.insert(user).values({
      id: userId,
      name: `${staff.firstName} ${staff.lastName}`,
      email,
      emailVerified: false,
      isActive: true,
      mustChangePassword: true,
    });
    await tx.insert(authAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(temporaryPassword),
    });
    passwordChanged = true;
  } else {
    const [credentialAccount] = await tx.select({ id: authAccount.id })
      .from(authAccount)
      .where(and(
        eq(authAccount.userId, userId),
        eq(authAccount.providerId, "credential"),
      ))
      .for("update")
      .limit(1);
    if (staff.issuePasswordSetup) {
      setupUrl = await issuePasswordSetupLink(tx, userId);
      passwordChanged = true;
    } else if (!credentialAccount) {
      const staffNumber = normalizeAdmissionIdentifier(staff.employeeCode);
      if (!staffNumber) throw new StaffLoginError("A staff number is required before creating a login.");
      temporaryPassword = `Staff@${staffNumber}`;
      await tx.insert(authAccount).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(temporaryPassword),
      });
      await tx.update(user).set({ isActive: true, mustChangePassword: true }).where(eq(user.id, userId));
      passwordChanged = true;
    }
  }

  if (accountUser && emailChanged) {
    await tx.update(user).set({ email }).where(eq(user.id, userId!));
  }
  if (emailChanged || passwordChanged) {
    await tx.delete(session).where(eq(session.userId, userId!));
  }

  const [otherActiveMembership] = await tx.select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.status, "active"),
      ne(schoolMemberships.schoolId, schoolId),
    ))
    .limit(1);
  if (otherActiveMembership) {
    throw new StaffLoginError("This account already has access to another school.");
  }

  let [membership] = await tx.select({
    id: schoolMemberships.id,
    status: schoolMemberships.status,
  }).from(schoolMemberships)
    .where(and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, userId),
    ))
    .for("update")
    .limit(1);
  if (!membership) {
    await tx.insert(schoolMemberships).values({ schoolId, userId });
    [membership] = await tx.select({
      id: schoolMemberships.id,
      status: schoolMemberships.status,
    }).from(schoolMemberships)
      .where(and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.userId, userId),
      ))
      .limit(1);
    if (!membership) throw new Error("The school account membership could not be created.");
  } else if (membership.status !== "active") {
    await tx.update(schoolMemberships)
      .set({ status: "active" })
      .where(eq(schoolMemberships.id, membership.id));
  }

  const phoneIdentifier = staff.phone.trim()
    ? normalizePhoneIdentifier(staff.phone)
    : "";
  if (staff.phone.trim() && !phoneIdentifier) {
    throw new StaffLoginError("The staff phone number must include 7-15 digits to be used for login.");
  }
  if (phoneIdentifier) {
    const [identifierOwner] = await tx.select({
      userId: userLoginIdentifiers.userId,
    }).from(userLoginIdentifiers)
      .where(and(
        eq(userLoginIdentifiers.schoolId, schoolId),
        eq(userLoginIdentifiers.identifier, phoneIdentifier),
      ))
      .limit(1);
    if (identifierOwner && identifierOwner.userId !== userId) {
      throw new StaffLoginError("That phone number is already assigned as a login identifier in this school.");
    }
    await tx.delete(userLoginIdentifiers).where(and(
      eq(userLoginIdentifiers.schoolId, schoolId),
      eq(userLoginIdentifiers.userId, userId),
      eq(userLoginIdentifiers.kind, "staff_phone"),
    ));
    if (!identifierOwner) {
      await tx.insert(userLoginIdentifiers).values({
        schoolId,
        userId,
        kind: "staff_phone",
        identifier: phoneIdentifier,
      });
    }
  } else {
    await tx.delete(userLoginIdentifiers).where(and(
      eq(userLoginIdentifiers.schoolId, schoolId),
      eq(userLoginIdentifiers.userId, userId),
      eq(userLoginIdentifiers.kind, "staff_phone"),
    ));
  }

  return {
    linkedUserId: userId,
    action: emailChanged || passwordChanged ? "staff.login_access.credentials_reset" : "staff.login_access.enabled",
    emailChanged,
    passwordChanged,
    setupUrl,
    temporaryPassword,
  };
}

async function ensureStaffAccount(
  tx: StaffTransaction,
  schoolId: number,
  actorUserId: string,
  staff: {
    id: number;
    publicId: string;
    employeeCode: string;
    personnelRole: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    linkedUserId: string | null;
  },
) {
  const identifier = normalizeAdmissionIdentifier(staff.employeeCode);
  if (!identifier) throw new StaffLoginError("A staff number is required to create this staff member's login.");

  const [identifierOwner] = await tx.select({ userId: userLoginIdentifiers.userId })
    .from(userLoginIdentifiers)
    .where(and(
      eq(userLoginIdentifiers.schoolId, schoolId),
      eq(userLoginIdentifiers.identifier, identifier),
    ))
    .limit(1);
  if (identifierOwner && staff.linkedUserId && identifierOwner.userId !== staff.linkedUserId) {
    throw new StaffLoginError("That staff number is already being used as another account's login.");
  }

  let accountUser: { id: string; isActive: boolean } | undefined;
  const candidateUserId = staff.linkedUserId ?? identifierOwner?.userId;
  if (candidateUserId) {
    [accountUser] = await tx.select({ id: user.id, isActive: user.isActive })
      .from(user)
      .where(eq(user.id, candidateUserId))
      .for("update")
      .limit(1);
    if (!accountUser) throw new StaffLoginError("The linked staff account could not be found.");
  } else if (staff.email?.trim()) {
    const [matchingEmailUser] = await tx.select({ id: user.id, isActive: user.isActive })
      .from(user)
      .where(eq(user.email, staff.email.trim().toLowerCase()))
      .for("update")
      .limit(1);
    accountUser = matchingEmailUser;
    if (identifierOwner && accountUser && identifierOwner.userId !== accountUser.id) {
      throw new StaffLoginError("That staff number is already assigned to a different login account.");
    }
  }

  if (accountUser && !accountUser.isActive) {
    throw new StaffLoginError("This linked SchoolOS account is inactive. Issue a new setup link before approving this staff member.");
  }

  const email = staff.email?.trim().toLowerCase() || `staff-${schoolId}-${staff.id}@accounts.schoolos.invalid`;
  let userId = accountUser?.id;
  let setupUrl: string | null = null;
  let temporaryPassword: string | null = null;
  if (!userId) {
    const [emailOwner] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (emailOwner) throw new StaffLoginError("The email assigned to this staff member is already attached to another account.");
    userId = randomUUID();
    await tx.insert(user).values({
      id: userId,
      name: `${staff.firstName} ${staff.lastName}`,
      email,
      emailVerified: false,
      isActive: true,
      mustChangePassword: true,
    });
  }

  const [credential] = await tx.select({ id: authAccount.id })
    .from(authAccount)
    .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")))
    .for("update")
    .limit(1);
  if (!credential) {
    temporaryPassword = `Staff@${identifier}`;
    await tx.insert(authAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(temporaryPassword),
    });
    await tx.update(user).set({ isActive: true, mustChangePassword: true }).where(eq(user.id, userId));
  }

  const [otherSchoolMembership] = await tx.select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.status, "active"),
      ne(schoolMemberships.schoolId, schoolId),
    ))
    .limit(1);
  if (otherSchoolMembership) throw new StaffLoginError("This account already has access to another school.");

  let [membership] = await tx.select({ id: schoolMemberships.id, status: schoolMemberships.status })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, userId)))
    .for("update")
    .limit(1);
  if (!membership) {
    await tx.insert(schoolMemberships).values({ schoolId, userId, status: "active" });
    [membership] = await tx.select({ id: schoolMemberships.id, status: schoolMemberships.status })
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, userId)))
      .limit(1);
    if (!membership) throw new Error("The staff account membership could not be created.");
  } else if (membership.status !== "active") {
    await tx.update(schoolMemberships).set({ status: "active" }).where(eq(schoolMemberships.id, membership.id));
  }

  if (identifierOwner && identifierOwner.userId !== userId) {
    throw new StaffLoginError("That staff number is already assigned to a different login account.");
  }
  if (!identifierOwner) {
    await tx.insert(userLoginIdentifiers).values({
      schoolId,
      userId,
      kind: "staff_employee_code",
      identifier,
    });
  }

  const roleNameByStaffRole: Record<string, string> = {
    accountant: "Accountant",
    driver: "Transport manager",
    librarian: "Librarian",
    receptionist: "Registrar",
    teacher: "Teacher",
  };
  const roleName = staff.personnelRole ? roleNameByStaffRole[staff.personnelRole] : undefined;
  if (roleName) {
    const [role] = await tx.select({ id: roles.id }).from(roles)
      .where(and(eq(roles.schoolId, schoolId), eq(roles.name, roleName)))
      .limit(1);
    if (role) {
      const [userRole] = await tx.select({ membershipId: userRoles.membershipId })
        .from(userRoles)
        .where(and(eq(userRoles.membershipId, membership.id), eq(userRoles.roleId, role.id)))
        .limit(1);
      if (!userRole) await tx.insert(userRoles).values({ membershipId: membership.id, roleId: role.id });
    }
  }

  await tx.update(staffMembers)
    .set({ linkedUserId: userId })
    .where(and(eq(staffMembers.id, staff.id), eq(staffMembers.schoolId, schoolId)));
  if (setupUrl || temporaryPassword) {
    await tx.insert(auditLogs).values({
      schoolId,
      actorUserId,
      action: "staff.login_access.automatically_enabled",
      resourceType: "staff_member",
      resourcePublicId: staff.publicId,
      changedFields: ["linkedUserId", "schoolMembership.status", "credential.password", "user.isActive", "user.mustChangePassword", "staffEmployeeCode"],
    });
  }
  return { setupUrl, temporaryPassword };
}

async function syncStaffNumberIdentifier(
  tx: StaffTransaction,
  schoolId: number,
  userId: string,
  previousEmployeeCode: string | null,
  employeeCode: string,
) {
  const identifier = normalizeAdmissionIdentifier(employeeCode);
  if (!identifier) throw new StaffLoginError("Enter a valid staff number before saving this account.");
  const [owner] = await tx.select({ userId: userLoginIdentifiers.userId })
    .from(userLoginIdentifiers)
    .where(and(
      eq(userLoginIdentifiers.schoolId, schoolId),
      eq(userLoginIdentifiers.identifier, identifier),
    ))
    .limit(1);
  if (owner && owner.userId !== userId) {
    throw new StaffLoginError("That staff number is already being used as another account's login.");
  }
  const previousIdentifier = previousEmployeeCode ? normalizeAdmissionIdentifier(previousEmployeeCode) : "";
  if (previousIdentifier && previousIdentifier !== identifier) {
    await tx.delete(userLoginIdentifiers).where(and(
      eq(userLoginIdentifiers.schoolId, schoolId),
      eq(userLoginIdentifiers.userId, userId),
      eq(userLoginIdentifiers.kind, "staff_employee_code"),
      eq(userLoginIdentifiers.identifier, previousIdentifier),
    ));
  }
  if (!owner) {
    await tx.insert(userLoginIdentifiers).values({
      schoolId,
      userId,
      kind: "staff_employee_code",
      identifier,
    });
  }
}

async function logStaffLoginAccess(
  tx: StaffTransaction,
  schoolId: number,
  actorUserId: string,
  staffPublicId: string,
  loginResult: StaffLoginResult,
) {
  if (!loginResult.action) return;
  await tx.insert(auditLogs).values({
    schoolId,
    actorUserId,
    action: loginResult.action,
    resourceType: "staff_member",
    resourcePublicId: staffPublicId,
    changedFields: [
      "linkedUserId",
      "schoolMembership.status",
      ...(loginResult.emailChanged ? ["credential.email"] : []),
      ...(loginResult.passwordChanged ? ["credential.password"] : []),
    ],
  });
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

export async function createPublicStaffApplication(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const schoolPublicId = z.string().uuid().safeParse(formData.get("schoolPublicId"));
  if (!schoolPublicId.success) return { error: "This registration link is invalid." };
  if (formData.get("consent") !== "on") return { error: "Please confirm that the information is accurate." };

  const [school] = await db.select({ id: schools.id, publicId: schools.publicId })
    .from(schools).where(and(
      eq(schools.publicId, schoolPublicId.data),
      eq(schools.status, schoolWorkspaceStatuses.active),
      isNull(schools.archivedAt),
    )).limit(1);
  if (!school) return { error: "This registration link is no longer available." };

  const [settings] = await db.select({
    visibleFields: staffSettings.visibleFields,
    requiredFields: staffSettings.requiredFields,
  }).from(staffSettings).where(eq(staffSettings.schoolId, school.id)).limit(1);
  const visibleFields = normalizePublicStaffVisibleFields(
    settings?.visibleFields,
    settings?.requiredFields,
  );
  const requiredFields = normalizeRequiredStaffFields(settings?.requiredFields)
    .filter((name) => name !== "linkedUserId");
  for (const field of staffSettingFields) {
    if (visibleFields.includes(field.name)) continue;
    if (field.name === "profilePhotoFileName") {
      formData.set("profilePhotoFileName", "");
      formData.set("profilePhotoObjectKey", "");
    } else if (field.name === "resumeFileName") {
      formData.set("resumeFileName", "");
      formData.set("resumeObjectKey", "");
    } else if (field.name === "joiningLetterFileName") {
      formData.set("joiningLetterFileName", "");
      formData.set("joiningLetterObjectKey", "");
    } else if (field.name === "otherDocumentFileName") {
      formData.set("otherDocumentFileName", "");
      formData.set("otherDocumentObjectKey", "");
    } else {
      formData.set(field.name, "");
    }
  }
  formData.set("linkedUserId", "");
  formData.set("loginAccessEnabled", "false");
  if (!visibleFields.includes("showAsExpert")) formData.set("showAsExpert", "no");
  if (!visibleFields.includes("employmentType")) formData.set("employmentType", "full_time");

  const parsed = parseStaffForm(formData);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Staff details")}: ${issue.message}` : "Please review the staff details and try again." };
  }
  const staff = parsed.data;
  const requiredError = getStaffRequiredFieldError(staff, requiredFields);
  if (requiredError) return { error: requiredError };
  const extrasError = await validateStaffExtras(staff, school.id, school.publicId);
  if (extrasError) return { error: extrasError };
  const fileReferences = [
    { fileName: staff.profilePhotoFileName, objectKey: staff.profilePhotoObjectKey, photo: true },
    { fileName: staff.resumeFileName, objectKey: staff.resumeObjectKey, photo: false },
    { fileName: staff.joiningLetterFileName, objectKey: staff.joiningLetterObjectKey, photo: false },
    { fileName: staff.otherDocumentFileName, objectKey: staff.otherDocumentObjectKey, photo: false },
  ].filter((file) => file.objectKey);
  if (fileReferences.length) {
    const uploaded = await db.select({
      storageKey: uploadedFiles.storageKey,
      fileName: uploadedFiles.fileName,
      contentType: uploadedFiles.contentType,
    }).from(uploadedFiles).where(and(
      eq(uploadedFiles.schoolId, school.id),
      inArray(uploadedFiles.storageKey, fileReferences.map((file) => file.objectKey)),
    ));
    if (uploaded.length !== fileReferences.length || fileReferences.some((file) => {
      const saved = uploaded.find((candidate) => candidate.storageKey === file.objectKey);
      return !saved || saved.fileName !== file.fileName ||
        (file.photo
          ? !["image/jpeg", "image/png", "image/webp"].includes(saved.contentType)
          : !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(saved.contentType));
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
    operation: "staff-submission",
    clientAddress,
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) return { error: "Too many registration attempts. Please wait before submitting again." };

  const applicationData = Object.fromEntries(
    staffFormFieldNames.map((name) => [name, readFormValue(formData, name)]),
  );
  try {
    await db.insert(staffApplications).values({
      publicId: randomUUID(),
      schoolId: school.id,
      applicationData,
    });
  } catch (error) {
    console.error("Public staff application could not be saved.", error);
    return { error: "Your application could not be saved. Please try again later." };
  }
  return { success: true };
}

export async function createStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = parseStaffForm(formData);

  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Staff details")}: ${issue.message}` : "Please review the staff details and try again." };
  }

  const staff = result.data;
  const applicationValue = formData.get("staffApplicationPublicId");
  let applicationPublicId: string | null = null;
  if (applicationValue !== null) {
    const parsedApplicationId = z.string().uuid().safeParse(applicationValue);
    if (!parsedApplicationId.success) return { error: "This staff application is invalid." };
    const [application] = await db.select({
      applicationData: staffApplications.applicationData,
      status: staffApplications.status,
      reviewedBy: staffApplications.reviewedBy,
    }).from(staffApplications).where(and(
      eq(staffApplications.publicId, parsedApplicationId.data),
      eq(staffApplications.schoolId, context.schoolId),
    )).limit(1);
    if (application?.status !== "processing" || application.reviewedBy !== context.user.id ||
      staffFormFieldNames.some((name) => readFormValue(formData, name) !== application.applicationData[name])) {
      return { error: "This staff application is not ready for approval." };
    }
    applicationPublicId = parsedApplicationId.data;
    const [alreadyCreated] = await db.select({ id: staffMembers.id }).from(staffMembers)
      .where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.publicId, applicationPublicId),
      )).limit(1);
    if (alreadyCreated) return { success: true };
  }
  const [settings] = await db.select({ requiredFields: staffSettings.requiredFields })
    .from(staffSettings).where(eq(staffSettings.schoolId, context.schoolId)).limit(1);
  const requiredError = getStaffRequiredFieldError(
    staff,
    normalizeRequiredStaffFields(settings?.requiredFields ?? defaultRequiredStaffFields),
  );
  if (requiredError) return { error: requiredError };
  const extrasError = await validateStaffExtras(staff, context.schoolId, context.schoolPublicId);
  if (extrasError) return { error: extrasError };
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  const publicId = applicationPublicId ?? randomUUID();
  const employeeCode = staff.employeeCode || `STF-${publicId.slice(0, 8).toLocaleUpperCase()}`;
  let accountOutcome: { setupUrl: string | null; temporaryPassword: string | null } = { setupUrl: null, temporaryPassword: null };
  try {
    accountOutcome = await db.transaction(async (tx) => {
      const loginResult = await applyStaffLoginAccess(
        tx,
        context.schoolId,
        context.user.id,
        { ...staff, employeeCode },
        null,
      );
      await tx.insert(staffMembers).values({
        publicId,
        schoolId: context.schoolId,
        branchId: staff.branchId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        employeeCode,
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
        linkedUserId: loginResult.linkedUserId,
        employmentType: staff.employmentType,
        status: "active",
        startDate: staff.startDate || null,
      });
      const [createdStaff] = await tx
        .select({ id: staffMembers.id, publicId: staffMembers.publicId })
        .from(staffMembers)
        .where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.publicId, publicId)))
        .limit(1);
      if (!createdStaff) throw new Error("Unable to load the newly created staff record.");
      const ensuredAccount = await ensureStaffAccount(tx, context.schoolId, context.user.id, {
        id: createdStaff.id,
        publicId: createdStaff.publicId,
        employeeCode,
        personnelRole: staff.personnelRole || null,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email || null,
        linkedUserId: loginResult.linkedUserId,
      });
      if (staff.personnelRole === "teacher") {
        await syncAcademicTeacher(tx, context.schoolId, context.user.id, {
          id: createdStaff.id,
          branchId: staff.branchId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          employeeCode,
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
      await logStaffLoginAccess(
        tx,
        context.schoolId,
        context.user.id,
        publicId,
        loginResult,
      );
      return {
        setupUrl: loginResult.setupUrl ?? ensuredAccount.setupUrl,
        temporaryPassword: loginResult.temporaryPassword ?? ensuredAccount.temporaryPassword,
      };
    });
  } catch (error) {
    if (error instanceof TeacherSyncError) return { error: error.message };
    if (error instanceof StaffLoginError) return { error: error.message };
    if (isDuplicateEntryError(error)) {
      return { error: "That employee code or email is already in use by a staff member or SchoolOS account." };
    }
    console.error("Staff profile creation failed; transaction rolled back.", error);
    return { error: "Staff profile could not be created. No changes were saved; check the details and try again." };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/hr/payroll");
  revalidatePath("/admin/hr/departments");
  revalidatePath("/admin/hr/designations");
  revalidatePath("/admin/hr/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/academics");
  const accountText = staff.employeeCode
    ? `Staff number: ${employeeCode}.`
    : `Generated staff number: ${employeeCode}.`;
  return {
    success: true,
    message: `${accountText} Sign-in username: ${employeeCode}.${accountOutcome.temporaryPassword ? " Share the temporary password privately; they must change it at first sign-in." : ""}`,
    ...(accountOutcome.setupUrl ? { setupUrl: accountOutcome.setupUrl } : {}),
    ...(accountOutcome.temporaryPassword
      ? { temporaryPassword: accountOutcome.temporaryPassword, temporaryUsername: employeeCode }
      : {}),
  };
}

export async function reviewPublicStaffApplication(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const applicationId = z.string().uuid().safeParse(formData.get("applicationPublicId"));
  const decision = z.enum(["approve", "reject"]).safeParse(formData.get("decision"));
  if (!applicationId.success || !decision.success) {
    return { error: "Choose a valid staff application and review decision." };
  }

  if (decision.data === "reject") {
    const updated = await db.transaction(async (tx) => {
      const [application] = await tx.select({ id: staffApplications.id })
        .from(staffApplications).where(and(
          eq(staffApplications.publicId, applicationId.data),
          eq(staffApplications.schoolId, context.schoolId),
          eq(staffApplications.status, "pending"),
        )).for("update").limit(1);
      if (!application) return false;
      await tx.update(staffApplications).set({
        status: "rejected",
        reviewedBy: context.user.id,
        reviewedAt: new Date(),
      }).where(eq(staffApplications.id, application.id));
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "staff.application.rejected",
        resourceType: "staff_application",
        resourcePublicId: applicationId.data,
        changedFields: ["status", "reviewedBy", "reviewedAt"],
      });
      return true;
    });
    if (!updated) return { error: "This application has already been reviewed." };
    revalidatePath("/admin/staff/applications");
    return { success: true };
  }

  const application = await db.transaction(async (tx) => {
    const staleProcessingCutoff = new Date(Date.now() - 15 * 60 * 1000);
    const [pendingApplication] = await tx.select({
      id: staffApplications.id,
      applicationData: staffApplications.applicationData,
    }).from(staffApplications).where(and(
      eq(staffApplications.publicId, applicationId.data),
      eq(staffApplications.schoolId, context.schoolId),
      or(
        eq(staffApplications.status, "pending"),
        and(
          eq(staffApplications.status, "processing"),
          lt(staffApplications.reviewedAt, staleProcessingCutoff),
        ),
      ),
    )).for("update").limit(1);
    if (!pendingApplication) return null;
    await tx.update(staffApplications).set({
      status: "processing",
      reviewedBy: context.user.id,
      reviewedAt: new Date(),
    }).where(eq(staffApplications.id, pendingApplication.id));
    return pendingApplication;
  });
  if (!application) return { error: "This application has already been reviewed." };

  const staffFormData = new FormData();
  for (const [name, value] of Object.entries(application.applicationData)) {
    staffFormData.set(name, value);
  }
  staffFormData.set("staffApplicationPublicId", applicationId.data);
  let created: StaffActionState;
  try {
    created = await createStaffMember({}, staffFormData);
  } catch (error) {
    await db.update(staffApplications).set({
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
    }).where(and(
      eq(staffApplications.publicId, applicationId.data),
      eq(staffApplications.schoolId, context.schoolId),
      eq(staffApplications.status, "processing"),
    ));
    throw error;
  }
  if (!created.success) {
    await db.update(staffApplications).set({
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
    }).where(and(
      eq(staffApplications.publicId, applicationId.data),
      eq(staffApplications.schoolId, context.schoolId),
      eq(staffApplications.status, "processing"),
    ));
    return { error: created.error ?? "The application could not be approved." };
  }

  const [staff] = await db.select({ id: staffMembers.id }).from(staffMembers)
    .where(and(
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.publicId, applicationId.data),
    )).limit(1);
  if (!staff) throw new Error("Approved staff record could not be loaded.");
  await db.transaction(async (tx) => {
    await tx.update(staffApplications).set({
      status: "approved",
      staffMemberId: staff.id,
      reviewedBy: context.user.id,
      reviewedAt: new Date(),
    }).where(and(
      eq(staffApplications.publicId, applicationId.data),
      eq(staffApplications.schoolId, context.schoolId),
      eq(staffApplications.status, "processing"),
    ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "staff.application.approved",
      resourceType: "staff_application",
      resourcePublicId: applicationId.data,
      changedFields: ["status", "reviewedBy", "reviewedAt", "staffMemberId"],
    });
  });
  revalidatePath("/admin/staff/applications");
  revalidatePath("/admin/staff");
  return {
    success: true,
    message: created.message,
    ...(created.setupUrl ? { setupUrl: created.setupUrl } : {}),
    ...(created.temporaryPassword
      ? { temporaryPassword: created.temporaryPassword, temporaryUsername: created.temporaryUsername }
      : {}),
  };
}

export async function approveAllPendingStaffApplications(
  _previousState: StaffActionState,
  _formData: FormData,
): Promise<StaffActionState> {
  void _previousState;
  void _formData;
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const applications = await db.select({
    publicId: staffApplications.publicId,
    applicationData: staffApplications.applicationData,
  }).from(staffApplications).where(and(
    eq(staffApplications.schoolId, context.schoolId),
    eq(staffApplications.status, "pending"),
  )).orderBy(asc(staffApplications.id));

  if (applications.length === 0) {
    return { success: true, completed: 0, message: "There are no pending staff applications to approve." };
  }

  let completed = 0;
  const failures: string[] = [];
  const temporaryCredentials: { applicantName: string; staffNumber: string; password: string }[] = [];
  for (const application of applications) {
    const applicantName = [application.applicationData.firstName, application.applicationData.lastName]
      .filter(Boolean).join(" ") || "Applicant";
    const formData = new FormData();
    formData.set("applicationPublicId", application.publicId);
    formData.set("decision", "approve");
    try {
      const result = await reviewPublicStaffApplication({}, formData);
      if (!result.success) {
        failures.push(`${applicantName}: ${result.error ?? "Could not approve this application."}`);
        continue;
      }
      completed += 1;
      if (result.temporaryPassword && result.temporaryUsername) {
        temporaryCredentials.push({
          applicantName,
          staffNumber: result.temporaryUsername,
          password: result.temporaryPassword,
        });
      }
    } catch (error) {
      failures.push(`${applicantName}: ${error instanceof Error ? error.message : "Could not approve this application."}`);
    }
  }

  return {
    success: completed > 0,
    completed,
    failures: failures.slice(0, 20),
    temporaryCredentials,
    message: `Approved ${completed} of ${applications.length} pending staff applications.${failures.length > 20 ? ` ${failures.length - 20} more errors were not listed.` : ""}`,
  };
}

export async function updateStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const publicId = z.string().uuid().safeParse(readFormValue(formData, "publicId"));
  const result = parseStaffForm(formData);
  if (!publicId.success || !result.success) {
    const issue = result.success ? null : result.error.issues[0];
    return { error: issue ? `${String(issue.path.at(-1) ?? "Staff details")}: ${issue.message}` : "Please review the staff details and try again." };
  }

  const staff = result.data;
  const [settings] = await db.select({ requiredFields: staffSettings.requiredFields })
    .from(staffSettings).where(eq(staffSettings.schoolId, context.schoolId)).limit(1);
  const requiredError = getStaffRequiredFieldError(
    staff,
    normalizeRequiredStaffFields(settings?.requiredFields ?? defaultRequiredStaffFields),
  );
  if (requiredError) return { error: requiredError };
  const extrasError = await validateStaffExtras(staff, context.schoolId, context.schoolPublicId);
  if (extrasError) return { error: extrasError };
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  let setupUrl: string | null = null;
  let temporaryPassword: string | null = null;
  let temporaryUsername: string | null = null;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: staffMembers.id,
          status: staffMembers.status,
          employeeCode: staffMembers.employeeCode,
          linkedUserId: staffMembers.linkedUserId,
        })
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
      const employeeCode = staff.employeeCode || existing.employeeCode || `STF-${publicId.data.slice(0, 8).toLocaleUpperCase()}`;
      const loginResult = await applyStaffLoginAccess(
        tx,
        context.schoolId,
        context.user.id,
        { ...staff, employeeCode },
        existing.linkedUserId,
      );
      if (loginResult.linkedUserId) {
        await syncStaffNumberIdentifier(
          tx,
          context.schoolId,
          loginResult.linkedUserId,
          existing.employeeCode,
          employeeCode,
        );
      }

      await tx
        .update(staffMembers)
        .set({
          branchId: staff.branchId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          employeeCode,
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
          linkedUserId: loginResult.linkedUserId,
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
        employeeCode,
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
      await logStaffLoginAccess(
        tx,
        context.schoolId,
        context.user.id,
        publicId.data,
        loginResult,
      );
      return { ...loginResult, employeeCode };
    });

    if (outcome === false) return { error: "Staff record was not found in this school." };
    setupUrl = outcome.setupUrl;
    temporaryPassword = outcome.temporaryPassword;
    temporaryUsername = outcome.employeeCode;
  } catch (error) {
    if (error instanceof TeacherSyncError) return { error: error.message };
    if (error instanceof StaffLoginError) return { error: error.message };
    if (isDuplicateEntryError(error)) {
      return { error: "That employee code or email is already in use by a staff member or SchoolOS account." };
    }
    console.error("Staff profile update failed; transaction rolled back.", error);
    return { error: "Staff profile could not be saved. No changes were made; check the details and try again." };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/hr/payroll");
  revalidatePath("/admin/hr/departments");
  revalidatePath("/admin/hr/designations");
  revalidatePath("/admin/hr/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/academics");
  return {
    success: true,
    ...(setupUrl ? { setupUrl } : {}),
    ...(temporaryPassword
      ? { temporaryPassword, temporaryUsername: temporaryUsername ?? undefined }
      : {}),
  };
}

async function isSchoolMember(userId: string, schoolId: number) {
  const [membership] = await db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, userId),
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
