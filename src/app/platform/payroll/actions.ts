"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { getStaffPayrollPaymentError, recordStaffPayrollPayment } from "@/lib/staff-payroll-payment";
import { requirePlatformAdmin } from "@/lib/platform-access";

export type PlatformPayrollActionState = { error?: string; success?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

export async function platformPayStaffPayrollRecord(
  _state: PlatformPayrollActionState,
  formData: FormData,
): Promise<PlatformPayrollActionState> {
  const actor = await requirePlatformAdmin();
  const parsed = z.object({
    schoolPublicId: z.string().uuid(),
    payrollPublicId: z.string().uuid(),
    categoryAccountId: idField,
    bankAccountId: idField,
    paidDate: z.string().refine(isCalendarDate),
    reference: z.string().trim().max(120),
  }).safeParse({
    schoolPublicId: value(formData, "schoolPublicId"),
    payrollPublicId: value(formData, "payrollPublicId"),
    categoryAccountId: value(formData, "categoryAccountId"),
    bankAccountId: value(formData, "bankAccountId"),
    paidDate: value(formData, "paidDate"),
    reference: value(formData, "reference"),
  });
  if (!parsed.success) return { error: "Choose an expense category, matching bank or cash account, and valid payment date." };

  try {
    const outcome = await recordStaffPayrollPayment({
      ...parsed.data,
      actorUserId: actor.id,
    });
    if (outcome !== "paid") return { error: getStaffPayrollPaymentError(outcome) };
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A payment has already been recorded for this payroll record." };
    throw error;
  }

  revalidatePath("/platform/payroll");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/hr/payroll");
  return { success: "Payment recorded. SchoolOS does not transfer funds; confirm the staff member was paid externally." };
}
