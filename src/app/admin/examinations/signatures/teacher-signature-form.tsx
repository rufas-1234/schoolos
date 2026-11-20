"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDataTable, AdminRecordDialog } from "@/components/admin-data-table";

type TeacherSignatureEntry = {
  teacherId: number;
  teacherName: string;
  jobTitle: string;
  signatureId?: number;
};

export function TeacherSignatureDirectory({ teachers }: { teachers: TeacherSignatureEntry[] }) {
  return (
    <AdminDataTable
      title="Teacher signatures"
      columns={[
        { key: "teacher", label: "Teacher" },
        { key: "jobTitle", label: "Job title" },
        { key: "signatureStatus", label: "Signature status" },
      ]}
      filters={[{
        key: "signatureFilter",
        label: "Signature status",
        options: [
          { value: "Uploaded", label: "Signature uploaded" },
          { value: "Missing", label: "Needs a signature" },
        ],
      }]}
      rows={teachers.map((teacher) => {
        const signatureStatus = teacher.signatureId === undefined ? "Missing" : "Uploaded";
        return {
          id: teacher.teacherId,
          values: {
            teacher: teacher.teacherName,
            jobTitle: teacher.jobTitle,
            signatureStatus,
            signatureFilter: signatureStatus,
          },
          searchableText: `${teacher.teacherName} ${teacher.jobTitle} ${signatureStatus}`,
          actions: (
            <AdminRecordDialog
              mode="edit"
              showLabel
              title={`${signatureStatus === "Missing" ? "Upload" : "Replace"} ${teacher.teacherName} signature`}
              triggerLabel={signatureStatus === "Missing" ? "Upload" : "Replace"}
            >
              <TeacherSignatureForm
                teacherId={teacher.teacherId}
                teacherName={teacher.teacherName}
                jobTitle={teacher.jobTitle}
                signatureId={teacher.signatureId}
              />
            </AdminRecordDialog>
          ),
        };
      })}
      emptyMessage="No teacher profiles are available."
      hideDefaultView
      showRowNumber={false}
      mobileCardView
    />
  );
}

export function TeacherSignatureForm({
  teacherId,
  teacherName,
  jobTitle,
  signatureId,
}: {
  teacherId: number;
  teacherName: string;
  jobTitle: string;
  signatureId?: number;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/examinations/teacher-signatures/${teacherId}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json() as { error?: string; success?: boolean };
      if (!response.ok || !result.success) {
        setError(result.error ?? "The teacher signature could not be uploaded.");
        return;
      }
      setMessage("Teacher signature uploaded.");
      form.reset();
      router.refresh();
    } catch {
      setError("The teacher signature could not be uploaded. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <article className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold text-slate-950">{teacherName}</h2>
    <p className="mt-1 text-sm text-slate-600">{jobTitle || "Teacher"} · This signature is reused wherever this teacher is assigned.</p>
    <p className="mt-1 text-xs text-slate-500">PNG, JPEG, or WebP up to 4 MB. Replacing it keeps the previous upload available for historical references.</p>
    {signatureId !== undefined && <div className="my-4 flex h-20 items-center rounded-lg border border-dashed border-slate-200 p-3">
      <Image src={`/api/admin/examinations/teacher-signatures/${teacherId}?signatureId=${signatureId}`} unoptimized width={220} height={72}
        alt={`${teacherName} signature`} className="max-h-16 w-auto max-w-full object-contain" />
    </div>}
    <form onSubmit={submit} className="mt-4 space-y-3">
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-700" />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <button disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Uploading..." : signatureId !== undefined ? "Replace signature" : "Upload signature"}
      </button>
    </form>
  </article>;
}
