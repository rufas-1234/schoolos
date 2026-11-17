"use client";

import { useActionState, useState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { SearchableSelect } from "@/components/searchable-select";
import {
  checkoutLibraryBook,
  renewLibraryLoan,
  returnLibraryBook,
  saveLibraryBook,
  saveLibraryMember,
  saveLibraryTerm,
  setLibraryMemberStatus,
  type LibraryActionState,
} from "./actions";

export type LibraryBookOption = { id: number; label: string };
export type LibraryStudentOption = { id: number; label: string };
export type LibraryMemberOption = { id: number; label: string };
export type LibraryTermOption = { id: number; label: string };
export type LibraryBranchOption = { id: number; label: string };
export type EditableLibraryTerm = { id: number; name: string; branchId: number | null; status: string };
export type EditableLibraryBook = {
  id: number;
  branchId: number | null;
  categoryId: number | null;
  subjectId: number | null;
  bookNumber: string | null;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  category: string | null;
  description: string | null;
  shelfLocation: string | null;
  price: string | null;
  totalCopies: number;
  availableCopies: number;
  status: string;
};

function ActionFeedback({ state }: { state: LibraryActionState }) {
  return <>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
  </>;
}

function BookForm({
  book,
  categories,
  subjects,
  branches,
}: {
  book?: EditableLibraryBook;
  categories: LibraryTermOption[];
  subjects: LibraryTermOption[];
  branches: LibraryBranchOption[];
}) {
  const [state, formAction, pending] = useActionState(saveLibraryBook, {});
  return <form action={formAction} className="space-y-3">
    {book && <input type="hidden" name="bookId" value={book.id} />}
    <label className="block text-sm">Title<input name="title" required maxLength={200} defaultValue={book?.title} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      {branches.length > 0 && <label className="block text-sm">Branch<select name="branchId" defaultValue={book?.branchId ? String(book.branchId) : ""} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>}
      <label className="block text-sm">Book number<input name="bookNumber" maxLength={40} defaultValue={book?.bookNumber ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Author<input name="author" required maxLength={160} defaultValue={book?.author} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">ISBN<input name="isbn" maxLength={20} defaultValue={book?.isbn ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Publisher<input name="publisher" maxLength={160} defaultValue={book?.publisher ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Category<select name="categoryId" defaultValue={book?.categoryId ? String(book.categoryId) : ""} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label className="block text-sm">Subject<select name="subjectId" defaultValue={book?.subjectId ? String(book.subjectId) : ""} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}</select></label>
      <label className="block text-sm">Shelf location<input name="shelfLocation" maxLength={80} defaultValue={book?.shelfLocation ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Book price<input name="price" type="number" min="0" step="0.01" defaultValue={book?.price ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Total copies<input name="totalCopies" type="number" min={1} max={10000} required defaultValue={book?.totalCopies ?? 1} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    </div>
    <label className="block text-sm">Description<textarea name="description" maxLength={1000} defaultValue={book?.description ?? ""} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
    {book && <label className="block text-sm">Catalog status<select name="status" defaultValue={book.status} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="active">Active</option><option value="archived">Archived</option></select></label>}
    <ActionFeedback state={state} />
    <button disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : book ? "Save changes" : "Add book"}</button>
  </form>;
}

export function LibraryBookDialog({
  book,
  categories = [],
  subjects = [],
  branches = [],
  initialOpen = false,
}: {
  book?: EditableLibraryBook;
  categories?: LibraryTermOption[];
  subjects?: LibraryTermOption[];
  branches?: LibraryBranchOption[];
  initialOpen?: boolean;
}) {
  return <AdminActionDialog initialOpen={initialOpen} label={book ? "Edit" : "Add book"} title={book ? "Edit book details" : "Add a book to the catalog"}>
    <BookForm book={book} categories={categories} subjects={subjects} branches={branches} />
  </AdminActionDialog>;
}

export function CheckoutForm({
  book,
  members,
  dueDate,
  minDate,
}: {
  book: LibraryBookOption;
  members: LibraryMemberOption[];
  dueDate: string;
  minDate: string;
}) {
  const [state, formAction, pending] = useActionState(checkoutLibraryBook, {});
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="bookId" value={book.id} />
    <SearchableSelect label="Member" name="memberId" required
      options={members.map((member) => ({ value: String(member.id), label: member.label }))}
      placeholder={members.length ? "Search library members..." : "No active members"} />
    <label className="block text-sm">Due date<input name="dueDate" type="date" required min={minDate} defaultValue={dueDate} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <ActionFeedback state={state} />
    <button disabled={pending || members.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Checking out..." : "Check out book"}</button>
  </form>;
}

export function LibraryIssueForm({
  books,
  members,
  dueDate,
  minDate,
}: {
  books: LibraryBookOption[];
  members: LibraryMemberOption[];
  dueDate: string;
  minDate: string;
}) {
  const [state, formAction, pending] = useActionState(checkoutLibraryBook, {});
  return <form action={formAction} className="space-y-3">
    <SearchableSelect label="Book" name="bookId" required
      options={books.map((book) => ({ value: String(book.id), label: book.label }))}
      placeholder={books.length ? "Search available books..." : "No available books"} />
    <SearchableSelect label="Member" name="memberId" required
      options={members.map((member) => ({ value: String(member.id), label: member.label }))}
      placeholder={members.length ? "Search library members..." : "No active members"} />
    <label className="block text-sm">Due date<input name="dueDate" type="date" required min={minDate} defaultValue={dueDate} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <ActionFeedback state={state} />
    <button disabled={pending || books.length === 0 || members.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Issuing..." : "Issue book"}</button>
  </form>;
}

export function CheckoutDialog({
  book,
  members,
  dueDate,
  minDate,
}: {
  book: LibraryBookOption;
  members: LibraryMemberOption[];
  dueDate: string;
  minDate: string;
}) {
  return <AdminActionDialog label="Issue" title={`Issue ${book.label}`}>
    <CheckoutForm book={book} members={members} dueDate={dueDate} minDate={minDate} />
  </AdminActionDialog>;
}

export function LibraryTermDialog({
  type,
  branches = [],
  term,
}: {
  type: "category" | "subject";
  branches?: LibraryBranchOption[];
  term?: EditableLibraryTerm;
}) {
  const [state, formAction, pending] = useActionState(saveLibraryTerm, {});
  const label = type === "category" ? "Category" : "Subject";
  return <AdminActionDialog label={term ? "Edit" : `Add ${label.toLowerCase()}`} title={`${term ? "Edit" : "Add a book"} ${label.toLowerCase()}`}>
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value={type} />
      {term && <input type="hidden" name="termId" value={term.id} />}
      <label className="block text-sm">{label} name<input name="name" required maxLength={120} defaultValue={term?.name} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      {branches.length > 0 && <label className="block text-sm">Branch<select name="branchId" defaultValue={term?.branchId ? String(term.branchId) : ""} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>}
      {term && <label className="block text-sm">Status<select name="status" defaultValue={term.status} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="active">Active</option><option value="archived">Archived</option></select></label>}
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : term ? "Save changes" : `Add ${label.toLowerCase()}`}</button>
    </form>
  </AdminActionDialog>;
}

export function LibraryMemberDialog({
  students,
  staff = [],
  branches = [],
}: {
  students: LibraryStudentOption[];
  staff?: LibraryStudentOption[];
  branches?: LibraryBranchOption[];
}) {
  const [state, formAction, pending] = useActionState(saveLibraryMember, {});
  const [memberType, setMemberType] = useState<"student" | "staff">("student");
  const people = memberType === "student" ? students : staff;
  return <AdminActionDialog label="Add member" title="Register a library member">
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">Member type<select name="memberType" value={memberType}
        onChange={(event) => setMemberType(event.target.value === "staff" ? "staff" : "student")}
        className="mt-1 h-10 w-full rounded-lg border bg-white px-3">
        <option value="student">Student</option>
        <option value="staff">Staff</option>
      </select></label>
      <SearchableSelect key={memberType} label={memberType === "student" ? "Student" : "Staff member"}
        name="personId" required
        options={people.map((person) => ({ value: String(person.id), label: person.label }))}
        placeholder={people.length ? `Search ${memberType === "student" ? "students" : "staff"}...` : `No unregistered ${memberType === "student" ? "students" : "staff"}`} />
      <label className="block text-sm">Member ID<input name="memberNumber" required maxLength={40} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      {branches.length > 0 && <label className="block text-sm">Branch<select name="branchId" className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="">Use {memberType} branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>}
      <ActionFeedback state={state} />
      <button disabled={pending || people.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : `Register ${memberType}`}</button>
    </form>
  </AdminActionDialog>;
}

export function LibraryMemberStatusButton({ memberId, active }: { memberId: number; active: boolean }) {
  const [state, formAction, pending] = useActionState(setLibraryMemberStatus, {});
  return <form action={formAction} className="flex items-center gap-2">
    <input type="hidden" name="memberId" value={memberId} />
    <input type="hidden" name="status" value={active ? "inactive" : "active"} />
    <button disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{pending ? "Saving..." : active ? "Deactivate" : "Activate"}</button>
    <ActionFeedback state={state} />
  </form>;
}

export function LoanActions({ loanId, dueDate, currentDueDate }: { loanId: number; dueDate: string; currentDueDate: string }) {
  const [returnState, returnAction, returnPending] = useActionState(returnLibraryBook, {});
  const [renewState, renewAction, renewPending] = useActionState(renewLibraryLoan, {});
  return <div className="flex flex-wrap items-center gap-2">
    <form action={returnAction}>
      <input type="hidden" name="loanId" value={loanId} />
      <button disabled={returnPending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{returnPending ? "Returning..." : "Return"}</button>
      <ActionFeedback state={returnState} />
    </form>
    <form action={renewAction} className="flex items-center gap-1">
      <input type="hidden" name="loanId" value={loanId} />
      <input name="dueDate" type="date" min={currentDueDate} defaultValue={dueDate} aria-label="Renewal due date" className="h-9 rounded-lg border px-2 text-xs" />
      <button disabled={renewPending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{renewPending ? "..." : "Renew"}</button>
      <ActionFeedback state={renewState} />
    </form>
  </div>;
}
