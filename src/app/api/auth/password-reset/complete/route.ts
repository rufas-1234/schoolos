import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { getPasswordStrengthError } from "@/lib/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: { password?: unknown; confirmation?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Enter and confirm your new password." }, { status: 400 });
  }
  if (typeof body.password !== "string" || typeof body.confirmation !== "string") {
    return NextResponse.json({ error: "Enter and confirm your new password." }, { status: 400 });
  }
  const strengthError = getPasswordStrengthError(body.password);
  if (strengthError) return NextResponse.json({ error: strengthError }, { status: 400 });
  if (body.password !== body.confirmation) {
    return NextResponse.json({ error: "The passwords do not match." }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError) {
      return NextResponse.json({ error: "The reset link could not be verified. Request a new link and try again." }, { status: 500 });
    }
    const claims = claimsData?.claims;
    const authenticationMethods = claims?.amr;
    const isRecoverySession = Array.isArray(authenticationMethods) && authenticationMethods.some(
      (entry) => typeof entry === "object" && entry !== null && "method" in entry && entry.method === "recovery",
    );
    if (!isRecoverySession) {
      return NextResponse.json({ error: "Open the password reset link from your email, then try again." }, { status: 403 });
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser?.email) {
      return NextResponse.json({ error: "This reset link is invalid or expired. Request a new one." }, { status: 401 });
    }
    const mappedUserId = typeof authUser.app_metadata?.schoolos_user_id === "string"
      ? authUser.app_metadata.schoolos_user_id
      : null;
    const [localUser] = await db.select({ id: user.id, isActive: user.isActive })
      .from(user)
      .where(mappedUserId ? eq(user.id, mappedUserId) : eq(user.email, authUser.email.toLowerCase()))
      .limit(1);
    if (!localUser?.isActive) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "This account is inactive. Contact your school administrator." }, { status: 403 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: body.password });
    if (updateError) {
      return NextResponse.json({ error: "The password could not be updated. Request a new reset link and try again." }, { status: 400 });
    }
    await db.update(account).set({ password: null })
      .where(and(eq(account.userId, localUser.id), eq(account.providerId, "credential")));
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, localUser.id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "The password could not be updated. Request a new reset link and try again." }, { status: 500 });
  }
}
