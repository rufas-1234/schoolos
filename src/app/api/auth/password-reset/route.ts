import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { ensureSupabaseIdentityForLocalUser } from "@/lib/supabase/local-account";
import { createClient } from "@supabase/supabase-js";

const genericMessage = "If an active SchoolOS account uses that email, a password reset message will be sent.";

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const [localUser] = await db.select({ id: user.id, email: user.email, name: user.name, isActive: user.isActive })
      .from(user).where(eq(user.email, email)).limit(1);
    if (localUser?.isActive) {
      await ensureSupabaseIdentityForLocalUser(localUser);
      const config = getSupabasePublicConfig();
      if (config) {
        const supabase = createClient(config.url, config.key, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("/auth/callback?type=recovery", request.url).toString(),
        });
      }
    }
  } catch {
    // Keep the response generic so the endpoint does not disclose which emails
    // belong to active accounts. Supabase applies its own email rate limits.
  }

  return NextResponse.json({ message: genericMessage });
}
