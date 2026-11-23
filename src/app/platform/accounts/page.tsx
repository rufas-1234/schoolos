import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { schoolMemberships, schools, user } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { AccountRecoveryForm } from "./account-recovery-form";

export const dynamic = "force-dynamic";

export default async function PlatformAccountsPage() {
  await requirePlatformAdmin();
  const accounts = await db.select({
    userId: user.id,
    name: user.name,
    email: user.email,
    schoolName: schools.name,
    schoolPublicId: schools.publicId,
    membershipStatus: schoolMemberships.status,
  }).from(schoolMemberships)
    .innerJoin(user, eq(user.id, schoolMemberships.userId))
    .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
    .orderBy(asc(user.name), asc(schools.name));

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/platform/schools" className="text-sm font-semibold text-violet-700">← School workspaces</Link>
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Account recovery</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Correct a school member&apos;s login email, set a temporary password that must be changed before workspace access, or issue an expiring one-time setup link. Changes apply across linked schools, revoke existing sessions, and are audited; no recovery email is sent.
            </p>
            <Link href="/guide" className="mt-3 inline-block text-sm font-semibold text-violet-700 underline underline-offset-4 hover:text-violet-900">
              Open the SchoolOS user guide
            </Link>
          </div>
        </header>

        <AdminDataTable
          title="School accounts"
          columns={[
            { key: "member", label: "Account" },
            { key: "school", label: "School" },
            { key: "status", label: "Membership" },
          ]}
          rows={accounts.map((account) => ({
            id: `${account.userId}-${account.schoolPublicId}`,
            searchableText: `${account.name} ${account.email} ${account.schoolName} ${account.schoolPublicId}`,
            values: {
              member: `${account.name} · ${account.email}`,
              school: account.schoolName,
              status: account.membershipStatus,
            },
            actions: (
              <AccountRecoveryForm
                userId={account.userId}
                name={account.name}
                email={account.email}
              />
            ),
          }))}
          emptyMessage="No school accounts are available to manage."
          mobileCardView
          showRowNumber={false}
        />
      </div>
    </main>
  );
}
