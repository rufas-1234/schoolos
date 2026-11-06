import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7fa] px-5">
      <section className="max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Access not available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your account does not have permission to open this page. Contact your school administrator if you
          believe this is a mistake.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white"
        >
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
