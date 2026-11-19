"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { provisionSchoolWorkspace, SchoolNameConflictError } from "@/lib/school-provisioning";

export type CreateSchoolState = { error?: string; success?: string };

const createSchoolSchema = z.object({
  schoolName: z.string().trim().min(2).max(255),
  schoolEmail: z.union([z.literal(""), z.string().trim().email().max(320)]),
  schoolPhone: z.string().trim().max(40),
  schoolAddress: z.string().trim().max(1000),
  adminName: z.string().trim().max(255).optional().refine((name) => !name || name.length >= 2),
  adminEmail: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  adminPassword: z.string().max(128).optional().refine((password) => !password || password.length >= 12),
});

class ProvisioningError extends Error {}

export async function createSchool(
  _previousState: CreateSchoolState,
  formData: FormData,
): Promise<CreateSchoolState> {
  const actor = await requirePlatformAdmin();
  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a school name, a valid administrator name and email, and a password of 12–128 characters." };
  }

  const values = parsed.data;

  try {
    await db.transaction(async (tx) => {
      let [adminUser] = await tx.select({ id: user.id, isActive: user.isActive })
        .from(user).where(eq(user.email, values.adminEmail)).limit(1);
      if (adminUser && !adminUser.isActive) {
        throw new ProvisioningError("The administrator account exists but is disabled.");
      }

      if (!adminUser) {
        if (!values.adminName || !values.adminPassword) {
          throw new ProvisioningError("Enter an administrator name and a password of at least 12 characters for a new account.");
        }
        const userId = randomUUID();
        const passwordHash = await hashPassword(values.adminPassword);
        await tx.insert(user).values({
          id: userId,
          name: values.adminName,
          email: values.adminEmail,
          emailVerified: true,
          isActive: true,
        });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        });
        adminUser = { id: userId, isActive: true };
      }
      await provisionSchoolWorkspace(tx, {
        name: values.schoolName,
        email: values.schoolEmail || null,
        phone: values.schoolPhone || null,
        address: values.schoolAddress || null,
        administratorUserId: adminUser.id,
        actorUserId: actor.id,
      });
    });
  } catch (error) {
    if (error instanceof ProvisioningError) return { error: error.message };
    if (error instanceof SchoolNameConflictError) return { error: error.message };
    if (isDuplicateEntryError(error)) return { error: "A conflicting school or administrator record already exists." };
    throw error;
  }

  revalidatePath("/platform/schools");
  return { success: `${values.schoolName} was created. ${values.adminEmail} now has the School administrator role.` };
}
