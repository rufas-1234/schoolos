"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  schoolBranches,
  schoolCurrencies,
  schools,
  staffAttendance,
  staffLeaveBalances,
  staffLeaveRequests,
  staffLeaveTypes,
  staffMembers,
  staffPayrollRecords,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import {
  canReviewLeaveRequest,
  calculatePayrollAmounts,
  fitsLeaveEntitlement,
  formatPayrollMinorUnits,
  inclusiveCalendarDays,
  parsePayrollMoneyToMinorUnits,
  staffAttendanceStatuses,
} from "@/lib/hr-policy";

export type HrActionState = { error?: string; success?: boolean };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const dateField = z.string().refine(isCalendarDate);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({
    schoolId,
    actorUserId,
    action,
    resourceType,
    resourcePublicId,
    changedFields,
  });
}

function revalidateHr() {
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/attendance");
  revalidatePath("/admin/hr/reports");
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/hr/payroll");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/dashboard");
}

export async function recordStaffAttendance(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    staffId: idField,
    branchId: idField,
    attendanceDate: dateField,
    status: z.enum(staffAttendanceStatuses),
    note: z.string().trim().max(500),
  }).safeParse({
    staffId: value(formData, "staffId"),
    branchId: value(formData, "branchId"),
    attendanceDate: value(formData, "attendanceDate"),
    status: value(formData, "status"),
    note: value(formData, "note"),
  });
  if (!result.success) return { error: "Choose a staff member, date, and valid attendance status." };
  const [school] = await db.select({ timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  if (!school) return { error: "School settings could not be loaded." };
  if (result.data.attendanceDate > todayInTimezone(school.timezone)) {
    return { error: "Staff attendance cannot be recorded for a future date." };
  }

  const outcome = await db.transaction(async (tx) => {
    const [staff] = await tx.select({ id: staffMembers.id })
      .from(staffMembers).where(and(
        eq(staffMembers.id, result.data.staffId),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.branchId, result.data.branchId),
        eq(staffMembers.status, "active"),
      )).for("update").limit(1);
    if (!staff) return "not-found";
    const [existing] = await tx.select({ publicId: staffAttendance.publicId })
      .from(staffAttendance).where(and(
        eq(staffAttendance.schoolId, context.schoolId),
        eq(staffAttendance.staffId, staff.id),
        eq(staffAttendance.attendanceDate, result.data.attendanceDate),
      )).limit(1);
    await tx.insert(staffAttendance).values({
      publicId: existing?.publicId ?? randomUUID(),
      schoolId: context.schoolId,
      staffId: staff.id,
      attendanceDate: result.data.attendanceDate,
      status: result.data.status,
      note: result.data.note || null,
      recordedBy: context.user.id,
    }).onDuplicateKeyUpdate({
      set: {
        status: result.data.status,
        note: result.data.note || null,
        recordedBy: context.user.id,
      },
    });
    const [saved] = await tx.select({ publicId: staffAttendance.publicId })
      .from(staffAttendance).where(and(
        eq(staffAttendance.schoolId, context.schoolId),
        eq(staffAttendance.staffId, staff.id),
        eq(staffAttendance.attendanceDate, result.data.attendanceDate),
      )).limit(1);
    if (!saved) throw new Error("Attendance record could not be saved.");
    await writeAudit(tx, context.schoolId, context.user.id,
      existing ? "staff.attendance.updated" : "staff.attendance.recorded",
      "staff_attendance", saved.publicId, ["attendanceDate", "status", "note"]);
    return "saved";
  });
  if (outcome === "not-found") return { error: "Active staff record was not found in this school." };
  revalidateHr();
  return { success: true };
}

