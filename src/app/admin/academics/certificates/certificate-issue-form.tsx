"use client";

import { useActionState } from "react";
import Link from "next/link";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect } from "@/components/searchable-select";
import { issueStudentCertificate, type CertificateActionState } from "./actions";

type StudentOption = {
  id: number;
  label: string;
};

export function CertificateIssueForm({
  academicYearId,
  academicYearName,
  issueDate,
  students,
  categories,
}: {
  academicYearId: number;
  academicYearName: string;
  issueDate: string;
  students: StudentOption[];
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<CertificateActionState, FormData>(
    issueStudentCertificate,
    {},
  );
  const listId = "certificate-category-suggestions";

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div>
        <h2 className="text-base font-semibold text-slate-900">Issue a certificate</h2>
        <p className="mt-1 text-sm text-slate-500">Awarded for {academicYearName}.</p>
      </div>
      <p className="text-xs text-slate-500"><RequiredMark /> Required fields</p>
      <SearchableSelect
        label="Student"
        name="studentId"
        options={students.map((student) => ({ value: String(student.id), label: student.label }))}
        required
        disabled={students.length === 0}
        placeholder={students.length ? "Search enrolled students..." : "No enrolled students in this year"}
      />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Certificate category <RequiredMark />
        <input
          name="category"
          list={listId}
          required
          minLength={2}
          maxLength={120}
          placeholder="For example, Prefect or Sports"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <datalist id={listId}>
          {categories.map((category) => <option key={category} value={category} />)}
        </datalist>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Certificate title <RequiredMark />
        <input
          name="title"
          required
          minLength={3}
          maxLength={160}
          placeholder="Certificate of Achievement"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Achievement or citation <RequiredMark />
        <textarea
          name="achievement"
          required
          minLength={6}
          maxLength={2000}
          rows={4}
          placeholder="Describe the achievement being recognized."
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Issue date <RequiredMark />
        <input
          type="date"
          name="issuedAt"
          required
          defaultValue={issueDate}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && state.certificatePublicId && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>{state.message}</p>
          <Link
            href={`/admin/academics/certificates/${state.certificatePublicId}/print?academicYearId=${academicYearId}`}
            className="mt-1 inline-flex font-semibold underline underline-offset-2"
          >
            View and print the certificate
          </Link>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="submit"
          disabled={pending || students.length === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Issuing..." : "Issue certificate"}
        </button>
      </div>
    </form>
  );
}
