import Link from "next/link";
import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  libraryBooks,
  libraryCategories,
  libraryLoans,
  libraryMembers,
  librarySubjects,
  schoolBranches,
  staffMembers,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getDefaultLoanDueDate } from "@/lib/library-policy";
import {
  CheckoutDialog,
  LibraryIssueForm,
  LibraryBookDialog,
  LibraryMemberDialog,
  LibraryMemberStatusButton,
  LibraryTermDialog,
  LoanActions,
  type EditableLibraryBook,
  type LibraryBranchOption,
  type LibraryMemberOption,
  type LibraryStudentOption,
  type LibraryTermOption,
} from "./library-forms";

export const dynamic = "force-dynamic";

const sections = ["add-book", "books", "categories", "members", "issue", "issued", "subjects"] as const;
type LibrarySection = (typeof sections)[number];

function dateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function validId(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
}

function sectionTitle(section: LibrarySection): string {
  return {
    books: "Book list",
    "add-book": "Add book",
    categories: "Book categories",
    members: "Library members",
    issue: "Issue / return books",
    issued: "All issued books",
    subjects: "Library subjects",
  }[section];
}

function sectionHref(section: LibrarySection, query = ""): string {
  const params = new URLSearchParams({ section });
  if (query) params.set("q", query);
  return `/admin/library?${params}`;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    section?: string;
    status?: string;
    branchId?: string;
    memberType?: string;
    bookId?: string;
    subjectId?: string;
  }>;
}) {
  const context = await requireSchoolPermission("library.manage");
  const queryParams = await searchParams;
  const section: LibrarySection = sections.includes(queryParams.section as LibrarySection)
    ? queryParams.section as LibrarySection
    : "books";
  const query = (queryParams.q ?? "").trim().slice(0, 100);
  const selectedStatus = ["active", "returned", "all"].includes(queryParams.status ?? "")
    ? queryParams.status!
    : "all";
  const branchId = validId(queryParams.branchId);
  const bookId = validId(queryParams.bookId);
  const subjectId = validId(queryParams.subjectId);
  const schoolId = context.schoolId;
  const today = dateToday();
  const dueDate = getDefaultLoanDueDate(today) ?? today;
  const searchBook = query
    ? or(
      like(libraryBooks.title, `%${query}%`),
      like(libraryBooks.author, `%${query}%`),
      like(libraryBooks.isbn, `%${query}%`),
      like(libraryBooks.bookNumber, `%${query}%`),
      like(libraryBooks.category, `%${query}%`),
    )
    : undefined;

  const [
    bookRows,
    categoryRows,
    subjectRows,
    branchRows,
    studentRows,
    staffRows,
    memberRows,
    loanRows,
    [loanCount],
    [overdueCount],
    [catalogStats],
  ] = await Promise.all([
    db.select().from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      searchBook,
    )).orderBy(asc(libraryBooks.title)).limit(500),
    db.select().from(libraryCategories).where(eq(libraryCategories.schoolId, schoolId))
      .orderBy(asc(libraryCategories.name)).limit(500),
    db.select().from(librarySubjects).where(eq(librarySubjects.schoolId, schoolId))
      .orderBy(asc(librarySubjects.name)).limit(500),
    db.select({ id: schoolBranches.id, name: schoolBranches.name }).from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name)).limit(200),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      branchId: students.branchId,
    }).from(students).where(and(
      eq(students.schoolId, schoolId),
      inArray(students.status, ["active", "admitted"]),
    ))
      .orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
      branchId: staffMembers.branchId,
    }).from(staffMembers).where(and(
      eq(staffMembers.schoolId, schoolId),
      eq(staffMembers.status, "active"),
    )).orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      id: libraryMembers.id,
      memberNumber: libraryMembers.memberNumber,
      memberType: libraryMembers.memberType,
      status: libraryMembers.status,
      branchId: libraryMembers.branchId,
      studentId: libraryMembers.studentId,
      staffMemberId: libraryMembers.staffMemberId,
      firstName: sql<string>`coalesce(${students.firstName}, ${staffMembers.firstName})`,
      lastName: sql<string>`coalesce(${students.lastName}, ${staffMembers.lastName})`,
      admissionNumber: students.admissionNumber,
      employeeCode: staffMembers.employeeCode,
    }).from(libraryMembers)
      .leftJoin(students, and(
        eq(students.id, libraryMembers.studentId),
        eq(students.schoolId, schoolId),
      ))
      .leftJoin(staffMembers, and(
        eq(staffMembers.id, libraryMembers.staffMemberId),
        eq(staffMembers.schoolId, schoolId),
      ))
      .where(eq(libraryMembers.schoolId, schoolId))
      .orderBy(asc(libraryMembers.memberNumber)),
    db.select({
      id: libraryLoans.id,
      bookId: libraryBooks.id,
      title: libraryBooks.title,
      bookNumber: libraryBooks.bookNumber,
      subjectId: libraryBooks.subjectId,
      branchId: libraryBooks.branchId,
      memberId: libraryMembers.id,
      memberType: libraryMembers.memberType,
      memberNumber: libraryMembers.memberNumber,
      studentId: students.id,
      studentName: sql<string>`coalesce(concat(${students.firstName}, ' ', ${students.lastName}), concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}))`,
      admissionNumber: students.admissionNumber,
      employeeCode: staffMembers.employeeCode,
      issuedAt: libraryLoans.issuedAt,
      dueDate: libraryLoans.dueDate,
      returnedAt: libraryLoans.returnedAt,
      status: libraryLoans.status,
    }).from(libraryLoans)
      .innerJoin(libraryBooks, and(
        eq(libraryBooks.id, libraryLoans.bookId),
        eq(libraryBooks.schoolId, schoolId),
      ))
      .leftJoin(students, and(
        eq(students.id, libraryLoans.studentId),
        eq(students.schoolId, schoolId),
      ))
      .leftJoin(libraryMembers, and(
        eq(libraryMembers.id, libraryLoans.memberId),
        eq(libraryMembers.schoolId, schoolId),
      ))
      .leftJoin(staffMembers, and(
        eq(staffMembers.id, libraryMembers.staffMemberId),
        eq(staffMembers.schoolId, schoolId),
      ))
      .where(and(
        eq(libraryLoans.schoolId, schoolId),
        section === "issued" && selectedStatus !== "all"
          ? eq(libraryLoans.status, selectedStatus)
          : section !== "issued"
            ? eq(libraryLoans.status, "active")
            : undefined,
        branchId ? eq(libraryBooks.branchId, branchId) : undefined,
        bookId ? eq(libraryBooks.id, bookId) : undefined,
        subjectId ? eq(libraryBooks.subjectId, subjectId) : undefined,
        query ? or(
          like(libraryBooks.title, `%${query}%`),
          like(libraryBooks.bookNumber, `%${query}%`),
          like(libraryMembers.memberNumber, `%${query}%`),
          sql`concat(${students.firstName}, ' ', ${students.lastName}) like ${`%${query}%`}`,
          sql`concat(${staffMembers.firstName}, ' ', ${staffMembers.lastName}) like ${`%${query}%`}`,
          like(students.admissionNumber, `%${query}%`),
          like(staffMembers.employeeCode, `%${query}%`),
        ) : undefined,
      ))
      .orderBy(asc(libraryLoans.dueDate)).limit(500),
    db.select({ value: count() }).from(libraryLoans)
      .where(and(eq(libraryLoans.schoolId, schoolId), eq(libraryLoans.status, "active"))),
    db.select({ value: count() }).from(libraryLoans)
      .where(and(
        eq(libraryLoans.schoolId, schoolId),
        eq(libraryLoans.status, "active"),
        sql`${libraryLoans.dueDate} < ${today}`,
      )),
    db.select({
      titles: count(),
      copies: sql<number>`coalesce(sum(${libraryBooks.availableCopies}), 0)`,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.schoolId, schoolId),
      eq(libraryBooks.status, "active"),
    )),
  ]);
  const books = bookRows as EditableLibraryBook[];
  const branches: LibraryBranchOption[] = branchRows.map((branch) => ({ id: branch.id, label: branch.name }));
  const categories: LibraryTermOption[] = categoryRows.filter((row) => row.status === "active")
    .map((row) => ({ id: row.id, label: row.name }));
  const subjects: LibraryTermOption[] = subjectRows.filter((row) => row.status === "active")
    .map((row) => ({ id: row.id, label: row.name }));
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.label]));
  const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));
  const subjectNames = new Map(subjectRows.map((subject) => [subject.id, subject.name]));
  const registeredStudentIds = new Set(memberRows.filter((member) => member.memberType === "student")
    .map((member) => member.studentId).filter((id): id is number => id !== null));
  const registeredStaffIds = new Set(memberRows.filter((member) => member.memberType === "staff")
    .map((member) => member.staffMemberId).filter((id): id is number => id !== null));
  const unregisteredStudents: LibraryStudentOption[] = studentRows
    .filter((student) => !registeredStudentIds.has(student.id))
    .map((student) => ({
      id: student.id,
      label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`,
    }));
  const unregisteredStaff: LibraryStudentOption[] = staffRows
    .filter((staff) => !registeredStaffIds.has(staff.id))
    .map((staff) => ({
      id: staff.id,
      label: `${staff.firstName} ${staff.lastName}${staff.employeeCode ? ` (${staff.employeeCode})` : ""}`,
    }));
  const studentMemberships = new Map(memberRows
    .filter((member) => member.studentId !== null)
    .map((member) => [member.studentId!, member]));
  const staffMemberships = new Map(memberRows
    .filter((member) => member.staffMemberId !== null)
    .map((member) => [member.staffMemberId!, member]));
  const activeMembers: LibraryMemberOption[] = [
    ...studentRows.map((student) => {
      const membership = studentMemberships.get(student.id);
      return {
        id: `student:${student.id}`,
        label: [
          `${student.firstName} ${student.lastName}`,
          "Student",
          student.admissionNumber,
          membership?.memberNumber,
          membership?.status === "inactive" ? "Library access inactive" : null,
        ].filter(Boolean).join(" · "),
      };
    }),
    ...staffRows.map((staff) => {
      const membership = staffMemberships.get(staff.id);
      return {
        id: `staff:${staff.id}`,
        label: [
          `${staff.firstName} ${staff.lastName}`,
          "Staff",
          staff.employeeCode,
          membership?.memberNumber,
          membership?.status === "inactive" ? "Library access inactive" : null,
        ].filter(Boolean).join(" · "),
      };
    }),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const activeLoans = loanRows.map((loan) => ({ ...loan, overdue: loan.dueDate < today }));
  const addAction = section === "books" || section === "add-book"
    ? <LibraryBookDialog categories={categories} subjects={subjects} branches={branches} initialOpen={section === "add-book"} />
    : section === "categories"
      ? <LibraryTermDialog type="category" branches={branches} />
      : section === "subjects"
        ? <LibraryTermDialog type="subject" branches={branches} />
        : section === "members"
          ? <LibraryMemberDialog students={unregisteredStudents} staff={unregisteredStaff} branches={branches} />
          : null;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">School operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{sectionTitle(section)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Manage books, categories, subjects, memberships, and book circulation.</p>
        </div>
        {addAction}
      </header>

      <nav aria-label="Library sections" className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((item) => <Link key={item} href={sectionHref(item)}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${section === item ? "bg-violet-100 text-violet-800" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {sectionTitle(item)}
        </Link>)}
      </nav>

      {section === "books" && <>
        <section aria-label="Library summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Catalog titles" value={String(catalogStats?.titles ?? 0)} />
          <SummaryCard label="Copies available" value={String(catalogStats?.copies ?? 0)} />
          <SummaryCard label="Books on loan" value={String(loanCount?.value ?? 0)} />
          <SummaryCard label="Overdue loans" value={String(overdueCount?.value ?? 0)} alert={Number(overdueCount?.value ?? 0) > 0} />
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-slate-950">Book catalog</h2><p className="mt-1 text-sm text-slate-500">{bookRows.length} matching titles shown</p></div>
            <SearchForm section={section} query={query} placeholder="Search title, author, ISBN..." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Book</th><th className="px-4 py-3">Category / subject</th><th className="px-4 py-3">Branch / shelf</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.map((book) => {
                  const bookOption = { id: book.id, label: book.title };
                  return <tr key={book.id} className="align-top">
                    <td className="px-4 py-4"><p className="font-semibold text-slate-900">{book.title}</p><p className="mt-1 text-slate-500">{book.author}{book.isbn ? ` · ISBN ${book.isbn}` : ""}{book.bookNumber ? ` · #${book.bookNumber}` : ""}</p></td>
                    <td className="px-4 py-4 text-slate-600">{book.categoryId ? categoryNames.get(book.categoryId) : book.category || "Uncategorized"}<span className="block text-xs text-slate-400">{book.subjectId ? subjectNames.get(book.subjectId) ?? "Unassigned subject" : "No subject"}</span></td>
                    <td className="px-4 py-4 text-slate-600">{book.branchId ? branchNames.get(book.branchId) ?? "Branch" : "All branches"}<span className="block text-xs text-slate-400">{book.shelfLocation || "No shelf assigned"}</span></td>
                    <td className="px-4 py-4 font-medium text-slate-700">{book.availableCopies} / {book.totalCopies} available<span className="block text-xs text-slate-400">{book.status}</span></td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-2">
                      <LibraryBookDialog book={book} categories={categories} subjects={subjects} branches={branches} />
                      {book.status === "active" && book.availableCopies > 0 && <CheckoutDialog book={bookOption} members={activeMembers} dueDate={dueDate} minDate={today} />}
                    </div></td>
                  </tr>;
                })}
                {books.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">{query ? "No books match your search." : "No books in the catalog yet. Add the first title to get started."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </>}

      {section === "add-book" && <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        The new title form is open. Complete the book details and save to add it to the catalog.
      </section>}

      {(section === "categories" || section === "subjects") && (() => {
        const isCategory = section === "categories";
        const rows = isCategory ? categoryRows : subjectRows;
        return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4"><h2 className="font-semibold text-slate-950">{sectionTitle(section)}</h2><p className="mt-1 text-sm text-slate-500">Organize titles by {isCategory ? "category" : "subject"} across school branches.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-4 py-4 font-medium text-slate-900">{row.name}</td><td className="px-4 py-4 text-slate-600">{row.branchId ? branchNames.get(row.branchId) ?? "Branch" : "All branches"}</td><td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{row.status}</span></td><td className="px-4 py-4"><LibraryTermDialog type={isCategory ? "category" : "subject"} branches={branches} term={row} /></td></tr>)}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500">No {isCategory ? "categories" : "subjects"} have been added.</td></tr>}
            </tbody>
          </table></div>
        </section>;
      })()}

      {section === "members" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-slate-950">Library members</h2><p className="mt-1 text-sm text-slate-500">{memberRows.length} members registered</p></div>
          <SearchForm section={section} query={query} placeholder="Search member, ID, or admission no..." />
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Member ID</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{memberRows.filter((member) => !query || `${member.firstName} ${member.lastName} ${member.memberNumber} ${member.admissionNumber ?? ""} ${member.employeeCode ?? ""}`.toLowerCase().includes(query.toLowerCase())).map((member) => <tr key={member.id}>
            <td className="px-4 py-4 font-medium text-slate-900">{member.firstName} {member.lastName}<span className="block text-xs font-normal text-slate-400">{member.memberType === "staff" ? member.employeeCode ? `Employee ${member.employeeCode}` : "Staff member" : member.admissionNumber ?? "Student"}</span></td>
            <td className="px-4 py-4 text-slate-700">{member.memberNumber}</td><td className="px-4 py-4 text-slate-600">{member.memberType === "staff" ? "Staff" : "Student"}</td>
            <td className="px-4 py-4 text-slate-600">{member.branchId ? branchNames.get(member.branchId) ?? "Branch" : "—"}</td>
            <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{member.status}</span></td>
            <td className="px-4 py-4"><LibraryMemberStatusButton memberId={member.id} active={member.status === "active"} /></td>
          </tr>)}
            {memberRows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Register a student or staff member to enable book lending.</td></tr>}
          </tbody>
        </table></div>
      </section>}

      {section === "issue" && <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="font-semibold text-slate-950">Issue a book</h2><p className="mt-1 text-sm text-slate-500">Search active students or staff. First-time borrowers are registered as library members automatically.</p>
          <div className="mt-4"><LibraryIssueForm books={books.filter((book) => book.status === "active" && book.availableCopies > 0).map((book) => ({ id: book.id, label: book.title }))} members={activeMembers} dueDate={dueDate} minDate={today} /></div>
        </div>
        <LoanTable loans={activeLoans} today={today} dueDate={dueDate} />
      </section>}

      {section === "issued" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-4 border-b border-slate-100 p-4">
          <div><h2 className="font-semibold text-slate-950">Issued book register</h2><p className="mt-1 text-sm text-slate-500">Search and filter current and returned loans.</p></div>
          <form action="/admin/library" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input type="hidden" name="section" value="issued" />
            <input name="q" defaultValue={query} placeholder="Member, book, or ID" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
            <select name="branchId" defaultValue={branchId ?? ""} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select>
            <select name="bookId" defaultValue={bookId ?? ""} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All books</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
            <select name="subjectId" defaultValue={subjectId ?? ""} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}</select>
            <div className="flex gap-2"><select name="status" defaultValue={selectedStatus} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="returned">Returned</option></select><button className="rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Filter</button></div>
          </form>
        </div>
        <LoanHistoryTable loans={activeLoans} today={today} dueDate={dueDate} />
      </section>}
    </main>
  );
}