export async function recordStaffAttendanceBulk(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    staffIds: z.array(idField).min(1).max(500),
    branchId: idField,
    attendanceDate: dateField,
    status: z.enum(staffAttendanceStatuses),
  }).safeParse({
    staffIds: formData.getAll("staffIds"),
    branchId: value(formData, "branchId"),
    attendanceDate: value(formData, "attendanceDate"),
    status: value(formData, "status"),
  });
  if (!result.success || new Set(result.data.staffIds).size !== result.data.staffIds.length) {
    return { error: "Select one or more staff members and choose a valid attendance status." };
  }
  const [school] = await db.select({ timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  if (!school) return { error: "School settings could not be loaded." };
  if (result.data.attendanceDate > todayInTimezone(school.timezone)) {
    return { error: "Staff attendance cannot be recorded for a future date." };
  }

  const outcome = await db.transaction(async (tx) => {
    const staff = await tx.select({ id: staffMembers.id })
      .from(staffMembers).where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.branchId, result.data.branchId),
        eq(staffMembers.status, "active"),
        inArray(staffMembers.id, result.data.staffIds),
      )).for("update");
    if (staff.length !== result.data.staffIds.length) return "staff-not-found";

    const existingMarks = await tx.select({
      staffId: staffAttendance.staffId,
      publicId: staffAttendance.publicId,
    }).from(staffAttendance).where(and(
      eq(staffAttendance.schoolId, context.schoolId),
      eq(staffAttendance.attendanceDate, result.data.attendanceDate),
      inArray(staffAttendance.staffId, result.data.staffIds),
    ));
    const publicIdByStaffId = new Map(existingMarks.map((mark) => [mark.staffId, mark.publicId]));
    for (const member of staff) {
      const publicId = publicIdByStaffId.get(member.id) ?? randomUUID();
      await tx.insert(staffAttendance).values({
        publicId,
        schoolId: context.schoolId,
        staffId: member.id,
        attendanceDate: result.data.attendanceDate,
        status: result.data.status,
        note: null,
        recordedBy: context.user.id,
      }).onDuplicateKeyUpdate({
        set: { status: result.data.status, recordedBy: context.user.id },
      });
      await writeAudit(tx, context.schoolId, context.user.id,
        publicIdByStaffId.has(member.id) ? "staff.attendance.updated" : "staff.attendance.recorded",
        "staff_attendance", publicId, ["attendanceDate", "status"]);
    }
    return "saved";
  });
  if (outcome === "staff-not-found") {
    return { error: "One or more selected staff records are no longer active in this branch. Reload the roster." };
  }
  revalidateHr();
  return { success: true };
}

export async function createStaffLeaveType(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    name: z.string().trim().min(2).max(100),
    branchId: idField,
  }).safeParse({
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
  });
  if (!result.success) return { error: "Choose a branch and enter a leave type name." };
  const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
    eq(schoolBranches.id, result.data.branchId),
    eq(schoolBranches.schoolId, context.schoolId),
    eq(schoolBranches.status, "active"),
  )).limit(1);
  if (!branch) return { error: "Choose an active branch belonging to this school." };
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(staffLeaveTypes).values({
        publicId,
        schoolId: context.schoolId,
        branchId: branch.id,
        name: result.data.name,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "staff.leave_type.created",
        "staff_leave_type", publicId, ["branchId", "name"]);
    });
  } catch (error) {
    if (isDuplicateError(error)) return { error: "A leave type with that name already exists." };
    throw error;
  }
  revalidateHr();
  return { success: true };
}

