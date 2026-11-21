"use server";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { account, auditLogs, schoolMemberships, session, user, verification } from "@/db/schema";
import { getPasswordStrengthError } from "@/lib/password-policy";
import {
  matchesPasswordSetupToken,
  parsePasswordSetupToken,
} from "@/lib/account-setup";

export type AccountSetupState = { error?: string; success?: boolean };

export async function completeAccountPasswordSetup(
  _previousState: AccountSetupState,
  formData: FormData,
): Promise<AccountSetupState> {
  const parsed = z.object({
    token: z.string().max(100),
    password: z.string().max(128),
    passwordConfirmation: z.string().max(128),
  }).safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });
  if (!parsed.success) return { error: "Enter a valid password and setup link." };
  const tokenData = parsePasswordSetupToken(parsed.data.token);
  if (!tokenData) return { error: "This setup link is invalid, expired, or already used. Ask your school administrator for a new one." };
  const passwordError = getPasswordStrengthError(parsed.data.password);
  if (passwordError) return { error: passwordError };
  if (parsed.data.password !== parsed.data.passwordConfirmation) {
    return { error: "The passwords do not match." };
  }

  const [issuedChallenge] = await db.select({
    value: verification.value,
    expiresAt: verification.expiresAt,
  }).from(verification)
    .where(eq(verification.identifier, tokenData.identifier))
    .limit(1);
  if (
    !issuedChallenge ||
    issuedChallenge.expiresAt.getTime() <= Date.now() ||
    !matchesPasswordSetupToken(issuedChallenge.value, tokenData.value)
  ) {
    return { error: "This setup link is invalid, expired, or already used. Ask your school administrator for a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const outcome = await db.transaction(async (tx) => {
    const [challenge] = await tx.select({
      id: verification.id,
      value: verification.value,
      expiresAt: verification.expiresAt,
    }).from(verification)
      .where(eq(verification.identifier, tokenData.identifier))
      .for("update")
      .limit(1);
    if (
      !challenge ||
      challenge.expiresAt.getTime() <= Date.now() ||
      !matchesPasswordSetupToken(challenge.value, tokenData.value)
    ) {
      return "invalid";
    }

    const [credential] = await tx.select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, tokenData.userId), eq(account.providerId, "credential")))
      .for("update")
      .limit(1);
    if (!credential) return "invalid";

    await tx.update(account).set({ password: passwordHash }).where(eq(account.id, credential.id));
    await tx.update(user).set({ isActive: true }).where(eq(user.id, tokenData.userId));
    await tx.delete(session).where(eq(session.userId, tokenData.userId));
    await tx.delete(verification).where(eq(verification.id, challenge.id));

    const memberships = await tx.select({ schoolId: schoolMemberships.schoolId })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.userId, tokenData.userId));
    for (const membership of memberships) {
      await tx.insert(auditLogs).values({
        schoolId: membership.schoolId,
        actorUserId: tokenData.userId,
        action: "account.password_setup.completed",
        resourceType: "user",
        resourcePublicId: tokenData.userId,
        changedFields: ["credential.password", "user.isActive"],
      });
    }
    return "completed";
  });

  if (outcome !== "completed") {
    return { error: "This setup link is invalid, expired, or already used. Ask your school administrator for a new one." };
  }

  revalidatePath("/login");
  return { success: true };
}
