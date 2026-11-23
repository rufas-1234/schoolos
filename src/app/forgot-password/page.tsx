import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordResetRequestForm } from "@/components/password-reset-request-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  let authenticated = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    authenticated = Boolean(data.user);
  } catch {
    // The request form will show a generic message if Auth is not configured.
  }
  if (authenticated) redirect("/select-school");

  return (
    <main className="auth-entry-page flex min-h-dvh items-center justify-center bg-[#f7f7fa] px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <Link href="/login" className="text-sm font-semibold text-violet-700">SchoolOS</Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Reset your password</h1>
        <PasswordResetRequestForm />
      </section>
    </main>
  );
}
