"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaffLoginPasswordError } from "@/lib/staff-policy";
import { db } from "@/db";
import {
  account as authAccount,
  auditLogs,
  schoolMemberships,
  session,
  staffMembers,
  students,
  user,
  userStudentLinks,
} from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { issuePasswordSetupLink } from "@/lib/account-setup";
import { requirePlatformAdmin } from "@/lib/platform-access";

export type PlatformAccountRecoveryState = { error?: string; success?: string; setupUrl?: string };

export async function updatePlatformAccountCredentials(
  _previousState: PlatformAccountRecoveryState,
  formData: FormData,
): Promise<PlatformAccountRecoveryState> {
  const actor = await requirePlatformAdmin();
  const parsed = z.object({
    userId: z.string().uuid(),
    email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
    password: z.string().max(128),
    passwordConfirmation: z.string().max(128),
    issuePasswordSetup: z.string().transform((value) => value === "true"),
  }).safeParse({
    userId: formData.get("userId"),
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    passwordConfirmation: formData.get("passwordConfirmation") ?? "",
    issuePasswordSetup: formData.get("issuePasswordSetup") ?? "",
  });
  if (!parsed.success) return { error: "Enter a valid email address and account." };
  const { userId, email, password, passwordConfirmation, issuePasswordSetup } = parsed.data;
  const passwordError = getStaffLoginPasswordError(password, passwordConfirmation);
  if (passwordError) return { error: passwordError };
  if (issuePasswordSetup && password) {
    return { error: "Choose either a temporary password or a one-time setup link, not both." };
  }
  if (!password && passwordConfirmation) return { error: "Enter a temporary password to confirm." };
  let setupUrl: string | undefined;

  try {
    const passwordHash = password ? await hashPassword(password) : null;
    const outcome = await db.transaction(async (tx) => {
      const [target] = await tx.select({ email: user.email }).from(user)
        .where(eq(user.id, userId))
        .for("update")
        .limit(1);
      if (!target) return "account-not-found" as const;
      const memberships = await tx.select({
        schoolId: schoolMemberships.schoolId,
      }).from(schoolMemberships)
        .where(eq(schoolMemberships.userId, userId))
        .for("update");
      if (!memberships.length) return "account-not-found" as const;

      const emailChanged = target.email.toLowerCase() !== email;
      if (emailChanged || passwordHash) {
        await tx.update(user).set({
          ...(emailChanged ? { email } : {}),
          ...(passwordHash ? { isActive: true, mustChangePassword: true } : {}),
        }).where(eq(user.id, userId));
      }

      if (emailChanged) {
        await tx.update(staffMembers).set({ email }).where(eq(staffMembers.linkedUserId, userId));
        const studentLinks = await tx.select({
          schoolId: userStudentLinks.schoolId,
          studentId: userStudentLinks.studentId,
        }).from(userStudentLinks).where(and(
          eq(userStudentLinks.userId, userId),
          eq(userStudentLinks.accessType, "student"),
        )).for("update");
        for (const link of studentLinks) {
          await tx.update(students).set({ email }).where(and(
            eq(students.id, link.studentId),
            eq(students.schoolId, link.schoolId),
          ));
        }
      }

      if (passwordHash) {
        const [credentialAccount] = await tx.select({ id: authAccount.id })
          .from(authAccount)
          .where(and(
            eq(authAccount.userId, userId),
            eq(authAccount.providerId, "credential"),
          ))
          .for("update")
          .limit(1);
        if (credentialAccount) {
          await tx.update(authAccount).set({ password: passwordHash })
            .where(eq(authAccount.id, credentialAccount.id));
        } else {
          await tx.insert(authAccount).values({
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
          });
        }
      }

      if (issuePasswordSetup) setupUrl = await issuePasswordSetupLink(tx, userId);

      if (emailChanged || passwordHash || issuePasswordSetup) {
        await tx.delete(session).where(eq(session.userId, userId));
        const changedFields = [
          ...(emailChanged ? ["credential.email"] : []),
          ...(passwordHash ? ["credential.password", "user.mustChangePassword"] : []),
          ...(issuePasswordSetup ? ["credential.password", "user.isActive"] : []),
        ];
        for (const membership of memberships) {
          await tx.insert(auditLogs).values({
            schoolId: membership.schoolId,
            actorUserId: actor.id,
            action: "platform.account.credentials_reset",
            resourceType: "user",
            resourcePublicId: userId,
            changedFields,
          });
        }
      }
      return "updated" as const;
    });

    if (outcome === "account-not-found") return { error: "This account is no longer linked to a school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "That email address is already in use by another SchoolOS account." };
    console.error("Platform account recovery failed; transaction rolled back.", error);
    return { error: "Account details could not be updated. No changes were made." };
  }

  revalidatePath("/platform/accounts");
  revalidatePath("/admin/users");
  revalidatePath("/admin/students");
  revalidatePath("/admin/staff");
  return {
    success: password
      ? "Account updated. The recipient must change the temporary password before accessing the workspace; share it securely."
      : issuePasswordSetup
        ? "Account updated. Copy the one-time setup link below and share it securely."
        : "Account updated.",
    ...(setupUrl ? { setupUrl } : {}),
  };
}