export async function assignStaffLeaveBalance(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    staffId: idField,
    branchId: idField,
    leaveTypeId: idField,
    leaveYear: z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().min(2000).max(9999)),
    entitlementDays: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).transform(Number)
      .refine((days) => days >= 0 && days <= 366),
  }).safeParse({
    staffId: value(formData, "staffId"),
    branchId: value(formData, "branchId"),
    leaveTypeId: value(formData, "leaveTypeId"),
    leaveYear: value(formData, "leaveYear"),
    entitlementDays: value(formData, "entitlementDays"),
  });
  if (!result.success) return { error: "Enter a valid staff member, leave type, and entitlement (0–366 days)." };

  const [staff] = await db.select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(
      eq(staffMembers.id, result.data.staffId),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.branchId, result.data.branchId),
    ))
    .limit(1);
  const [leaveType] = await db.select({ id: staffLeaveTypes.id })
    .from(staffLeaveTypes)
    .where(and(
      eq(staffLeaveTypes.id, result.data.leaveTypeId),
      eq(staffLeaveTypes.schoolId, context.schoolId),
      or(eq(staffLeaveTypes.branchId, result.data.branchId), isNull(staffLeaveTypes.branchId)),
    ))
    .limit(1);
  if (!staff || !leaveType) return { error: "Choose records belonging to this school." };

  const outcome = await db.transaction(async (tx) => {
    const [staffRecord] = await tx.select({ id: staffMembers.id })
      .from(staffMembers).where(and(
        eq(staffMembers.id, staff.id),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.branchId, result.data.branchId),
      )).for("update").limit(1);
    if (!staffRecord) return false;
    const requests = await tx.select({
      requestedDays: staffLeaveRequests.requestedDays,
    }).from(staffLeaveRequests).where(and(
      eq(staffLeaveRequests.schoolId, context.schoolId),
      eq(staffLeaveRequests.staffId, staff.id),
      eq(staffLeaveRequests.leaveTypeId, leaveType.id),
      eq(staffLeaveRequests.leaveYear, result.data.leaveYear),
      inArray(staffLeaveRequests.status, ["pending", "approved"]),
    ));
    const reservedDays = requests.reduce((sum, request) => sum + request.requestedDays, 0);
    if (reservedDays > result.data.entitlementDays) return false;
    await tx.insert(staffLeaveBalances).values({
      schoolId: context.schoolId,
      staffId: staff.id,
      leaveTypeId: leaveType.id,
      leaveYear: result.data.leaveYear,
      entitlementDays: result.data.entitlementDays.toFixed(2),
    }).onDuplicateKeyUpdate({ set: { entitlementDays: result.data.entitlementDays.toFixed(2) } });
    await writeAudit(tx, context.schoolId, context.user.id, "staff.leave_balance.updated",
      "staff_leave_balance", `${staff.id}:${leaveType.id}:${result.data.leaveYear}`,
      ["staffId", "leaveTypeId", "leaveYear", "entitlementDays"]);
    return true;
  });
  if (!outcome) return { error: "Entitlement cannot be lower than pending and approved leave already reserved." };
  revalidateHr();
  return { success: true };
}

export async function createStaffLeaveRequest(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    staffId: idField,
    branchId: idField,
    leaveTypeId: idField,
    startDate: dateField,
    endDate: dateField,
    reason: z.string().trim().min(3).max(1000),
  }).safeParse({
    staffId: value(formData, "staffId"),
    branchId: value(formData, "branchId"),
    leaveTypeId: value(formData, "leaveTypeId"),
    startDate: value(formData, "startDate"),
    endDate: value(formData, "endDate"),
    reason: value(formData, "reason"),
  });
  if (!result.success || result.data.endDate < result.data.startDate ||
    result.data.startDate.slice(0, 4) !== result.data.endDate.slice(0, 4)) {
    return { error: "Enter a valid staff member, leave type, reason, and date range within one calendar year." };
  }
  const leaveYear = Number(result.data.startDate.slice(0, 4));
  const requestedDays = inclusiveCalendarDays(result.data.startDate, result.data.endDate);
  if (requestedDays === null || requestedDays > 366) return { error: "Leave requests must be 1–366 calendar days." };

  const outcome = await db.transaction(async (tx) => {
    const [staff] = await tx.select({ id: staffMembers.id })
      .from(staffMembers).where(and(
        eq(staffMembers.id, result.data.staffId),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.branchId, result.data.branchId),
        eq(staffMembers.status, "active"),
      )).for("update").limit(1);
    if (!staff) return "no-balance";
    const [leaveType] = await tx.select({ id: staffLeaveTypes.id })
      .from(staffLeaveTypes).where(and(
        eq(staffLeaveTypes.id, result.data.leaveTypeId),
        eq(staffLeaveTypes.schoolId, context.schoolId),
        or(eq(staffLeaveTypes.branchId, result.data.branchId), isNull(staffLeaveTypes.branchId)),
      )).limit(1);
    if (!leaveType) return "invalid-leave-type";
    const [balance] = await tx.select({
      staffId: staffLeaveBalances.staffId,
      leaveTypeId: staffLeaveBalances.leaveTypeId,
      entitlementDays: staffLeaveBalances.entitlementDays,
    }).from(staffLeaveBalances).where(and(
      eq(staffLeaveBalances.schoolId, context.schoolId),
      eq(staffLeaveBalances.staffId, staff.id),
      eq(staffLeaveBalances.leaveTypeId, leaveType.id),
      eq(staffLeaveBalances.leaveYear, leaveYear),
    )).for("update").limit(1);
    if (!balance) return "no-balance";

    const existing = await tx.select({
      startDate: staffLeaveRequests.startDate,
      endDate: staffLeaveRequests.endDate,
      requestedDays: staffLeaveRequests.requestedDays,
      leaveTypeId: staffLeaveRequests.leaveTypeId,
    }).from(staffLeaveRequests)
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        eq(staffLeaveRequests.staffId, staff.id),
        eq(staffLeaveRequests.leaveYear, leaveYear),
        inArray(staffLeaveRequests.status, ["pending", "approved"]),
      ));
    if (existing.some((request) =>
      request.startDate <= result.data.endDate && request.endDate >= result.data.startDate
    )) return "overlap";

    const reservedDays = existing
      .filter((request) => request.leaveTypeId === leaveType.id)
      .reduce((sum, request) => sum + request.requestedDays, 0);
    if (!fitsLeaveEntitlement(Number(balance.entitlementDays), reservedDays, requestedDays)) return "over-balance";

    const publicId = randomUUID();
    await tx.insert(staffLeaveRequests).values({
      publicId,
      schoolId: context.schoolId,
      staffId: staff.id,
      leaveTypeId: balance.leaveTypeId,
      leaveYear,
      startDate: result.data.startDate,
      endDate: result.data.endDate,
      requestedDays,
      reason: result.data.reason,
      createdBy: context.user.id,
    });
    await writeAudit(tx, context.schoolId, context.user.id, "staff.leave.requested", "staff_leave_request", publicId,
      ["staffId", "leaveTypeId", "startDate", "endDate", "requestedDays", "reason"]);
    return "created";
  });
  if (outcome === "no-balance") return { error: "Assign this staff member a leave entitlement before requesting leave." };
  if (outcome === "invalid-leave-type") return { error: "Choose a leave type available to this branch." };
  if (outcome === "overlap") return { error: "This staff member already has a pending or approved leave request during those dates." };
  if (outcome === "over-balance") return { error: "This request exceeds the available leave entitlement." };
  revalidateHr();
  return { success: true };
}

