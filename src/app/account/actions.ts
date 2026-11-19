"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSchoolMember } from "@/lib/access-control";

export type AccountPasswordState = { error?: string; success?: boolean; message?: string };

function readPassword(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function changeAccountPassword(
  _previousState: AccountPasswordState,
  formData: FormData,
): Promise<AccountPasswordState> {
  await requireSchoolMember();
  const currentPassword = readPassword(formData, "currentPassword");
  const newPassword = readPassword(formData, "newPassword");
  const passwordConfirmation = readPassword(formData, "passwordConfirmation");

  if (!currentPassword || !newPassword) return { error: "Enter your current password and a new password." };
  if (newPassword.length < 12 || newPassword.length > 128) {
    return { error: "Your new password must be between 12 and 128 characters." };
  }
  if (newPassword !== passwordConfirmation) return { error: "The new passwords do not match." };
  if (newPassword === currentPassword) return { error: "Choose a password different from your current password." };

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    });
  } catch {
    return { error: "The current password is incorrect, or this account cannot change its password. Check it and try again." };
  }

  revalidatePath("/account/security");
  return { success: true, message: "Your password has been changed." };
}
