import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import { createSupabaseServerClient } from "./server";

export async function changeSupabasePassword(currentPassword: string, newPassword: string) {
  const config = getSupabasePublicConfig();
  if (!config) return false;
  const verificationClient = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user?.email || userError) return false;

  const { error: passwordError } = await verificationClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (passwordError) return false;

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return !error;
}

export async function verifySupabasePassword(email: string, password: string) {
  const config = getSupabasePublicConfig();
  if (!config) return false;
  const client = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
