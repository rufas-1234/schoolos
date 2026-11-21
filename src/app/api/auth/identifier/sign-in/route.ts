import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schoolMemberships, schools, user, userLoginIdentifiers } from "@/db/schema";
import { auth } from "@/lib/auth";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import {
  normalizeAdmissionIdentifier,
  normalizePhoneIdentifier,
} from "@/lib/login-identifier-policy";
import { getBoundedRequest, maxApiRequestBodyBytes } from "@/lib/request-body-limit";

const invalidCredentials = () => Response.json(
  { message: "Sign-in failed. Check your credentials or contact your administrator." },
  { status: 401 },
);

export async function POST(request: Request) {
  let submitted: { identifier?: unknown; password?: unknown };
  const bounded = await getBoundedRequest(request, maxApiRequestBodyBytes);
  if (!bounded.ok) return bounded.response;
  try {
    submitted = await bounded.request.json() as { identifier?: unknown; password?: unknown };
  } catch {
    return invalidCredentials();
  }
  if (
    typeof submitted.identifier !== "string" ||
    typeof submitted.password !== "string" ||
    !submitted.identifier.trim() ||
    submitted.identifier.trim().length > 320 ||
    !submitted.password ||
    submitted.password.length > 128
  ) {
    return invalidCredentials();
  }

  const identifier = submitted.identifier.trim();
  let email = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    const candidates = [
      normalizePhoneIdentifier(identifier),
      normalizeAdmissionIdentifier(identifier),
    ].filter(Boolean);
    if (!candidates.length) return invalidCredentials();
    const matches = await db.select({
      userId: user.id,
      email: user.email,
    }).from(userLoginIdentifiers)
      .innerJoin(user, eq(userLoginIdentifiers.userId, user.id))
      .innerJoin(schoolMemberships, and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.schoolId, userLoginIdentifiers.schoolId),
        eq(schoolMemberships.status, "active"),
      ))
      .innerJoin(schools, and(
        eq(schools.id, userLoginIdentifiers.schoolId),
        eq(schools.status, schoolWorkspaceStatuses.active),
        isNull(schools.archivedAt),
      ))
      .where(and(
        inArray(userLoginIdentifiers.identifier, candidates),
        eq(user.isActive, true),
      ));
    const uniqueMatches = [...new Map(matches.map((match) => [match.userId, match])).values()];
    if (uniqueMatches.length !== 1) return invalidCredentials();
    email = uniqueMatches[0].email;
  }
  const [account] = await db.select({ isActive: user.isActive })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!account?.isActive) return invalidCredentials();

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/json");
  const authRequest = new Request(new URL("/api/auth/sign-in/email", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: submitted.password }),
  });
  return auth.handler(authRequest);
}
