import { KeyRound } from "lucide-react";
import { AccountPasswordForm } from "@/components/account-password-form";

export function AccountSecurityContent({ schoolName }: { schoolName: string }) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <KeyRound size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{schoolName}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Account security</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Update the password you use to sign in to SchoolOS.</p>
          </div>
        </div>
      </header>
      <AccountPasswordForm />
    </main>
  );
}
