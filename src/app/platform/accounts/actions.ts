"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
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
    issuePasswordSetup: z.string().transform((value) => value === "true"),
  }).safeParse({
    userId: formData.get("userId"),
    email: formData.get("email"),
    issuePasswordSetup: formData.get("issuePasswordSetup") ?? "",
  });
  if (!parsed.success) return { error: "Enter a valid email address and account." };
  const { userId, email, issuePasswordSetup } = parsed.data;
  let setupUrl: string | undefined;

  try {
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
      if (emailChanged) await tx.update(user).set({ email }).where(eq(user.id, userId));

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

      if (issuePasswordSetup) setupUrl = await issuePasswordSetupLink(tx, userId);

      if (emailChanged || issuePasswordSetup) {
        await tx.delete(session).where(eq(session.userId, userId));
        const changedFields = [
          ...(emailChanged ? ["credential.email"] : []),
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
    success: "Account updated.",
    ...(setupUrl ? { setupUrl } : {}),
  };
}
