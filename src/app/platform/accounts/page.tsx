import Link from "next/link";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeft, KeyRound, Users } from "lucide-react";
import { db } from "@/db";
import { schoolMemberships, schools, user, userLoginIdentifiers } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { AccountRecoveryForm } from "./account-recovery-form";
import { PlatformAutoFilters } from "../platform-auto-filters";
import { TablePagination } from "@/components/table-pagination";
import { parsePageSize } from "@/components/pagination-utils";

export const dynamic = "force-dynamic";
type SearchParams = { search?: string | string[]; status?: string | string[]; workspace?: string | string[]; page?: string | string[]; pageSize?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function PlatformAccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const search = first(params.search).trim().slice(0, 100);
  const selectedStatus = first(params.status) || "all";
  const selectedWorkspace = first(params.workspace) || "all";
  const pageSize = parsePageSize(params.pageSize);
  const requestedPage = Math.max(1, Math.floor(Number(first(params.page)) || 1));
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
  const pageCount = Math.max(1, Math.ceil(visibleAccounts.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const pageAccounts = visibleAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const searchSuggestions = [...new Set(accounts.flatMap((account) => [account.name, account.email, account.schoolName, ...(standardIdentifiersByUser.get(account.userId) ?? []).map((identifier) => identifier.identifier)]).filter(Boolean))];
  const hasLongDetails = pageAccounts.some((account) => account.name.length > 24 || account.email.length > 36 || (standardIdentifiersByUser.get(account.userId) ?? []).some((identifier) => identifier.identifier.length > 18));
  function hrefForPage(page: number) {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (selectedStatus !== "all") query.set("status", selectedStatus);
    if (selectedWorkspace !== "all") query.set("workspace", selectedWorkspace);
    query.set("page", String(page));
    query.set("pageSize", String(pageSize));
    return `/platform/accounts?${query.toString()}#account-list`;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/platform/schools" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900"><ArrowLeft size={16}/> School workspaces</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Account recovery</h1><p className="mt-3 text-sm leading-6 text-slate-600">Find a staff or student account by name, email, admission number, or staff number. Update login access and issue recovery credentials from the account card.</p></div>
          <Link href="/platform/guide" className="text-sm font-semibold text-violet-700 underline underline-offset-4 hover:text-violet-900">Open user guide</Link>
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
          { name: "status", label: "Membership", value: selectedStatus, options: [{ value: "all", label: "All memberships" }, ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }))] },
        ]} suggestions={searchSuggestions}/>
        {visibleAccounts.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className={`w-full border-collapse text-left ${hasLongDetails ? "min-w-[900px]" : "min-w-full"}`}>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Login numbers</th><th className="px-4 py-3">Membership</th><th className="px-4 py-3 text-right">Recovery</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{pageAccounts.map((account) => {
          const identifiers = standardIdentifiersByUser.get(account.userId) ?? [];
          const statusTone = account.membershipStatus === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
          const workspaceHref = `/platform/schools?search=${encodeURIComponent(account.schoolName)}#${account.schoolPublicId}`;
          return <tr key={`${account.userId}-${account.schoolPublicId}`} className="align-top hover:bg-slate-50/70">
            <td className="max-w-[22rem] px-4 py-3"><p className="font-semibold text-slate-900">{account.name}</p><p className="mt-1 break-all text-sm text-slate-600">{account.email}</p></td>
            <td className="max-w-[16rem] px-4 py-3"><Link href={workspaceHref} title={account.schoolName} className="font-medium text-violet-700 underline decoration-violet-200 underline-offset-4 hover:text-violet-900">{account.schoolName}</Link><p className="mt-1 break-all text-xs text-slate-500">{account.schoolPublicId}</p></td>
            <td className="px-4 py-3">{identifiers.length ? <div className="max-w-[20rem] overflow-x-auto whitespace-nowrap" aria-label="Scrollable login identifiers">{identifiers.map((identifier) => <span key={`${identifier.kind}-${identifier.identifier}`} title={identifier.identifier} className="mr-2 inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"><span className="mr-1 text-xs text-slate-500">{identifier.kind === "student_admission" ? "Admission" : "Staff"}:</span>{identifier.identifier}</span>)}</div> : <span className="text-sm text-slate-500">No number</span>}</td>
            <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone}`}>{account.membershipStatus.replaceAll("_", " ")}</span></td>
            <td className="px-4 py-3 text-right"><details className="inline-block text-left"><summary className="cursor-pointer whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">Manage</summary><div className="absolute right-4 z-10 mt-2 w-[min(24rem,90vw)] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"><AccountRecoveryForm userId={account.userId} name={account.name} email={account.email} standardIdentifiers={identifiers}/></div></details></td>
          </tr>;
        })}</tbody>
        </table><TablePagination ariaLabel="Account recovery members" currentPage={currentPage} pageSize={pageSize} totalRows={visibleAccounts.length} hrefForPage={hrefForPage}/></div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Users className="mx-auto text-slate-400"/><h3 className="mt-3 font-semibold">No accounts match these filters</h3><p className="mt-1 text-sm text-slate-500">Try another search or workspace.</p><Link href="/platform/accounts" className="mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Clear filters</Link></div>}
      </section>
    </div>
  </main>;
}
