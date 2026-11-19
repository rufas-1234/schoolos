import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserSchoolMemberships } from "@/lib/access-control";
import { activeSchoolCookieName, isMultiSchoolEnabled, resolveSchoolChoice } from "@/lib/school-context-policy";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";
import { getSignedInWorkspacePath } from "@/app/login/actions";
import { selectSchool } from "./actions";

export default async function SelectSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { user, memberships } = await getCurrentUserSchoolMemberships();
  if (!memberships.length) {
    if (isPlatformAdminEmail(user.email) && isMultiSchoolEnabled()) redirect("/platform/schools");
    const { reason } = await searchParams;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12">
        <h1 className="text-2xl font-bold text-slate-900">No school access</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This account does not have an active school membership. Ask a school administrator to grant access.
        </p>
        {reason === "invalid-selection" && <p role="alert" className="mt-4 text-sm text-rose-700">That school is not available to this account.</p>}
      </main>
    );
  }

  const selectedSchoolPublicId = (await cookies()).get(activeSchoolCookieName)?.value;
  const selected = resolveSchoolChoice(
    memberships,
    selectedSchoolPublicId,
    isMultiSchoolEnabled(),
    process.env.DEFAULT_SCHOOL_PUBLIC_ID,
  );
  if (selected) redirect(await getSignedInWorkspacePath());

  const { reason } = await searchParams;
  if (!isMultiSchoolEnabled() && process.env.DEFAULT_SCHOOL_PUBLIC_ID) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12">
        <h1 className="text-2xl font-bold text-slate-900">School access unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This account does not have an active membership in the configured school workspace. Contact the platform administrator.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Choose a school</h1>
      <p className="mt-2 text-sm text-slate-600">Select the school workspace you want to open.</p>
      {reason === "invalid-selection" && <p role="alert" className="mt-4 text-sm text-rose-700">That school is not available to this account.</p>}
      <div className="mt-7 space-y-3">
        {memberships.map((membership) => (
          <form action={selectSchool} key={membership.membershipId}>
            <input type="hidden" name="schoolPublicId" value={membership.schoolPublicId} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            >
              <span>
                <span className="block font-semibold text-slate-900">{membership.schoolName}</span>
                {membership.schoolAddress && <span className="mt-1 block text-sm text-slate-500">{membership.schoolAddress}</span>}
              </span>
              <span aria-hidden="true" className="text-lg text-violet-700">→</span>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
