"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schoolMemberships, staffMembers, user } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  canTransitionStaffStatus,
  employmentTypes,
  staffStatuses,
} from "@/lib/staff-policy";

export type StaffActionState = { error?: string; success?: boolean };

const staffSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  employeeCode: z.string().trim().max(40),
  jobTitle: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  dateOfBirth: z.union([z.literal(""), z.string().refine(isCalendarDate)]),
  address: z.string().trim().max(1000),
  emergencyContactName: z.string().trim().max(160),
  emergencyContactPhone: z.string().trim().max(40),
  linkedUserId: z.union([z.literal(""), z.string().uuid()]),
  employmentType: z.enum(employmentTypes),
  startDate: z.union([z.literal(""), z.string().refine(isCalendarDate)]),
});

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = staffSchema.safeParse({
    firstName: readFormValue(formData, "firstName"),
    lastName: readFormValue(formData, "lastName"),
    employeeCode: readFormValue(formData, "employeeCode"),
    jobTitle: readFormValue(formData, "jobTitle"),
    department: readFormValue(formData, "department"),
    email: readFormValue(formData, "email"),
    phone: readFormValue(formData, "phone"),
    dateOfBirth: readFormValue(formData, "dateOfBirth"),
    address: readFormValue(formData, "address"),
    emergencyContactName: readFormValue(formData, "emergencyContactName"),
    emergencyContactPhone: readFormValue(formData, "emergencyContactPhone"),
    linkedUserId: readFormValue(formData, "linkedUserId"),
    employmentType: readFormValue(formData, "employmentType"),
    startDate: readFormValue(formData, "startDate"),
  });

  if (!result.success) return { error: "Please review the staff details and try again." };

  const staff = result.data;
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(staffMembers).values({
        publicId,
        schoolId: context.schoolId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        employeeCode: staff.employeeCode || null,
        jobTitle: staff.jobTitle,
        department: staff.department,
        email: staff.email || null,
        phone: staff.phone || null,
        dateOfBirth: staff.dateOfBirth || null,
        address: staff.address || null,
        emergencyContactName: staff.emergencyContactName || null,
        emergencyContactPhone: staff.emergencyContactPhone || null,
        linkedUserId: staff.linkedUserId || null,
        employmentType: staff.employmentType,
        status: "active",
        startDate: staff.startDate || null,
      });
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
          "jobTitle",
          "department",
          "email",
          "phone",
          "dateOfBirth",
          "address",
          "emergencyContactName",
          "emergencyContactPhone",
          "linkedUserId",
          "employmentType",
          "startDate",
          "status",
        ],
      });
    });
  } catch (error) {
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
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function updateStaffMember(
  _previousState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const publicId = z.string().uuid().safeParse(readFormValue(formData, "publicId"));
  const result = staffSchema.safeParse({
    firstName: readFormValue(formData, "firstName"),
    lastName: readFormValue(formData, "lastName"),
    employeeCode: readFormValue(formData, "employeeCode"),
    jobTitle: readFormValue(formData, "jobTitle"),
    department: readFormValue(formData, "department"),
    email: readFormValue(formData, "email"),
    phone: readFormValue(formData, "phone"),
    dateOfBirth: readFormValue(formData, "dateOfBirth"),
    address: readFormValue(formData, "address"),
    emergencyContactName: readFormValue(formData, "emergencyContactName"),
    emergencyContactPhone: readFormValue(formData, "emergencyContactPhone"),
    linkedUserId: readFormValue(formData, "linkedUserId"),
    employmentType: readFormValue(formData, "employmentType"),
    startDate: readFormValue(formData, "startDate"),
  });
  if (!publicId.success || !result.success) {
    return { error: "Please review the staff details and try again." };
  }

  const staff = result.data;
  if (staff.linkedUserId && !(await isSchoolMember(staff.linkedUserId, context.schoolId))) {
    return { error: "Select an active account belonging to this school." };
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: staffMembers.id })
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
          firstName: staff.firstName,
          lastName: staff.lastName,
          employeeCode: staff.employeeCode || null,
          jobTitle: staff.jobTitle,
          department: staff.department,
          email: staff.email || null,
          phone: staff.phone || null,
          dateOfBirth: staff.dateOfBirth || null,
          address: staff.address || null,
          emergencyContactName: staff.emergencyContactName || null,
          emergencyContactPhone: staff.emergencyContactPhone || null,
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
          "jobTitle",
          "department",
          "email",
          "phone",
          "dateOfBirth",
          "address",
          "emergencyContactName",
          "emergencyContactPhone",
          "linkedUserId",
          "employmentType",
          "startDate",
        ],
      });
      return true;
    });

    if (!outcome) return { error: "Staff record was not found in this school." };
  } catch (error) {
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
  revalidatePath("/admin/dashboard");
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
}