export async function reviewStaffLeaveRequest(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    publicId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reviewNote: z.string().trim().max(500),
  }).safeParse({
    publicId: value(formData, "publicId"),
    decision: value(formData, "decision"),
    reviewNote: value(formData, "reviewNote"),
  });
  if (!result.success) return { error: "Choose a valid leave request decision." };
  const outcome = await db.transaction(async (tx) => {
    const [request] = await tx.select({
      id: staffLeaveRequests.id,
      staffId: staffLeaveRequests.staffId,
      leaveTypeId: staffLeaveRequests.leaveTypeId,
      leaveYear: staffLeaveRequests.leaveYear,
      requestedDays: staffLeaveRequests.requestedDays,
      startDate: staffLeaveRequests.startDate,
      endDate: staffLeaveRequests.endDate,
      status: staffLeaveRequests.status,
    }).from(staffLeaveRequests)
      .where(and(
        eq(staffLeaveRequests.publicId, result.data.publicId),
        eq(staffLeaveRequests.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!request) return "not-found";
    if (!canReviewLeaveRequest(request.status)) return "already-reviewed";
    if (result.data.decision === "approved") {
      const [staff] = await tx.select({ id: staffMembers.id }).from(staffMembers)
        .where(and(
          eq(staffMembers.id, request.staffId),
          eq(staffMembers.schoolId, context.schoolId),
        )).for("update").limit(1);
      if (!staff) return "not-found";
      const [overlap] = await tx.select({ id: staffLeaveRequests.id })
        .from(staffLeaveRequests).where(and(
          eq(staffLeaveRequests.schoolId, context.schoolId),
          eq(staffLeaveRequests.staffId, request.staffId),
          eq(staffLeaveRequests.status, "approved"),
          ne(staffLeaveRequests.id, request.id),
          lte(staffLeaveRequests.startDate, request.endDate),
          gte(staffLeaveRequests.endDate, request.startDate),
        )).limit(1);
      if (overlap) return "overlap";
      const [balance] = await tx.select({
        entitlementDays: staffLeaveBalances.entitlementDays,
      }).from(staffLeaveBalances).where(and(
        eq(staffLeaveBalances.schoolId, context.schoolId),
        eq(staffLeaveBalances.staffId, request.staffId),
        eq(staffLeaveBalances.leaveTypeId, request.leaveTypeId),
        eq(staffLeaveBalances.leaveYear, request.leaveYear),
      )).for("update").limit(1);
      if (!balance) return "no-balance";
      const approved = await tx.select({
        requestedDays: staffLeaveRequests.requestedDays,
      }).from(staffLeaveRequests).where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        eq(staffLeaveRequests.staffId, request.staffId),
        eq(staffLeaveRequests.leaveTypeId, request.leaveTypeId),
        eq(staffLeaveRequests.leaveYear, request.leaveYear),
        eq(staffLeaveRequests.status, "approved"),
        ne(staffLeaveRequests.id, request.id),
      ));
      if (approved.reduce((sum, item) => sum + item.requestedDays, request.requestedDays)
        > Number(balance.entitlementDays)) return "over-balance";
    }
    await tx.update(staffLeaveRequests).set({
      status: result.data.decision,
      reviewNote: result.data.reviewNote || null,
      reviewedBy: context.user.id,
      reviewedAt: new Date(),
    }).where(eq(staffLeaveRequests.id, request.id));
    await writeAudit(tx, context.schoolId, context.user.id, `staff.leave.${result.data.decision}`,
      "staff_leave_request", result.data.publicId, ["status", "reviewNote"]);
    return "updated";
  });
  if (outcome === "not-found") return { error: "Leave request was not found in this school." };
  if (outcome === "already-reviewed") return { error: "This leave request has already been reviewed." };
  if (outcome === "overlap") return { error: "Another approved leave request overlaps these dates." };
  if (outcome === "no-balance") return { error: "The leave entitlement for this request no longer exists." };
  if (outcome === "over-balance") return { error: "Approving this request would exceed the available leave entitlement." };
  revalidateHr();
  return { success: true };
}

