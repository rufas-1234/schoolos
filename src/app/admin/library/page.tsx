import Link from "next/link";
import { and, asc, count, eq, like, or, sql } from "drizzle-orm";
import { BookMarked, BookOpenCheck, Clock3, LibraryBig } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/db";
import { libraryBooks, libraryLoans, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getDefaultLoanDueDate } from "@/lib/library-policy";
import { CheckoutDialog, LibraryBookDialog, LoanActions, type EditableLibraryBook, type LibraryStudentOption } from "./library-forms";

export const dynamic = "force-dynamic";

function dateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireSchoolPermission("library.manage");
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const schoolId = context.schoolId;
  const today = dateToday();
  const dueDate = getDefaultLoanDueDate(today) ?? today;

  const [bookRows, loanRows, [loanCount], [overdueCount], studentRows, [catalogStats]] = await Promise.all([
    db.select().from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      ...(query ? [or(
        like(libraryBooks.title, `%${query}%`),
        like(libraryBooks.author, `%${query}%`),
        like(libraryBooks.isbn, `%${query}%`),
        like(libraryBooks.category, `%${query}%`),
      )!] : []),
    )).orderBy(asc(libraryBooks.title)).limit(200),
    db.select({
      id: libraryLoans.id,
      bookId: libraryBooks.id,
      title: libraryBooks.title,
      studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
      admissionNumber: students.admissionNumber,
      issuedAt: libraryLoans.issuedAt,
      dueDate: libraryLoans.dueDate,
    }).from(libraryLoans)
      .innerJoin(libraryBooks, and(
        eq(libraryBooks.id, libraryLoans.bookId),
        eq(libraryBooks.schoolId, schoolId),
      ))
      .innerJoin(students, and(
        eq(students.id, libraryLoans.studentId),
        eq(students.schoolId, schoolId),
      ))
      .where(and(eq(libraryLoans.schoolId, schoolId), eq(libraryLoans.status, "active")))
      .orderBy(asc(libraryLoans.dueDate)).limit(200),
    db.select({ value: count() }).from(libraryLoans)
      .where(and(eq(libraryLoans.schoolId, schoolId), eq(libraryLoans.status, "active"))),
    db.select({ value: count() }).from(libraryLoans)
      .where(and(
        eq(libraryLoans.schoolId, schoolId),
        eq(libraryLoans.status, "active"),
        sql`${libraryLoans.dueDate} < ${today}`,
      )),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
    }).from(students).where(and(eq(students.schoolId, schoolId), eq(students.status, "active")))
      .orderBy(asc(students.lastName), asc(students.firstName)).limit(1000),
    db.select({
      titles: count(),
      copies: sql<number>`coalesce(sum(${libraryBooks.availableCopies}), 0)`,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      eq(libraryBooks.status, "active"),
    )),
  ]);
  const books = bookRows as EditableLibraryBook[];
  const studentsOptions: LibraryStudentOption[] = studentRows.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`,
  }));
  const activeLoans = loanRows.map((loan) => ({ ...loan, overdue: loan.dueDate < today }));

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">School operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Library management</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Manage the book catalog, check out books to students, and keep loan returns up to date.</p>
        </div>
        <LibraryBookDialog />
      </header>

      <section aria-label="Library summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={LibraryBig} label="Catalog titles" value={String(catalogStats?.titles ?? 0)} />
        <SummaryCard icon={BookMarked} label="Copies available" value={String(catalogStats?.copies ?? 0)} />
        <SummaryCard icon={BookOpenCheck} label="Books on loan" value={String(loanCount?.value ?? 0)} />
        <SummaryCard icon={Clock3} label="Overdue loans" value={String(overdueCount?.value ?? 0)} alert={Number(overdueCount?.value ?? 0) > 0} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Book catalog</h2>
            <p className="mt-1 text-sm text-slate-500">{bookRows.length} matching titles shown</p>
          </div>
          <form action="/admin/library" className="flex gap-2">
            <input name="q" defaultValue={query} placeholder="Search title, author, ISBN..." className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm sm:w-72" />
            <button className="rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Search</button>
            {query && <Link href="/admin/library" className="self-center text-sm text-violet-700">Clear</Link>}
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Book</th><th className="px-4 py-3">Category / shelf</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {books.map((book) => {
                const bookOption = { id: book.id, label: book.title };
                return <tr key={book.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">{book.title}</p>
                    <p className="mt-1 text-slate-500">{book.author}{book.isbn ? ` · ISBN ${book.isbn}` : ""}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{book.category || "Uncategorized"}<span className="block text-xs text-slate-400">{book.shelfLocation || "No shelf assigned"}</span></td>
                  <td className="px-4 py-4 font-medium text-slate-700">{book.availableCopies} / {book.totalCopies} available</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${book.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{book.status}</span></td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <LibraryBookDialog book={book} />
                      {book.status === "active" && book.availableCopies > 0 &&
                        <CheckoutDialog book={bookOption} students={studentsOptions} dueDate={dueDate} minDate={today} />}
                    </div>
                  </td>
                </tr>;
              })}
              {books.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">{query ? "No books match your search." : "No books in the catalog yet. Add the first title to get started."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-950">Active loans</h2>
          <p className="mt-1 text-sm text-slate-500">Return a book when received, or extend its due date.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Book</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeLoans.map((loan) => <tr key={loan.id}>
                <td className="px-4 py-4 font-medium text-slate-900">{loan.title}</td>
                <td className="px-4 py-4 text-slate-700">{loan.studentName}<span className="block text-xs text-slate-400">{loan.admissionNumber ?? "No admission number"}</span></td>
                <td className="px-4 py-4 text-slate-600">{loan.issuedAt}</td>
                <td className={`px-4 py-4 font-medium ${loan.overdue ? "text-rose-700" : "text-slate-600"}`}>{loan.dueDate}{loan.overdue && <span className="ml-2 text-xs font-semibold">Overdue</span>}</td>
                <td className="px-4 py-4"><LoanActions loanId={loan.id} currentDueDate={loan.dueDate} dueDate={getDefaultLoanDueDate(loan.dueDate) ?? dueDate} /></td>
              </tr>)}
              {activeLoans.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">There are no active loans.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <Icon size={18} className={alert ? "text-rose-600" : "text-violet-700"} aria-hidden="true" />
    </div>
    <p className={`mt-3 text-2xl font-bold ${alert ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
  </article>;
}
