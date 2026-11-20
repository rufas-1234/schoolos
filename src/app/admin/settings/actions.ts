"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schoolCurrencies, schools } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { isSupportedCurrencyCode } from "@/lib/currency-policy";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(1000),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
});

export type ProfileActionState = { error?: string; success?: boolean };

function currencyFormValue(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function revalidateCurrencyPages() {
  for (const path of [
    "/admin/settings",
    "/admin/dashboard",
    "/admin/accounts",
    "/admin/fees",
    "/admin/fees/collection",
    "/admin/fees/reports",
    "/portal/finance",
    "/portal/student",
  ]) revalidatePath(path);
}

export async function createSchoolCurrency(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const code = currencyFormValue(formData, "code").toUpperCase();
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    symbol: z.string().trim().min(1).max(12),
  }).safeParse({
    name: currencyFormValue(formData, "name"),
    symbol: currencyFormValue(formData, "symbol"),
  });
  if (!isSupportedCurrencyCode(code) || !parsed.success) {
    return { error: "Enter a supported three-letter currency code, name, and symbol." };
  }
  const publicId = randomUUID();
  const makeDefault = formData.get("makeDefault") === "on";
  try {
    await db.transaction(async (tx) => {
      if (makeDefault) {
        await tx.update(schoolCurrencies).set({ isDefault: false })
          .where(eq(schoolCurrencies.schoolId, context.schoolId));
      }
      await tx.insert(schoolCurrencies).values({
        publicId,
        schoolId: context.schoolId,
        code,
        name: parsed.data.name,
        symbol: parsed.data.symbol,
        isDefault: makeDefault,
      });
      if (makeDefault) {
        await tx.update(schools).set({ currency: code })
          .where(eq(schools.id, context.schoolId));
      }
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "school.currency.created",
        resourceType: "school_currency",
        resourcePublicId: publicId,
        changedFields: ["code", "name", "symbol", "isDefault"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "That currency is already configured for this school." };
    throw error;
  }
  revalidateCurrencyPages();
  return { success: true };
}

export async function setDefaultSchoolCurrency(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const code = currencyFormValue(formData, "code").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return { error: "Choose a configured currency." };
  const outcome = await db.transaction(async (tx) => {
    const [currency] = await tx.select({
      code: schoolCurrencies.code,
      publicId: schoolCurrencies.publicId,
    }).from(schoolCurrencies).where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, code),
    )).for("update").limit(1);
    if (!currency) return false;
    await tx.update(schoolCurrencies).set({ isDefault: false })
      .where(eq(schoolCurrencies.schoolId, context.schoolId));
    await tx.update(schoolCurrencies).set({ isDefault: true })
      .where(and(
        eq(schoolCurrencies.schoolId, context.schoolId),
        eq(schoolCurrencies.code, code),
      ));
    await tx.update(schools).set({ currency: code })
      .where(eq(schools.id, context.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "school.currency.default_changed",
      resourceType: "school_currency",
      resourcePublicId: currency.publicId,
      changedFields: ["isDefault"],
    });
    return true;
  });
  if (!outcome) return { error: "That currency is not configured for this school." };
  revalidateCurrencyPages();
  return { success: true };
}

export async function updateSchoolProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
  });

  if (!result.success) {
    return { error: "Review the fields and enter valid school information." };
  }
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code })
    .from(schoolCurrencies).where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };

  const changes = {
    name: result.data.name,
    email: result.data.email || null,
    phone: result.data.phone || null,
    address: result.data.address || null,
    currency: result.data.currency,
    timezone: result.data.timezone,
  };
  await db.transaction(async (tx) => {
    await tx.update(schoolCurrencies).set({ isDefault: false })
      .where(eq(schoolCurrencies.schoolId, context.schoolId));
    await tx.update(schoolCurrencies).set({ isDefault: true })
      .where(and(
        eq(schoolCurrencies.schoolId, context.schoolId),
        eq(schoolCurrencies.code, result.data.currency),
      ));
    await tx
      .update(schools)
      .set(changes)
      .where(eq(schools.id, context.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "school.profile.updated",
      resourceType: "school",
      resourcePublicId: context.schoolPublicId,
      changedFields: Object.keys(changes),
    });
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  return { success: true };
}