function SearchForm({ section, query, placeholder }: { section: LibrarySection; query: string; placeholder: string }) {
  return <form action="/admin/library" className="flex gap-2">
    <input type="hidden" name="section" value={section} />
    <input name="q" defaultValue={query} placeholder={placeholder} className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm sm:w-72" />
    <button className="rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Search</button>
    {query && <Link href={sectionHref(section)} className="self-center text-sm text-violet-700">Clear</Link>}
  </form>;
}

type LoanRow = {
  id: number;
  bookId: number;
  title: string;
  bookNumber: string | null;
  subjectId: number | null;
  branchId: number | null;
  memberId: number | null;
  memberNumber: string | null;
  memberType: string | null;
  studentId: number | null;
  studentName: string | null;
  admissionNumber: string | null;
  employeeCode: string | null;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
  status: string;
  overdue: boolean;
};

function LoanTable({ loans, today, dueDate }: { loans: LoanRow[]; today: string; dueDate: string }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4"><h2 className="font-semibold text-slate-950">Active loans</h2><p className="mt-1 text-sm text-slate-500">Return a book when received, or extend its due date.</p></div>
    <LoanHistoryTable loans={loans} today={today} dueDate={dueDate} activeOnly />
  </section>;
}

function LoanHistoryTable({
  loans,
  today,
  dueDate,
  activeOnly = false,
}: {
  loans: LoanRow[];
  today: string;
  dueDate: string;
  activeOnly?: boolean;
}) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr><th className="px-4 py-3">Book</th><th className="px-4 py-3">Member</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due / returned</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {loans.map((loan) => {
          const overdue = loan.status === "active" && loan.dueDate < today;
          return <tr key={loan.id} className="align-top">
            <td className="px-4 py-4 font-medium text-slate-900">{loan.title}<span className="block text-xs font-normal text-slate-400">{loan.bookNumber ? `Book ID ${loan.bookNumber}` : "No book number"}</span></td>
            <td className="px-4 py-4 text-slate-700">{loan.studentName ?? "Unknown member"}<span className="block text-xs text-slate-400">{loan.memberNumber ? `Member ${loan.memberNumber} · ${loan.memberType === "staff" ? "Staff" : "Student"}` : loan.admissionNumber ?? loan.employeeCode ?? "No member number"}</span></td>
            <td className="px-4 py-4 text-slate-600">{loan.issuedAt}</td>
            <td className={`px-4 py-4 font-medium ${overdue ? "text-rose-700" : "text-slate-600"}`}>{loan.dueDate}{overdue && <span className="ml-2 text-xs font-semibold">Overdue</span>}{loan.returnedAt && <span className="block text-xs text-slate-400">Returned {loan.returnedAt}</span>}</td>
            <td className="px-4 py-4 text-slate-600">{loan.status}</td>
            <td className="px-4 py-4">{loan.status === "active" && <LoanActions loanId={loan.id} currentDueDate={loan.dueDate} dueDate={getDefaultLoanDueDate(loan.dueDate) ?? dueDate} />}</td>
          </tr>;
        })}
        {loans.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">{activeOnly ? "There are no active loans." : "No loans match these filters."}</td></tr>}
      </tbody>
    </table>
  </div>;
}

function SummaryCard({ label, value, alert = false }: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    <p className={`mt-3 text-2xl font-bold ${alert ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
  </article>;
}
