import { GraduationCap, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const configured = Boolean(process.env.DATABASE_URL);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7fa] px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-[0_24px_80px_-34px_rgba(54,34,84,0.28)] md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-violet-800 p-10 text-white md:flex">
          <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border-[1px] border-white/10" />
          <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full border-[1px] border-white/10" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <GraduationCap size={27} />
            </span>
            <span className="text-lg font-bold tracking-tight">SchoolOS</span>
          </div>
          <div className="relative max-w-md">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-violet-200">
              One connected school
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              A clearer view of your school day.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-violet-100/80">
              A secure foundation for school administration, academics, and the people who make it work.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-sm text-violet-100/80">
            <ShieldCheck size={17} />
            Secure access for your school team
          </div>
        </section>

        <section className="flex min-h-[620px] flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-700 text-white">
              <GraduationCap size={24} />
            </span>
            <span className="text-lg font-bold text-slate-900">SchoolOS</span>
          </div>
          <p className="text-sm font-semibold text-violet-700">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sign in to your account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use the administrator account configured for your school.
          </p>

          {!configured && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Database setup is required before sign-in. Follow the local setup instructions in the
              project&apos;s README.md.
            </div>
          )}

          <Suspense fallback={<div className="mt-8 h-56 animate-pulse rounded-xl bg-slate-50" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-8 text-center text-xs leading-5 text-slate-400">
            Access is provisioned by your school administrator.
            <br />
            New accounts cannot be created from this page.
          </p>
        </section>
      </div>
    </main>
  );
}
