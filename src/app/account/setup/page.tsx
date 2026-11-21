import { AccountSetupForm } from "./account-setup-form";

export const metadata = {
  title: "Set up your SchoolOS password",
  robots: { index: false, follow: false },
};

export default function AccountSetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Set up your password</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose a password for your SchoolOS account. Your sign-in access will be enabled after setup.
          </p>
        </div>
        <AccountSetupForm />
      </section>
    </main>
  );
}
