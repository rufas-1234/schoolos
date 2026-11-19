import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isMultiSchoolEnabled } from "@/lib/school-context-policy";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";

export async function requirePlatformAdmin() {
  if (!isMultiSchoolEnabled()) redirect("/unauthorized");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  if (!isPlatformAdminEmail(session.user.email)) redirect("/unauthorized");

  const [activeUser] = await db
    .select({ isActive: user.isActive })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!activeUser?.isActive) redirect("/login?reason=account-disabled");

  return session.user;
}
