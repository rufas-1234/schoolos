import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureSupabaseIdentityForLocalUser } from "@/lib/supabase/local-account";
import { getBoundedRequest, maxApiRequestBodyBytes } from "@/lib/request-body-limit";

export async function POST(request: Request) {
  const bounded = await getBoundedRequest(request, maxApiRequestBodyBytes);
  if (!bounded.ok) return bounded.response;

  let body: { email?: unknown };
  try {
    body = await bounded.request.json() as { email?: unknown };
  } catch {
    return Response.json({ error: "Enter your SchoolOS email before continuing with Google." }, { status: 400 });
  }
  if (typeof body.email !== "string" || body.email.trim().length > 320 || !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
    return Response.json({ error: "Enter your SchoolOS email before continuing with Google." }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const [localUser] = await db.select({ id: user.id, name: user.name, email: user.email, isActive: user.isActive })
    .from(user).where(eq(user.email, email)).limit(1);
  if (!localUser?.isActive) {
    return Response.json({ error: "Google sign-in is available for active SchoolOS accounts. Check your email or contact an administrator." }, { status: 401 });
  }

  try {
    await ensureSupabaseIdentityForLocalUser(localUser);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Supabase Auth is not configured correctly for this account." }, { status: 503 });
  }
}
