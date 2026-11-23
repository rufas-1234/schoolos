import Link from "next/link";
import {
  ArrowUpRight,
  BookMarked,
  BookOpenCheck,
  CircleAlert,
  LibraryBig,
  Users,
} from "lucide-react";
import { and, asc, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import {
  libraryBooks,
  libraryLoans,
  libraryMembers,
  staffMembers,
  students,
} from "@/db/schema";

type CirculationCount = { month: string; value: number };

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(date: Date): string {
  return `${monthKey(date)}-01`;
}

export async function LibraryOverview({ schoolId }: { schoolId: number }) {
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const firstMonth = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() - 5, 1));
  const rangeStart = monthStart(firstMonth);
  const monthDates = Array.from({ length: 6 }, (_, index) =>
    new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1)),
  );
  const issuedMonth = sql<string>`DATE_FORMAT(${libraryLoans.issuedAt}, '%Y-%m')`;
  const returnedMonth = sql<string>`DATE_FORMAT(${libraryLoans.returnedAt}, '%Y-%m')`;
  const issuedCount = count();

  const [
    [catalog],
    [activeMemberCount],
    [activeLoanCount],
    [overdueCount],
    dueLoans,
    issuedRows,
    returnedRows,
    popularBooks,
    outOfStockBooks,
  ] = await Promise.all([
    db.select({
      titles: count(),
      totalCopies: sql<number>`COALESCE(SUM(${libraryBooks.totalCopies}), 0)`,
      availableCopies: sql<number>`COALESCE(SUM(${libraryBooks.availableCopies}), 0)`,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      eq(libraryBooks.status, "active"),
    )),
    db.select({ value: count() }).from(libraryMembers).where(and(
      eq(libraryMembers.schoolId, schoolId),
      eq(libraryMembers.status, "active"),
    )),
    db.select({ value: count() }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      eq(libraryLoans.status, "active"),
    )),
    db.select({ value: count() }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      eq(libraryLoans.status, "active"),
      sql`${libraryLoans.dueDate} < ${today}`,
    )),
    db.select({
      id: libraryLoans.id,
      title: libraryBooks.title,
      bookNumber: libraryBooks.bookNumber,
      dueDate: libraryLoans.dueDate,
      studentName: sql<string>`coalesce(concat(${students.firstName}, ' ', ${students.lastName}), concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}), ${libraryMembers.memberName}, 'Unknown member')`,
      memberNumber: libraryMembers.memberNumber,
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
      .orderBy(asc(libraryLoans.dueDate), asc(libraryLoans.issuedAt))
      .limit(6),
    db.select({
      month: issuedMonth,
      value: issuedCount,
    }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      gte(libraryLoans.issuedAt, rangeStart),
      lte(libraryLoans.issuedAt, today),
    )).groupBy(issuedMonth).orderBy(asc(issuedMonth)),
    db.select({
      month: returnedMonth,
      value: count(),
    }).from(libraryLoans).where(and(
      eq(libraryLoans.schoolId, schoolId),
      eq(libraryLoans.status, "returned"),
      isNotNull(libraryLoans.returnedAt),
      gte(libraryLoans.returnedAt, rangeStart),
      lte(libraryLoans.returnedAt, today),
    )).groupBy(returnedMonth).orderBy(asc(returnedMonth)),
    db.select({
      id: libraryBooks.id,
      title: libraryBooks.title,
      author: libraryBooks.author,
      loans: issuedCount,
    }).from(libraryLoans)
      .innerJoin(libraryBooks, and(
        eq(libraryBooks.id, libraryLoans.bookId),
        eq(libraryBooks.schoolId, schoolId),
        eq(libraryBooks.status, "active"),
      ))
      .where(and(
        eq(libraryLoans.schoolId, schoolId),
        gte(libraryLoans.issuedAt, rangeStart),
        lte(libraryLoans.issuedAt, today),
      ))
      .groupBy(libraryBooks.id, libraryBooks.title, libraryBooks.author)
      .orderBy(desc(issuedCount), asc(libraryBooks.title))
      .limit(5),
    db.select({
      id: libraryBooks.id,
      title: libraryBooks.title,
      bookNumber: libraryBooks.bookNumber,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      eq(libraryBooks.status, "active"),
      eq(libraryBooks.availableCopies, 0),
    )).orderBy(asc(libraryBooks.title)).limit(5),
  ]);

  const issuedByMonth = new Map<string, number>(issuedRows.map((row: CirculationCount) => [row.month, Number(row.value)]));
  const returnedByMonth = new Map<string, number>(returnedRows.map((row: CirculationCount) => [row.month, Number(row.value)]));
  const circulation = monthDates.map((date) => ({
    key: monthKey(date),
    label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
    issued: issuedByMonth.get(monthKey(date)) ?? 0,
    returned: returnedByMonth.get(monthKey(date)) ?? 0,
  }));
  const maxCirculation = Math.max(1, ...circulation.flatMap((item) => [item.issued, item.returned]));
  const maxPopularLoans = Math.max(1, ...popularBooks.map((book) => Number(book.loans)));
  const overdueLoans = Number(overdueCount?.value ?? 0);

  return (
    <main className="min-w-0 space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">Library operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Library overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Monitor catalog availability, borrowing activity, members, and returns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/library?section=issue" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">
            Issue / return books <ArrowUpRight size={16} />
          </Link>
          <Link href="/admin/library?section=add-book" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Add a book
          </Link>
        </div>
      </header>

      <section aria-label="Library key metrics" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          href="/admin/library?section=books"
          label="Catalog titles"
          value={Number(catalog?.titles ?? 0)}
          detail={`${Number(catalog?.totalCopies ?? 0)} total copies`}
          icon={<BookOpenCheck size={18} />}
        />
        <MetricCard
          href="/admin/library?section=books"
          label="Copies available"
          value={Number(catalog?.availableCopies ?? 0)}
          detail="Across active titles"
          icon={<LibraryBig size={18} />}
        />
        <MetricCard
          href="/admin/library?section=members"
          label="Active members"
          value={Number(activeMemberCount?.value ?? 0)}
          detail="Students, staff, and community"
          icon={<Users size={18} />}
        />
        <MetricCard
          href="/admin/library?section=issued&status=active"
          label="Books on loan"
          value={Number(activeLoanCount?.value ?? 0)}
          detail="Currently checked out"
          icon={<BookMarked size={18} />}
        />
        <MetricCard
          href="/admin/library?section=issued&status=active"
          label="Overdue loans"
          value={overdueLoans}
          detail={overdueLoans ? "Require follow-up" : "No overdue returns"}
          icon={<CircleAlert size={18} />}
          alert={overdueLoans > 0}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Circulation activity</h2>
              <p className="mt-1 text-sm text-slate-500">Books issued and returned over the last six months.</p>
            </div>
            <Link href="/admin/library?section=issued&status=all" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
              Loan register
            </Link>
          </div>
          <div role="img" aria-label="Monthly book issues and returns for the last six months" className="mt-5 grid grid-cols-6 gap-2">
            {circulation.map((month) => (
              <div key={month.key} className="flex min-w-0 flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end justify-center gap-1 border-b border-slate-100 pb-1">
                  <div
                    title={`${month.issued} issued`}
                    className="w-3 rounded-t bg-violet-700 sm:w-5"
                    style={{ height: `${month.issued ? Math.max(8, month.issued / maxCirculation * 100) : 2}%` }}
                  />
                  <div
                    title={`${month.returned} returned`}
                    className="w-3 rounded-t bg-indigo-200 sm:w-5"
                    style={{ height: `${month.returned ? Math.max(8, month.returned / maxCirculation * 100) : 2}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-500">{month.label}</span>
                <span className="sr-only">{month.issued} issued, {month.returned} returned</span>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-violet-700" />Issued</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-200" />Returned</span>
          </div>
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Most borrowed</h2>
              <p className="mt-1 text-sm text-slate-500">Popular titles in the last six months.</p>
            </div>
            <BookMarked className="shrink-0 text-violet-700" size={19} aria-hidden="true" />
          </div>
          {popularBooks.length ? (
            <ol className="mt-4 space-y-4">
              {popularBooks.map((book, index) => {
                const loans = Number(book.loans);
                return (
                  <li key={book.id} className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-xs font-bold text-violet-800">{index + 1}</span>
                        <div className="min-w-0">
                          <Link href={`/admin/library?section=books&q=${encodeURIComponent(book.title)}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-violet-800">{book.title}</Link>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{book.author || "Author not recorded"}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">{loans} loans</span>
                    </div>
                    <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(8, loans / maxPopularLoans * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Borrowing activity will appear here as books are issued.</p>
          )}
        </article>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="font-semibold text-slate-950">Due soon and overdue</h2>
              <p className="mt-1 text-sm text-slate-500">Active loans ordered by return date.</p>
            </div>
            <Link href="/admin/library?section=issued&status=active" className="text-sm font-semibold text-violet-700 hover:text-violet-900">View all</Link>
          </div>
          {dueLoans.length ? (
            <ul className="divide-y divide-slate-100">
              {dueLoans.map((loan) => {
                const overdue = loan.dueDate < today;
                return (
                  <li key={loan.id} className="flex min-w-0 items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link href={`/admin/library?section=issued&status=active&q=${encodeURIComponent(loan.title)}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-violet-800">{loan.title}</Link>
                      <p className="mt-1 truncate text-xs text-slate-500">{loan.studentName}{loan.memberNumber ? ` · Member ${loan.memberNumber}` : ""}{loan.bookNumber ? ` · Book ${loan.bookNumber}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                      {overdue ? "Overdue" : loan.dueDate === today ? "Due today" : "Due"} · {loan.dueDate}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">There are no active book loans.</p>
          )}
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Catalog attention</h2>
              <p className="mt-1 text-sm text-slate-500">Active titles with no available copies.</p>
            </div>
            <CircleAlert className="shrink-0 text-amber-600" size={19} aria-hidden="true" />
          </div>
          {outOfStockBooks.length ? (
            <ul className="mt-4 space-y-2">
              {outOfStockBooks.map((book) => (
                <li key={book.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-amber-50/70 px-3 py-2.5">
                  <Link href={`/admin/library?section=books&q=${encodeURIComponent(book.title)}`} className="truncate text-sm font-medium text-slate-800 hover:text-violet-800">{book.title}</Link>
                  <span className="shrink-0 text-xs text-slate-500">{book.bookNumber ? `#${book.bookNumber}` : "No copies"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">All active titles have copies available.</p>
          )}
          {outOfStockBooks.length === 5 && <p className="mt-3 text-xs text-slate-500">Showing the first five titles without copies available.</p>}
        </article>
      </section>

      <section aria-label="Library quick actions" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/admin/library?section=books", title: "Browse catalog", description: "Search and manage library titles." },
          { href: "/admin/library?section=issue", title: "Issue or return", description: "Record a checkout, return, or renewal." },
          { href: "/admin/library?section=members", title: "Manage members", description: "Review student, staff, and community borrowers." },
          { href: "/admin/library?section=categories", title: "Catalog setup", description: "Organize book categories and subjects." },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700">
            <h2 className="break-words font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">{item.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function MetricCard({
  href,
  label,
  value,
  detail,
  icon,
  alert = false,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-600">
        <span>{label}</span>
        <span className={alert ? "text-rose-600" : "text-violet-700"}>{icon}</span>
      </div>
      <p className={`mt-3 text-2xl font-bold ${alert ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
    </Link>
  );
}
