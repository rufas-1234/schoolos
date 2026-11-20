"use server";

import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { account, user } from "@/db/schema";
import { db } from "@/db";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { consumePublicSchoolSignupRateLimit } from "@/lib/public-admission-rate-limit";
import { isMultiSchoolEnabled } from "@/lib/school-context-policy";
import { getNewSchoolAdminPasswordError, schoolSignupInputSchema } from "@/lib/school-signup-policy";
import { provisionSchoolWorkspace, SchoolNameConflictError } from "@/lib/school-provisioning";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";

export type SchoolSignupState = { error?: string; success?: string };

class SchoolSignupError extends Error {}

export async function signupSchool(
  _previousState: SchoolSignupState,
  formData: FormData,
): Promise<SchoolSignupState> {
  if (!isMultiSchoolEnabled()) {
    return { error: "School signup is currently unavailable. Please contact SchoolOS support." };
  }

  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || (process.env.NODE_ENV === "development" ? "local-development" : "");
  const isAllowed = await consumePublicSchoolSignupRateLimit({
    clientAddress,
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!isAllowed) {
    return { error: "Too many signup attempts. Please wait and try again." };
  }

  const parsed = schoolSignupInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the form fields and make sure both password entries match." };
  }

  const values = parsed.data;
  const email = values.adminEmail;
  try {
    await db.transaction(async (tx) => {
      const [existingUser] = await tx.select({
        id: user.id,
        isActive: user.isActive,
      }).from(user)
        .where(eq(user.email, email))
        .for("update")
        .limit(1);

      let administratorUserId = existingUser?.id;
      if (existingUser) {
        if (!existingUser.isActive) {
          throw new SchoolSignupError("We couldn't create the school with those details. Please check the account and try again.");
        }
        const [credentialAccount] = await tx.select({ password: account.password })
          .from(account)
          .where(and(
            eq(account.userId, existingUser.id),
            eq(account.providerId, "credential"),
          ))
          .for("update")
          .limit(1);
        if (!credentialAccount?.password || !(await verifyPassword({
          hash: credentialAccount.password,
          password: values.password,
        }))) {
          throw new SchoolSignupError("We couldn't verify the administrator account. Check the email and password, or contact support.");
        }
      } else {
        const passwordError = getNewSchoolAdminPasswordError(values.password);
        if (passwordError) throw new SchoolSignupError(passwordError);

        administratorUserId = randomUUID();
        const passwordHash = await hashPassword(values.password);
        await tx.insert(user).values({
          id: administratorUserId,
          name: values.adminName,
          email,
          emailVerified: false,
          isActive: true,
        });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: administratorUserId,
          providerId: "credential",
          userId: administratorUserId,
          password: passwordHash,
        });
      }

      if (!administratorUserId) throw new Error("The new administrator account could not be established.");
      await provisionSchoolWorkspace(tx, {
        name: values.schoolName,
        email: values.schoolEmail ?? null,
        phone: values.schoolPhone || null,
        address: values.schoolAddress || null,
        administratorUserId,
        actorUserId: administratorUserId,
        status: schoolWorkspaceStatuses.pending,
      });
    });
  } catch (error) {
    if (error instanceof SchoolSignupError || error instanceof SchoolNameConflictError) {
      return { error: error.message };
    }
    if (isDuplicateEntryError(error)) {
      return { error: "We couldn't create the school with those details. Check the email and try again." };
    }
    throw error;
  }

  revalidatePath("/login");
  return {
    success: `${values.schoolName} was submitted for platform review. School access will be available after approval.`,
  };
}