export async function recordStaffPayroll(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    staffId: idField,
    branchId: idField,
    currency: z.string().regex(/^[A-Z]{3}$/),
    payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    baseSalary: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    allowances: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    deductions: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    notes: z.string().trim().max(1000),
  }).safeParse({
    staffId: value(formData, "staffId"),
    branchId: value(formData, "branchId"),
    currency: value(formData, "currency"),
    payPeriod: value(formData, "payPeriod"),
    baseSalary: value(formData, "baseSalary"),
    allowances: value(formData, "allowances"),
    deductions: value(formData, "deductions"),
    notes: value(formData, "notes"),
  });
  if (!result.success) return { error: "Enter valid payroll amounts and details." };
  const baseSalary = parsePayrollMoneyToMinorUnits(result.data.baseSalary);
  const allowances = parsePayrollMoneyToMinorUnits(result.data.allowances);
  const deductions = parsePayrollMoneyToMinorUnits(result.data.deductions);
  if (baseSalary === null || allowances === null || deductions === null) {
    return { error: "Enter payroll amounts with no more than two decimal places." };
  }
  const payroll = calculatePayrollAmounts(baseSalary, allowances, deductions);
  if (!payroll) return { error: "Base salary must be positive and deductions cannot exceed gross pay." };
  const [staff] = await db.select({ id: staffMembers.id })
    .from(staffMembers).where(and(
      eq(staffMembers.id, result.data.staffId),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.branchId, result.data.branchId),
    )).limit(1);
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code })
    .from(schoolCurrencies).where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!staff) return { error: "Choose a staff member belonging to this school." };
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };

  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(staffPayrollRecords).values({
        publicId,
        schoolId: context.schoolId,
        staffId: staff.id,
        payPeriod: result.data.payPeriod,
        baseSalary: formatPayrollMinorUnits(baseSalary),
        allowances: formatPayrollMinorUnits(allowances),
        deductions: formatPayrollMinorUnits(deductions),
        amount: formatPayrollMinorUnits(payroll.net),
        currency: configuredCurrency.code,
        paidDate: null,
        status: "recorded",
        notes: result.data.notes || null,
        recordedBy: context.user.id,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "staff.payroll.recorded",
        "staff_payroll_record", publicId,
        ["staffId", "payPeriod", "baseSalary", "allowances", "deductions", "amount", "currency", "notes"]);
    });
  } catch (error) {
    if (isDuplicateError(error)) return { error: "A payroll record already exists for this staff member and period." };
    throw error;
  }
  revalidateHr();
  return { success: true };
}

