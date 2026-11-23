"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { changeSupabasePassword } from "@/lib/supabase/password";
import { requireSchoolMember } from "@/lib/access-control";
import { getPasswordStrengthError } from "@/lib/password-policy";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { getSignedInWorkspacePath } from "@/app/login/actions";

export type AccountPasswordState = { error?: string; success?: boolean; message?: string; redirectTo?: string };

function readPassword(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function changeAccountPassword(
  _previousState: AccountPasswordState,
  formData: FormData,
): Promise<AccountPasswordState> {
  const context = await requireSchoolMember();
  const currentPassword = readPassword(formData, "currentPassword");
  const newPassword = readPassword(formData, "newPassword");
  const passwordConfirmation = readPassword(formData, "passwordConfirmation");

  if (!currentPassword || !newPassword) return { error: "Enter your current password and a new password." };
  const passwordStrengthError = getPasswordStrengthError(newPassword);
  if (passwordStrengthError) return { error: passwordStrengthError };
  if (newPassword !== passwordConfirmation) return { error: "The new passwords do not match." };
  if (newPassword === currentPassword) return { error: "Choose a password different from your current password." };

  if (!(await changeSupabasePassword(currentPassword, newPassword))) {
    return { error: "The current password is incorrect, or this account cannot change its password. Check it and try again." };
  }
  await db.update(account).set({ password: null })
    .where(and(eq(account.userId, context.user.id), eq(account.providerId, "credential")));

  revalidatePath("/account/security");
  return { success: true, message: "Your password has been changed." };
}

export async function changeTemporaryPassword(
  _previousState: AccountPasswordState,
  formData: FormData,
): Promise<AccountPasswordState> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { error: "Your session has expired. Sign in again to continue." };

  const [signedInUser] = await db.select({
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  }).from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!signedInUser?.isActive) return { error: "This account is inactive. Contact your school administrator." };
  if (!signedInUser.mustChangePassword) {
    return { error: "This account no longer needs a temporary password change. Sign in again." };
  }

  const currentPassword = readPassword(formData, "currentPassword");
  const newPassword = readPassword(formData, "newPassword");
  const passwordConfirmation = readPassword(formData, "passwordConfirmation");
  if (!currentPassword || !newPassword) return { error: "Enter your temporary password and a new password." };
  const passwordStrengthError = getPasswordStrengthError(newPassword);
  if (passwordStrengthError) return { error: passwordStrengthError };
  if (newPassword !== passwordConfirmation) return { error: "The new passwords do not match." };
  if (newPassword === currentPassword) return { error: "Choose a password different from the temporary password." };

  if (!(await changeSupabasePassword(currentPassword, newPassword))) {
    return { error: "The temporary password is incorrect. Check it and try again." };
  }

  await db.update(account).set({ password: null })
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "credential")));
  await db.update(user)
    .set({ mustChangePassword: false })
    .where(eq(user.id, session.user.id));
  revalidatePath("/");
  return {
    success: true,
    message: "Your new password is set. Opening your school workspace…",
    redirectTo: await getSignedInWorkspacePath(),
  };
}
