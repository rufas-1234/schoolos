"use client";

import { useActionState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { SearchableSelect } from "@/components/searchable-select";
import {
  checkoutLibraryBook,
  renewLibraryLoan,
  returnLibraryBook,
  saveLibraryBook,
  type LibraryActionState,
} from "./actions";

export type LibraryBookOption = { id: number; label: string };
export type LibraryStudentOption = { id: number; label: string };
export type EditableLibraryBook = {
  id: number;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  category: string | null;
  shelfLocation: string | null;
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

function BookForm({ book }: { book?: EditableLibraryBook }) {
  const [state, formAction, pending] = useActionState(saveLibraryBook, {});
  return <form action={formAction} className="space-y-3">
    {book && <input type="hidden" name="bookId" value={book.id} />}
    <label className="block text-sm">Title<input name="title" required maxLength={200} defaultValue={book?.title} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Author<input name="author" required maxLength={160} defaultValue={book?.author} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">ISBN<input name="isbn" maxLength={20} defaultValue={book?.isbn ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Publisher<input name="publisher" maxLength={160} defaultValue={book?.publisher ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Category<input name="category" maxLength={100} defaultValue={book?.category ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Shelf location<input name="shelfLocation" maxLength={80} defaultValue={book?.shelfLocation ?? ""} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
      <label className="block text-sm">Total copies<input name="totalCopies" type="number" min={1} max={10000} required defaultValue={book?.totalCopies ?? 1} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    </div>
    {book && <label className="block text-sm">Catalog status<select name="status" defaultValue={book.status} className="mt-1 h-10 w-full rounded-lg border bg-white px-3"><option value="active">Active</option><option value="archived">Archived</option></select></label>}
    <ActionFeedback state={state} />
    <button disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : book ? "Save changes" : "Add book"}</button>
  </form>;
}

export function LibraryBookDialog({ book }: { book?: EditableLibraryBook }) {
  return <AdminActionDialog label={book ? "Edit" : "Add book"} title={book ? "Edit book details" : "Add a book to the catalog"}>
    <BookForm book={book} />
  </AdminActionDialog>;
}

export function CheckoutForm({
  book,
  students,
  dueDate,
  minDate,
}: {
  book: LibraryBookOption;
  students: LibraryStudentOption[];
  dueDate: string;
  minDate: string;
}) {
  const [state, formAction, pending] = useActionState(checkoutLibraryBook, {});
  return <form action={formAction} className="space-y-3">
    <input type="hidden" name="bookId" value={book.id} />
    <SearchableSelect label="Student" name="studentId" required
      options={students.map((student) => ({ value: String(student.id), label: student.label }))}
      placeholder={students.length ? "Search students..." : "No active students"} />
    <label className="block text-sm">Due date<input name="dueDate" type="date" required min={minDate} defaultValue={dueDate} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <ActionFeedback state={state} />
    <button disabled={pending || students.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Checking out..." : "Check out book"}</button>
  </form>;
}

export function CheckoutDialog({
  book,
  students,
  dueDate,
  minDate,
}: {
  book: LibraryBookOption;
  students: LibraryStudentOption[];
  dueDate: string;
  minDate: string;
}) {
  return <AdminActionDialog label="Issue" title={`Issue ${book.label}`}>
    <CheckoutForm book={book} students={students} dueDate={dueDate} minDate={minDate} />
  </AdminActionDialog>;
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
