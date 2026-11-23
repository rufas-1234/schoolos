import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginRedirect(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return loginRedirect(request, "oauth-failed");

  try {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return loginRedirect(request, "oauth-failed");

    const { data: { user: providerUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !providerUser?.email) {
      await supabase.auth.signOut();
      return loginRedirect(request, "oauth-failed");
    }

    const mappedUserId = typeof providerUser.app_metadata?.schoolos_user_id === "string"
      ? providerUser.app_metadata.schoolos_user_id
      : null;
    const [localUser] = await db.select({ id: user.id, isActive: user.isActive })
      .from(user)
      .where(mappedUserId ? eq(user.id, mappedUserId) : eq(user.email, providerUser.email.toLowerCase()))
      .limit(1);
    if (!localUser) {
      await supabase.auth.signOut();
      return loginRedirect(request, "account-not-found");
    }
    if (!localUser.isActive) {
      await supabase.auth.signOut();
      return loginRedirect(request, "account-disabled");
    }

    if (request.nextUrl.searchParams.get("type") === "recovery") {
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }

    return NextResponse.redirect(new URL("/select-school", request.url));
  } catch {
    return loginRedirect(request, "oauth-failed");
  }
}
