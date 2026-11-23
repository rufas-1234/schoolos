import { redirect } from "next/navigation";
import { PasswordResetForm } from "@/components/password-reset-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  let hasSession = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    hasSession = Boolean(user);
  } catch {
    hasSession = false;
  }
  if (!hasSession) redirect("/login?reason=reset-link-expired");

  return (
    <main className="auth-entry-page flex min-h-dvh items-center justify-center bg-[#f7f7fa] px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-violet-700">SchoolOS</p>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Set a new password for your SchoolOS account.</p>
        <PasswordResetForm />
      </section>
    </main>
  );
}