export async function updateStaffPayroll(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const result = z.object({
    publicId: z.string().uuid(),
    staffId: idField,
    branchId: idField,
    currency: z.string().regex(/^[A-Z]{3}$/),
    payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    baseSalary: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    allowances: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    deductions: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    notes: z.string().trim().max(1000),
  }).safeParse({
    publicId: value(formData, "publicId"),
    staffId: value(formData, "staffId"),
    branchId: value(formData, "branchId"),
    currency: value(formData, "currency"),
    payPeriod: value(formData, "payPeriod"),
    baseSalary: value(formData, "baseSalary"),
    allowances: value(formData, "allowances"),
    deductions: value(formData, "deductions"),
    notes: value(formData, "notes"),
  });
  if (!result.success) return { error: "Enter valid payroll amounts and details." };
  const baseSalary = parsePayrollMoneyToMinorUnits(result.data.baseSalary);
  const allowances = parsePayrollMoneyToMinorUnits(result.data.allowances);
  const deductions = parsePayrollMoneyToMinorUnits(result.data.deductions);
  if (baseSalary === null || allowances === null || deductions === null) {
    return { error: "Enter payroll amounts with no more than two decimal places." };
  }
  const payroll = calculatePayrollAmounts(baseSalary, allowances, deductions);
  if (!payroll) return { error: "Base salary must be positive and deductions cannot exceed gross pay." };
  const [staff] = await db.select({ id: staffMembers.id })
    .from(staffMembers).where(and(
      eq(staffMembers.id, result.data.staffId),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.branchId, result.data.branchId),
    )).limit(1);
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code })
    .from(schoolCurrencies).where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!staff) return { error: "Choose a staff member belonging to this school." };
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };

  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx.select({
        id: staffPayrollRecords.id,
        status: staffPayrollRecords.status,
      })
        .from(staffPayrollRecords).where(and(
          eq(staffPayrollRecords.publicId, result.data.publicId),
          eq(staffPayrollRecords.schoolId, context.schoolId),
        )).for("update").limit(1);
      if (!existing) return "not-found";
      if (existing.status === "paid") return "already-paid";
      await tx.update(staffPayrollRecords).set({
        staffId: staff.id,
        payPeriod: result.data.payPeriod,
        baseSalary: formatPayrollMinorUnits(baseSalary),
        allowances: formatPayrollMinorUnits(allowances),
        deductions: formatPayrollMinorUnits(deductions),
        amount: formatPayrollMinorUnits(payroll.net),
        currency: configuredCurrency.code,
        notes: result.data.notes || null,
      }).where(and(
        eq(staffPayrollRecords.id, existing.id),
        eq(staffPayrollRecords.schoolId, context.schoolId),
      ));
      await writeAudit(tx, context.schoolId, context.user.id, "staff.payroll.updated",
        "staff_payroll_record", result.data.publicId,
        ["staffId", "payPeriod", "baseSalary", "allowances", "deductions", "amount", "currency", "notes"]);
      return "updated";
    });
    if (outcome === "not-found") return { error: "Payroll record was not found in this school." };
    if (outcome === "already-paid") return { error: "Paid payroll records cannot be edited in Human resources." };
  } catch (error) {
    if (isDuplicateError(error)) return { error: "A payroll record already exists for this staff member and period." };
    throw error;
  }
  revalidateHr();
  return { success: true };
}

export async function deleteStaffPayrollRecord(
  _previousState: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const publicId = z.string().uuid().safeParse(value(formData, "publicId"));
  if (!publicId.success) return { error: "Choose a valid payroll record." };
  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: staffPayrollRecords.id,
      status: staffPayrollRecords.status,
    }).from(staffPayrollRecords).where(and(
      eq(staffPayrollRecords.publicId, publicId.data),
      eq(staffPayrollRecords.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!record) return "not-found";
    if (record.status === "paid") return "already-paid";
    await writeAudit(tx, context.schoolId, context.user.id, "staff.payroll.deleted",
      "staff_payroll_record", publicId.data, ["staffId", "payPeriod", "amount", "status"]);
    await tx.delete(staffPayrollRecords).where(and(
      eq(staffPayrollRecords.id, record.id),
      eq(staffPayrollRecords.schoolId, context.schoolId),
    ));
    return "deleted";
  });
  if (outcome === "not-found") return { error: "Payroll record was not found in this school." };
  if (outcome === "already-paid") return { error: "Paid payroll records cannot be deleted." };
  revalidateHr();
  return { success: true };
}

function isDuplicateError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error.code === "ER_DUP_ENTRY" || error.code === "1062");
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}
