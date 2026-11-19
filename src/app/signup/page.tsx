import Link from "next/link";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { isMultiSchoolEnabled } from "@/lib/school-context-policy";
import { SchoolSignupForm } from "./school-signup-form";

export default function SignupPage() {
  const enabled = isMultiSchoolEnabled() && Boolean(process.env.DATABASE_URL?.trim());

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f7fa] px-3 py-8 sm:px-4 sm:py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-[0_24px_80px_-34px_rgba(54,34,84,0.28)] md:grid-cols-[0.85fr_1.15fr]">
        <section className="relative hidden min-h-[680px] flex-col justify-between overflow-hidden bg-violet-800 p-10 text-white md:flex">
          <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <GraduationCap size={27} />
            </span>
            <span className="text-lg font-bold tracking-tight">SchoolOS</span>
          </div>
          <div className="relative max-w-md">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-violet-200">One connected school</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Bring your school team together.</h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-violet-100/80">
              Create a secure workspace for your school&apos;s administration, academics, and community.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-sm text-violet-100/80">
            <ShieldCheck size={17} />
            Your school workspace is isolated from other schools
          </div>
        </section>

        <section className="px-5 py-8 sm:px-10 sm:py-10">
          <div className="mb-6 flex items-center justify-between gap-4 md:hidden">
            <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <GraduationCap size={24} className="text-violet-700" />
              SchoolOS
            </span>
            <Link href="/login" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Sign in</Link>
          </div>
          <p className="text-sm font-semibold text-violet-700">Get started</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Create your school workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your administrator account will own the new school workspace.
          </p>

          {!enabled ? (
            <div role="alert" className="mt-7 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              School signup is currently unavailable. Please contact SchoolOS support.
            </div>
          ) : (
            <SchoolSignupForm />
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account? <Link href="/login" className="font-semibold text-violet-700 hover:text-violet-900">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
