import Link from "next/link";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeft, KeyRound, Users } from "lucide-react";
import { db } from "@/db";
import { schoolMemberships, schools, user, userLoginIdentifiers } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { AccountRecoveryForm } from "./account-recovery-form";
import { PlatformAutoFilters } from "../platform-auto-filters";

export const dynamic = "force-dynamic";
type SearchParams = { search?: string | string[]; status?: string | string[]; workspace?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function PlatformAccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const search = first(params.search).trim().slice(0, 100);
  const selectedStatus = first(params.status) || "all";
  const selectedWorkspace = first(params.workspace) || "all";
  const [accounts, loginIdentifiers] = await Promise.all([db.select({
    userId: user.id,
    name: user.name,
    email: user.email,
    schoolName: schools.name,
    schoolPublicId: schools.publicId,
    membershipStatus: schoolMemberships.status,
  }).from(schoolMemberships)
    .innerJoin(user, eq(user.id, schoolMemberships.userId))
    .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
    .where(isNull(schools.deletedAt))
    .orderBy(asc(user.name), asc(schools.name)),
  db.select({
    id: userLoginIdentifiers.id,
    userId: userLoginIdentifiers.userId,
    kind: userLoginIdentifiers.kind,
    identifier: userLoginIdentifiers.identifier,
  }).from(userLoginIdentifiers).where(inArray(userLoginIdentifiers.kind, ["student_admission", "staff_employee_code"]))]);
  const standardIdentifiersByUser = new Map<string, typeof loginIdentifiers>();
  for (const identifier of loginIdentifiers) {
    const existing = standardIdentifiersByUser.get(identifier.userId) ?? [];
    if (!existing.some((item) => item.kind === identifier.kind && item.identifier === identifier.identifier)) {
      existing.push(identifier);
      standardIdentifiersByUser.set(identifier.userId, existing);
    }
  }
  const workspaceOptions = [...new Map(accounts.map((account) => [account.schoolPublicId, account.schoolName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const statuses = [...new Set(accounts.map((account) => account.membershipStatus))].sort();
  const activeCount = accounts.filter((account) => account.membershipStatus === "active").length;
  const visibleAccounts = accounts.filter((account) =>
    (selectedWorkspace === "all" || account.schoolPublicId === selectedWorkspace)
    && (selectedStatus === "all" || account.membershipStatus === selectedStatus)
    && (!search || `${account.name} ${account.email} ${account.schoolName} ${account.schoolPublicId} ${(standardIdentifiersByUser.get(account.userId) ?? []).map((identifier) => identifier.identifier).join(" ")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/platform/schools" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900"><ArrowLeft size={16}/> School workspaces</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Account recovery</h1><p className="mt-3 text-sm leading-6 text-slate-600">Find a staff or student account by name, email, admission number, or staff number. Update login access and issue recovery credentials from the account card.</p></div>
          <Link href="/guide" className="text-sm font-semibold text-violet-700 underline underline-offset-4 hover:text-violet-900">Open user guide</Link>
        </div>
      </header>

      <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-2">
        <Link href="/platform/accounts" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">Member accounts</p><p className="mt-2 text-3xl font-bold">{accounts.length}</p><p className="mt-1 text-xs text-slate-500">Across active and archived workspaces</p></div><Users className="text-violet-700"/></div></Link>
        <Link href="/platform/accounts?status=active" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">Active memberships</p><p className="mt-2 text-3xl font-bold">{activeCount}</p><p className="mt-1 text-xs text-slate-500">Click to narrow the account list</p></div><KeyRound className="text-emerald-700"/></div></Link>
      </section>

      <section id="account-list" className="space-y-4">
        <div><h2 className="text-xl font-bold">School accounts</h2><p className="mt-1 text-sm text-slate-500">Showing {visibleAccounts.length} of {accounts.length} account memberships.</p></div>
        <PlatformAutoFilters action="/platform/accounts#account-list" search={search} searchPlaceholder="Name, email, admission or staff number" selects={[
          { name: "workspace", label: "Workspace", value: selectedWorkspace, options: [{ value: "all", label: "All workspaces" }, ...workspaceOptions.map(([value, label]) => ({ value, label }))] },
          { name: "status", label: "Membership", value: selectedStatus, options: [{ value: "all", label: "All memberships" }, ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase()) }))] },
        ]}/>
        {visibleAccounts.length ? <div className="grid gap-4 lg:grid-cols-2">{visibleAccounts.map((account) => {
          const identifiers = standardIdentifiersByUser.get(account.userId) ?? [];
          const statusTone = account.membershipStatus === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
          const workspaceHref = `/platform/schools?search=${encodeURIComponent(account.schoolName)}#${account.schoolPublicId}`;
          return <article key={`${account.userId}-${account.schoolPublicId}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-bold text-slate-900">{account.name}</h3><p className="mt-1 break-all text-sm text-slate-600">{account.email}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone}`}>{account.membershipStatus.replaceAll("_", " ")}</span></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace</p><Link href={workspaceHref} className="mt-1 inline-flex max-w-full items-center break-words font-semibold text-violet-700 underline decoration-violet-200 underline-offset-4 hover:text-violet-900">{account.schoolName}</Link><p className="mt-1 break-all text-xs text-slate-500">ID: {account.schoolPublicId}</p></div>
            <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Login numbers</p>{identifiers.length ? <div className="mt-2 flex flex-wrap gap-2">{identifiers.map((identifier) => <span key={`${identifier.kind}-${identifier.identifier}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"><span className="text-xs text-slate-500">{identifier.kind === "student_admission" ? "Admission" : "Staff"}: </span>{identifier.identifier}</span>)}</div> : <p className="mt-1 text-sm text-slate-500">No admission or staff number recorded.</p>}</div>
            <details className="mt-5 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-sm font-semibold text-violet-700">Manage account recovery</summary><div className="mt-4 min-w-0"><AccountRecoveryForm userId={account.userId} name={account.name} email={account.email} standardIdentifiers={identifiers}/></div></details>
          </article>;
        })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Users className="mx-auto text-slate-400"/><h3 className="mt-3 font-semibold">No accounts match these filters</h3><p className="mt-1 text-sm text-slate-500">Try another search or workspace.</p><Link href="/platform/accounts" className="mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Clear filters</Link></div>}
      </section>
    </div>
  </main>;
}
