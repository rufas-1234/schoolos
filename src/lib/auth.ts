import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppAuthUser = { id: string; email: string; name: string; image: string | null };

async function getAppAuthUser(): Promise<AppAuthUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (error || !authUser?.email) return null;
    const localUserId = typeof authUser.app_metadata?.schoolos_user_id === "string"
      ? authUser.app_metadata.schoolos_user_id
      : null;
    const [localUser] = await db.select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    }).from(user).where(localUserId ? eq(user.id, localUserId) : eq(user.email, authUser.email.toLowerCase())).limit(1);
    if (!localUser) return null;
    return localUser;
  } catch {
    return null;
  }
}

// Keep the existing app-facing session API stable while Supabase owns the session.
export const auth = {
  api: {
    async getSession(_input?: { headers?: Headers }) {
      const signedInUser = await getAppAuthUser();
      return signedInUser ? { user: signedInUser, session: { userId: signedInUser.id } } : null;
    },
  },
};
