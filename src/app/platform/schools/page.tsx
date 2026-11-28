import { asc, count, countDistinct, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, Building2, Check, Clock3, GraduationCap, Plus, Users, Trash2 } from "lucide-react";
import { db } from "@/db";
import { academicYears, classLevels, schoolBranches, schoolSubscriptions, schools, staffMembers, studentEnrollments, subscriptionPlans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { getSchoolDisplayStatus } from "@/lib/school-lifecycle-policy";
import { CreateSchoolForm } from "./create-school-form";
import { SchoolManagementControls } from "./school-management-controls";
import { PlatformAutoFilters } from "../platform-auto-filters";

export const dynamic = "force-dynamic";

type SearchParams = { search?: string | string[]; status?: string | string[]; type?: string | string[]; onboarding?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const numberMap = (rows: Array<{ schoolId: number; total: number | string | null }>) => new Map(rows.map((row) => [row.schoolId, Number(row.total ?? 0)]));

function Metric({ label, value, detail, icon: Icon, tone, href }: { label: string; value: number; detail: string; icon: typeof Building2; tone: string; href: string }) {
  return <Link href={href} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon size={20}/></span></div></Link>;
}

export default async function PlatformSchoolsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const search = first(params.search).trim().slice(0, 100);
  const selectedStatus = first(params.status) || "all";
  const selectedType = first(params.type) || "all";
  const onboardingOnly = first(params.onboarding) === "1";
  const [schoolList, branches, years, classes, students, staff, subscriptions] = await Promise.all([
    db.select({ id: schools.id, name: schools.name, email: schools.email, phone: schools.phone, address: schools.address, publicId: schools.publicId, createdAt: schools.createdAt, status: schools.status, archivedAt: schools.archivedAt, deletedAt: schools.deletedAt, isPracticeWorkspace: schools.isPracticeWorkspace })
      .from(schools).orderBy(asc(schools.name), asc(schools.id)),
    db.select({ schoolId: schoolBranches.schoolId, total: count() }).from(schoolBranches).groupBy(schoolBranches.schoolId),
    db.select({ schoolId: academicYears.schoolId, total: count() }).from(academicYears).groupBy(academicYears.schoolId),
    db.select({ schoolId: classLevels.schoolId, total: count() }).from(classLevels).groupBy(classLevels.schoolId),
    db.select({ schoolId: studentEnrollments.schoolId, total: countDistinct(studentEnrollments.studentId) }).from(studentEnrollments).where(eq(studentEnrollments.status, "enrolled")).groupBy(studentEnrollments.schoolId),
    db.select({ schoolId: staffMembers.schoolId, total: count() }).from(staffMembers).where(eq(staffMembers.status, "active")).groupBy(staffMembers.schoolId),
    db.select({ schoolId: schoolSubscriptions.schoolId, status: schoolSubscriptions.status, trialEndsAt: schoolSubscriptions.trialEndsAt, plan: subscriptionPlans.name }).from(schoolSubscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId)),
  ]);
  const branchCount = numberMap(branches);
  const yearCount = numberMap(years);
  const classCount = numberMap(classes);
  const studentCount = numberMap(students);
  const staffCount = numberMap(staff);
  const subscriptionBySchool = new Map(subscriptions.map((subscription) => [subscription.schoolId, subscription]));
  const workspaceRecords = schoolList.map((school) => {
    const steps = [
      { label: "Contact details", done: Boolean(school.email || school.phone) },
      { label: "Branch", done: (branchCount.get(school.id) ?? 0) > 0 },
      { label: "Academic year", done: (yearCount.get(school.id) ?? 0) > 0 },
      { label: "Classes", done: (classCount.get(school.id) ?? 0) > 0 },
      { label: "Students", done: (studentCount.get(school.id) ?? 0) > 0 },
      { label: "Staff", done: (staffCount.get(school.id) ?? 0) > 0 },
    ];
    const completed = steps.filter((step) => step.done).length;
    const displayStatus = getSchoolDisplayStatus(school.status, school.archivedAt, school.deletedAt);
    const haystack = `${school.name} ${school.email ?? ""} ${school.phone ?? ""} ${school.address ?? ""} ${school.publicId} ${displayStatus} ${school.isPracticeWorkspace ? "practice" : "live school"}`.toLocaleLowerCase();
    const matchesStatus = selectedStatus === "deleted" ? Boolean(school.deletedAt) : selectedStatus === "all" ? !school.deletedAt : selectedStatus === "archived" ? Boolean(school.archivedAt) && !school.deletedAt : !school.archivedAt && school.status === selectedStatus;
    const matchesType = selectedType === "all" || (selectedType === "practice" ? school.isPracticeWorkspace : !school.isPracticeWorkspace);
    return { ...school, steps, completed, displayStatus, haystack, matchesStatus, matchesType, subscription: subscriptionBySchool.get(school.id) };
  });
  const orderedWorkspaces = [...workspaceRecords].sort((a, b) => {
    const pendingOrder = Number(b.status === "pending" && !b.archivedAt && !b.deletedAt) - Number(a.status === "pending" && !a.archivedAt && !a.deletedAt);
    return pendingOrder || a.name.localeCompare(b.name);
  });
  const visibleWorkspaces = orderedWorkspaces.filter((school) => school.matchesStatus && school.matchesType && (!onboardingOnly || school.completed < school.steps.length) && (!search || school.haystack.includes(search.toLocaleLowerCase())));
  const pendingCount = schoolList.filter((school) => school.status === "pending" && !school.archivedAt && !school.deletedAt).length;
  const activeCount = schoolList.filter((school) => school.status === "active" && !school.archivedAt && !school.deletedAt && !school.isPracticeWorkspace).length;
  const practiceCount = schoolList.filter((school) => school.isPracticeWorkspace && !school.archivedAt && !school.deletedAt).length;
  const deletedCount = schoolList.filter((school) => school.deletedAt).length;
  const onboardingCount = workspaceRecords.filter((school) => school.status === "active" && !school.archivedAt && !school.deletedAt && !school.isPracticeWorkspace && school.completed < school.steps.length).length;

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">School workspaces</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review new applications, follow each school’s setup progress, and manage workspace access.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/platform/accounts" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Account recovery</Link><CreateSchoolForm/></div>
      </header>

      <section aria-label="Workspace summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="All workspaces" value={schoolList.length - deletedCount} detail="Open active and archived records" icon={Building2} tone="bg-violet-50 text-violet-700" href="/platform/schools?status=all#workspace-list"/>
        <Metric label="Awaiting review" value={pendingCount} detail="Approval starts the trial" icon={Clock3} tone="bg-amber-50 text-amber-700" href="/platform/schools?status=pending#workspace-list"/>
        <Metric label="Active schools" value={activeCount} detail="Approved live workspaces" icon={GraduationCap} tone="bg-emerald-50 text-emerald-700" href="/platform/schools?status=active#workspace-list"/>
        <Metric label="Still onboarding" value={onboardingCount} detail={`${practiceCount} practice workspaces available`} icon={Users} tone="bg-sky-50 text-sky-700" href="/platform/schools?onboarding=1#workspace-list"/>
        <Metric label="Deleted" value={deletedCount} detail="Recoverable workspaces" icon={Trash2} tone="bg-rose-50 text-rose-700" href="/platform/schools?status=deleted#workspace-list"/>
      </section>

      {pendingCount > 0 && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div><p className="font-semibold text-amber-950">{pendingCount} {pendingCount === 1 ? "application needs" : "applications need"} review</p><p className="mt-1 text-sm text-amber-900">Approve to activate the workspace and start its trial, or reject the application.</p></div><Link href="/platform/schools?status=pending#workspace-list" className="inline-flex items-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-950">Review applications<ArrowRight size={16}/></Link></section>}

      <section id="workspace-list" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Workspace directory</h2><p className="mt-1 text-sm text-slate-500">{visibleWorkspaces.length} of {selectedStatus === "deleted" ? deletedCount : schoolList.length - deletedCount} workspaces</p></div><Link href="/platform/guide" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Platform guide</Link></div>
        <PlatformAutoFilters action="/platform/schools#workspace-list" search={search} searchPlaceholder="School, contact, or workspace ID" selects={[{name:"status",label:"Workspace status",value:selectedStatus,options:[{value:"all",label:"All active workspaces"},{value:"pending",label:"Pending review"},{value:"active",label:"Approved"},{value:"rejected",label:"Rejected"},{value:"archived",label:"Archived"},{value:"deleted",label:"Deleted"}]},{name:"type",label:"Workspace type",value:selectedType,options:[{value:"all",label:"All types"},{value:"school",label:"Live schools"},{value:"practice",label:"Practice"}]}]} />

        {visibleWorkspaces.length ? <div className="grid min-w-0 gap-4 xl:grid-cols-2">{visibleWorkspaces.map((school) => {
          const progress = Math.round((school.completed / school.steps.length) * 100);
          const archived = school.archivedAt !== null;
          const deleted = school.deletedAt !== null;
          const statusTone = archived ? "bg-slate-100 text-slate-700" : school.status === "pending" ? "bg-amber-100 text-amber-900" : school.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800";
          return <article id={school.publicId} key={school.publicId} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Building2 size={21}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-lg font-bold text-slate-900">{school.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}>{school.displayStatus}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{school.isPracticeWorkspace ? "Practice" : "Live school"}</span></div><p className="mt-1 break-all text-xs text-slate-500">Workspace ID: {school.publicId}</p></div></div>
            {school.status === "pending" && !archived && !deleted && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-sm font-semibold text-amber-950">Application awaiting approval</p><p className="mt-1 text-xs leading-5 text-amber-900">Approving activates this workspace and starts its free trial.</p></div>}
            <div className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><p className="min-w-0 break-words"><span className="font-semibold text-slate-800">Email:</span> {school.email || "Not provided"}</p><p><span className="font-semibold text-slate-800">Phone:</span> {school.phone || "Not provided"}</p><p><span className="font-semibold text-slate-800">Created:</span> {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(school.createdAt)}</p><p className="min-w-0 break-words"><span className="font-semibold text-slate-800">Subscription:</span> {school.subscription ? `${school.subscription.plan} · ${school.subscription.status.replaceAll("_", " ")}` : "No plan assigned"}</p></div>
            <section className="mt-5 rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-slate-900">Onboarding progress</h4><p className="mt-0.5 text-xs text-slate-500">{school.completed} of {school.steps.length} setup steps</p></div><span className="text-lg font-bold text-violet-800">{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }}/></div><div className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">{school.steps.map((step) => <p key={step.label} className={`flex min-w-0 items-center gap-2 text-xs ${step.done ? "text-slate-700" : "text-slate-400"}`}>{step.done ? <Check size={14} className="shrink-0 text-emerald-600"/> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300"/>}<span className="truncate">{step.label}</span></p>)}</div></section>
            <div className="mt-5 border-t border-slate-100 pt-4"><SchoolManagementControls schoolPublicId={school.publicId} name={school.name} email={school.email} phone={school.phone} address={school.address} status={school.status} archived={archived} deleted={deleted}/></div>
          </article>;
        })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Plus size={22}/></div><h3 className="mt-4 font-semibold text-slate-900">No workspaces match those filters</h3><p className="mt-1 text-sm text-slate-500">Clear a filter or search for a different school.</p><Link href="/platform/schools" className="mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Clear filters</Link></div>}
      </section>
    </div>
  </main>;
}
