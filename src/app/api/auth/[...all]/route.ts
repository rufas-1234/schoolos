import { toNextJsHandler } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getBoundedRequest, maxApiRequestBodyBytes } from "@/lib/request-body-limit";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const bounded = await getBoundedRequest(request, maxApiRequestBodyBytes);
  if (!bounded.ok) return bounded.response;

  if (new URL(request.url).pathname.endsWith("/sign-in/email")) {
    let submitted: unknown;
    try {
      submitted = await bounded.request.clone().json();
    } catch {
      submitted = null;
    }
    if (
      typeof submitted === "object" &&
      submitted !== null &&
      "email" in submitted &&
      typeof submitted.email === "string"
    ) {
      const [account] = await db.select({ isActive: user.isActive })
        .from(user)
        .where(eq(user.email, submitted.email.trim().toLowerCase()))
        .limit(1);
      if (account && !account.isActive) {
        return Response.json(
          { message: "Sign-in failed. Check your credentials or contact your administrator." },
          { status: 401 },
        );
      }
    }
  }

  return handlers.POST(bounded.request);
}
