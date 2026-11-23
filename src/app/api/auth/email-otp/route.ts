import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureSupabaseIdentityForLocalUser } from "@/lib/supabase/local-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBoundedRequest, maxApiRequestBodyBytes } from "@/lib/request-body-limit";

const genericSendResponse = () => Response.json({ success: true });
const invalidCodeResponse = () => Response.json(
  { error: "That code is invalid or expired. Request a new code and try again." },
  { status: 401 },
);

export async function POST(request: Request) {
  const bounded = await getBoundedRequest(request, maxApiRequestBodyBytes);
  if (!bounded.ok) return bounded.response;

  let body: { action?: unknown; email?: unknown; token?: unknown };
  try {
    body = await bounded.request.json() as typeof body;
  } catch {
    return Response.json({ error: "Enter a valid email address and code." }, { status: 400 });
  }

  if (body.action !== "send" && body.action !== "verify") {
    return Response.json({ error: "Choose whether to send or verify an email code." }, { status: 400 });
  }
  if (typeof body.email !== "string" || body.email.trim().length > 320 || !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const [localUser] = await db.select({ id: user.id, name: user.name, email: user.email, isActive: user.isActive })
    .from(user).where(eq(user.email, email)).limit(1);

  if (body.action === "send") {
    // Keep account lookup private; only active local SchoolOS users receive codes.
    if (!localUser?.isActive) return genericSendResponse();
    try {
      await ensureSupabaseIdentityForLocalUser(localUser);
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        return Response.json(
          { error: "The sign-in code could not be sent. Check the Supabase email and SMTP settings, then try again." },
          { status: error.status === 429 ? 429 : 502 },
        );
      }
      return genericSendResponse();
    } catch {
      return Response.json({ error: "Supabase email authentication is not configured correctly." }, { status: 503 });
    }
  }

  if (!localUser?.isActive || typeof body.token !== "string" || !/^\d{6,10}$/.test(body.token)) {
    return invalidCodeResponse();
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: body.token, type: "email" });
    if (error || !data.user) return invalidCodeResponse();

    const [stillActive] = await db.select({ isActive: user.isActive })
      .from(user).where(eq(user.id, localUser.id)).limit(1);
    if (!stillActive?.isActive) {
      await supabase.auth.signOut();
      return invalidCodeResponse();
    }
    return Response.json({ success: true });
  } catch {
    return invalidCodeResponse();
  }
}
