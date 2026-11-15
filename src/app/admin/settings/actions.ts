"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schools } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(1000),
  logoUrl: z.union([z.literal(""), z.string().trim().url().max(2048).refine((value) => value.startsWith("https://"))]),
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
    logoUrl: formData.get("logoUrl"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
  });

  if (!result.success) {
    return { error: "Review the fields and enter valid school information." };
  }

  const changes = {
    name: result.data.name,
    email: result.data.email || null,
    phone: result.data.phone || null,
    address: result.data.address || null,
    logoUrl: result.data.logoUrl || null,
    currency: result.data.currency,
    timezone: result.data.timezone,
  };
  await db.transaction(async (tx) => {
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
