import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { account, schoolMemberships, schools, user, userLoginIdentifiers } from "@/db/schema";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import {
  normalizeAdmissionIdentifier,
  normalizePhoneIdentifier,
} from "@/lib/login-identifier-policy";
import { getBoundedRequest, maxApiRequestBodyBytes } from "@/lib/request-body-limit";
import { verifyPassword } from "better-auth/crypto";
import { createClient } from "@supabase/supabase-js";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

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
  const [localAccount] = await db.select({
    id: user.id,
    name: user.name,
    isActive: user.isActive,
  })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!localAccount?.isActive) return invalidCredentials();
  if (!getSupabasePublicConfig()) {
    return Response.json({ message: "Supabase Auth is not configured for this application." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.auth.signInWithPassword({ email, password: submitted.password });

  // Existing accounts still have their legacy Better Auth hash in TiDB. Verify it
  // once, then establish the matching Supabase Auth account for subsequent logins.
  if (error) {
    const [credential] = await db.select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, localAccount.id), eq(account.providerId, "credential")))
      .limit(1);
    const matchesLegacyPassword = Boolean(credential?.password) && await verifyPassword({
      hash: credential!.password!,
      password: submitted.password,
    });

    try {
      const admin = createSupabaseAdminClient();
      let page = 1;
      let existingAuthUser: SupabaseUser | undefined;
      while (!existingAuthUser) {
        const { data: users, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) return invalidCredentials();
        existingAuthUser = users.users.find((candidate) =>
          candidate.app_metadata?.schoolos_user_id === localAccount.id || candidate.email?.toLowerCase() === email,
        );
        if (existingAuthUser || users.users.length < 1000) break;
        page += 1;
      }

      if (matchesLegacyPassword) {
        if (existingAuthUser) {
          const updated = await admin.auth.admin.updateUserById(existingAuthUser.id, {
            email,
            email_confirm: true,
            password: submitted.password,
            app_metadata: { ...existingAuthUser.app_metadata, schoolos_user_id: localAccount.id },
            user_metadata: { ...existingAuthUser.user_metadata, name: localAccount.name },
          });
          if (updated.error) return invalidCredentials();
        } else {
          const created = await admin.auth.admin.createUser({
            email,
            password: submitted.password,
            email_confirm: true,
            app_metadata: { schoolos_user_id: localAccount.id },
            user_metadata: { name: localAccount.name },
          });
          if (created.error) return invalidCredentials();
        }
      } else if (!credential?.password && existingAuthUser?.email && existingAuthUser.email.toLowerCase() !== email) {
        // Email addresses can be changed in the local account directory. If the
        // local legacy hash is already cleared, prove the existing Supabase
        // password before syncing that trusted directory change to Supabase.
        const config = getSupabasePublicConfig();
        if (!config) return invalidCredentials();
        const verifier = createClient(config.url, config.key, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const verified = await verifier.auth.signInWithPassword({
          email: existingAuthUser.email,
          password: submitted.password,
        });
        if (verified.error) return invalidCredentials();
        const updated = await admin.auth.admin.updateUserById(existingAuthUser.id, {
          email,
          email_confirm: true,
        });
        if (updated.error) return invalidCredentials();
      } else {
        return invalidCredentials();
      }
    } catch {
      return Response.json({ message: "Supabase Auth is not configured for this application." }, { status: 503 });
    }

    ({ error } = await supabase.auth.signInWithPassword({ email, password: submitted.password }));
  }
  if (error) return invalidCredentials();
  await db.update(account).set({ password: null })
    .where(and(eq(account.userId, localAccount.id), eq(account.providerId, "credential")));
  return Response.json({ success: true });
}
