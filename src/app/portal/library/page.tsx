import Link from "next/link";
import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { BookMarked, BookOpenCheck, CircleAlert, LibraryBig } from "lucide-react";
import { ManagementPortalShell } from "@/app/portal/management-portal-shell";
import { LibraryIssueForm, LoanActions, type LibraryBookOption, type LibraryMemberOption } from "@/app/admin/library/library-forms";
import { db } from "@/db";
import { libraryBooks, libraryLoans, libraryMembers, staffMembers, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getDefaultLoanDueDate } from "@/lib/library-policy";

export const dynamic = "force-dynamic";

type SearchParams = { section?: string };

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function LibraryPortalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [context, query] = await Promise.all([
    requireSchoolPermission("library.manage"),
    searchParams,
  ]);
  const section = query.section === "circulation" ? "circulation" : "overview";
  const today = todayDate();
  const dueDate = getDefaultLoanDueDate(today) ?? today;
  const schoolId = context.schoolId;

  const [
    [catalogStats],
    [activeLoanCount],
    [overdueCount],
    [memberCount],
    bookRows,
    studentRows,
    staffRows,
    memberRows,
    loanRows,
  ] = await Promise.all([
    db.select({
      titles: count(),
      copies: sql<number>`coalesce(sum(${libraryBooks.availableCopies}), 0)`,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      eq(libraryBooks.status, "active"),
    )),
    db.select({ value: count() }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      eq(libraryLoans.status, "active"),
    )),
    db.select({ value: count() }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      eq(libraryLoans.status, "active"),
      lt(libraryLoans.dueDate, today),
    )),
    db.select({ value: count() }).from(libraryMembers).where(and(
      eq(libraryMembers.schoolId, schoolId),
      eq(libraryMembers.status, "active"),
    )),
    db.select({ id: libraryBooks.id, title: libraryBooks.title }).from(libraryBooks)
      .where(and(
        eq(libraryBooks.schoolId, schoolId),
        eq(libraryBooks.status, "active"),
        gt(libraryBooks.availableCopies, 0),
      ))
      .orderBy(asc(libraryBooks.title))
      .limit(500),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
    }).from(students).where(and(
      eq(students.schoolId, schoolId),
      inArray(students.status, ["active", "admitted"]),
    )).orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
    }).from(staffMembers).where(and(
      eq(staffMembers.schoolId, schoolId),
      eq(staffMembers.status, "active"),
    )).orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      id: libraryMembers.id,
      studentId: libraryMembers.studentId,
      staffMemberId: libraryMembers.staffMemberId,
      memberType: libraryMembers.memberType,
      memberName: libraryMembers.memberName,
      memberNumber: libraryMembers.memberNumber,
      status: libraryMembers.status,
    }).from(libraryMembers).where(eq(libraryMembers.schoolId, schoolId)),
    db.select({
      id: libraryLoans.id,
      title: libraryBooks.title,
      bookNumber: libraryBooks.bookNumber,
      issuedAt: libraryLoans.issuedAt,
      dueDate: libraryLoans.dueDate,
      studentName: sql<string>`coalesce(concat(${students.firstName}, ' ', ${students.lastName}), concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}), ${libraryMembers.memberName}, 'Unknown member')`,
      memberNumber: libraryMembers.memberNumber,
      memberType: libraryMembers.memberType,
      status: libraryLoans.status,
    }).from(libraryLoans)
      .innerJoin(libraryBooks, and(
        eq(libraryBooks.id, libraryLoans.bookId),
        eq(libraryBooks.schoolId, schoolId),
      ))
      .leftJoin(libraryMembers, and(
        eq(libraryMembers.id, libraryLoans.memberId),
        eq(libraryMembers.schoolId, schoolId),
      ))
      .leftJoin(students, and(
        eq(students.id, libraryLoans.studentId),
        eq(students.schoolId, schoolId),
      ))
      .leftJoin(staffMembers, and(
        eq(staffMembers.id, libraryMembers.staffMemberId),
        eq(staffMembers.schoolId, schoolId),
      ))
      .where(and(
        eq(libraryLoans.schoolId, schoolId),
        eq(libraryLoans.status, "active"),
      ))
      .orderBy(asc(libraryLoans.dueDate))
      .limit(section === "circulation" ? 30 : 6),
  ]);

  const inactiveStudentMemberships = new Set(memberRows
    .filter((member) => member.memberType === "student" && member.status !== "active")
    .map((member) => member.studentId)
    .filter((id): id is number => id !== null));
  const inactiveStaffMemberships = new Set(memberRows
    .filter((member) => member.memberType === "staff" && member.status !== "active")
    .map((member) => member.staffMemberId)
    .filter((id): id is number => id !== null));
  const books: LibraryBookOption[] = bookRows.map((book) => ({ id: book.id, label: book.title }));
  const members: LibraryMemberOption[] = [
    ...studentRows
      .filter((student) => !inactiveStudentMemberships.has(student.id))
      .map((student) => ({
        id: `student:${student.id}`,
        label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""} · Student`,
      })),
    ...staffRows
      .filter((staff) => !inactiveStaffMemberships.has(staff.id))
      .map((staff) => ({
        id: `staff:${staff.id}`,
        label: `${staff.firstName} ${staff.lastName}${staff.employeeCode ? ` · ${staff.employeeCode}` : ""} · Staff`,
      })),
    ...memberRows
      .filter((member) => member.memberType === "other" && member.status === "active")
      .map((member) => ({
        id: `other:${member.id}`,
        label: `${member.memberName ?? "Community member"} · ${member.memberNumber}`,
      })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <ManagementPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalType="library"
    >
      <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-violet-700">Library operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              {section === "circulation" ? "Issue and return books" : "Library overview"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {section === "circulation"
                ? "Check out books and review upcoming or overdue returns."
                : "A quick view of your catalog, members, and lending activity."}
            </p>
          </div>
          <Link href="/admin/library?section=books"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Open full library workspace
          </Link>
        </header>

        <section aria-label="Library summary" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Active titles" value={Number(catalogStats?.titles ?? 0)} icon={<BookOpenCheck size={18} />} />
          <SummaryCard label="Copies available" value={Number(catalogStats?.copies ?? 0)} icon={<LibraryBig size={18} />} />
          <SummaryCard label="Books on loan" value={Number(activeLoanCount?.value ?? 0)} icon={<BookMarked size={18} />} />
          <SummaryCard label="Overdue loans" value={Number(overdueCount?.value ?? 0)} icon={<CircleAlert size={18} />} alert={Number(overdueCount?.value ?? 0) > 0} />
        </section>

        {section === "circulation" && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="font-semibold text-slate-950">Issue a book</h2>
          <p className="mt-1 text-sm text-slate-600">Search active students, staff, and registered community members.</p>
          <div className="mt-5 max-w-3xl">
            <LibraryIssueForm books={books} members={members} dueDate={dueDate} minDate={today} />
          </div>
        </section>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">
                {section === "circulation" ? "Active loan register" : "Due soon and overdue"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {section === "circulation" ? "Return a book when received, or extend its due date." : `${Number(memberCount?.value ?? 0)} active library members`}
              </p>
            </div>
            <Link href="/admin/library?section=issued&status=all"
              className="text-sm font-semibold text-violet-700 hover:text-violet-900">
              View complete loan register
            </Link>
          </div>
          {loanRows.length > 0 ? <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
            {loanRows.map((loan) => {
              const overdue = loan.dueDate < today;
              return <article key={loan.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-slate-900">{loan.title}</h3>
                    <p className="mt-1 break-words text-sm text-slate-600">{loan.studentName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                    {overdue ? "Overdue" : "Due"} · {loan.dueDate}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {loan.memberNumber ? `Member ${loan.memberNumber}` : "Library member"}
                  {loan.bookNumber ? ` · Book ${loan.bookNumber}` : ""}
                  {` · Issued ${loan.issuedAt}`}
                </p>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <LoanActions
                    loanId={loan.id}
                    currentDueDate={loan.dueDate}
                    dueDate={getDefaultLoanDueDate(loan.dueDate) ?? dueDate}
                  />
                </div>
              </article>;
            })}
          </div> : <p className="p-8 text-center text-sm text-slate-500">There are no active book loans.</p>}
        </section>

        <section aria-label="Library workspace shortcuts" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/admin/library?section=books", title: "Manage catalog", description: "Search, sort, add, and update book titles." },
            { href: "/admin/library?section=members", title: "Manage members", description: "Register students, staff, or community borrowers." },
            { href: "/admin/library?section=categories", title: "Catalog setup", description: "Organize categories and subjects." },
            { href: "/admin/library?section=issued", title: "Loan history", description: "Filter current, overdue, and returned loans." },
          ].map((item) => <Link key={item.href} href={item.href}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700">
            <h2 className="break-words font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">{item.description}</p>
          </Link>)}
        </section>
      </main>
    </ManagementPortalShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-600">
      <span>{label}</span>
      <span className={alert ? "text-rose-600" : "text-violet-700"}>{icon}</span>
    </div>
    <p className={`mt-3 text-2xl font-bold ${alert ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
  </article>;
}
