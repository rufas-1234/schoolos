"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const authClient = {
  async signOut() {
    const { error } = await createSupabaseBrowserClient().auth.signOut();
    return { error };
  },
};
