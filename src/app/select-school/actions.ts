"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserSchoolMemberships } from "@/lib/access-control";
import { getSignedInWorkspacePath } from "@/app/login/actions";
import { activeSchoolCookieName, isMultiSchoolEnabled } from "@/lib/school-context-policy";

export async function selectSchool(formData: FormData) {
  const { memberships } = await getCurrentUserSchoolMemberships();
  const schoolPublicId = formData.get("schoolPublicId");
  if (
    typeof schoolPublicId !== "string" ||
    !memberships.some((membership) => membership.schoolPublicId === schoolPublicId) ||
    (!isMultiSchoolEnabled() && memberships.length > 1)
  ) {
    redirect("/select-school?reason=invalid-selection");
  }

  const cookieStore = await cookies();
  cookieStore.set(activeSchoolCookieName, schoolPublicId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(await getSignedInWorkspacePath());
}
