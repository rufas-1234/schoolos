import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function findSupabaseUser(localUserId: string, email: string): Promise<SupabaseUser | null> {
  const admin = createSupabaseAdminClient();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((candidate) =>
      candidate.app_metadata?.schoolos_user_id === localUserId || candidate.email?.toLowerCase() === email,
    );
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

export async function ensureSupabaseIdentityForLocalUser(input: {
  id: string;
  email: string;
  name: string;
}) {
  const admin = createSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  let existing = await findSupabaseUser(input.id, email);

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { schoolos_user_id: input.id },
      user_metadata: { name: input.name },
    });
    if (!error && data.user) return data.user;
    // A duplicate can race another OTP or Google sign-in request. Look up and
    // link that existing identity before deciding the operation failed.
    existing = await findSupabaseUser(input.id, email);
    if (!existing) throw error ?? new Error("Supabase Auth user could not be created.");
  }

  const emailChanged = existing.email?.toLowerCase() !== email;
  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    ...(emailChanged ? { email, email_confirm: false } : {}),
    app_metadata: { ...existing.app_metadata, schoolos_user_id: input.id },
    user_metadata: { ...existing.user_metadata, name: input.name },
  });
  if (error || !data.user) throw error ?? new Error("Supabase Auth user could not be updated.");
  return data.user;
}
