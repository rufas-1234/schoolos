import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FirstLoginPasswordForm } from "@/components/first-login-password-form";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FirstLoginPasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [account] = await db.select({
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    name: user.name,
  }).from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!account?.isActive) redirect("/login?reason=account-disabled");
  if (!account.mustChangePassword) redirect("/account/security");

  return (
    <main className="auth-entry-page flex min-h-dvh items-center justify-center bg-[#f7f7fa] px-4 py-8">
      <section className="w-full max-w-lg space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">SchoolOS · First sign-in</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Welcome, {account.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            For your account’s security, choose a personal password to continue.
          </p>
        </header>
        <FirstLoginPasswordForm />
      </section>
    </main>
  );
}
