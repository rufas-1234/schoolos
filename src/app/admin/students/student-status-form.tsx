"use client";

import { transitionStudentStatus } from "./actions";

export function StudentStatusForm({
  publicId,
  studentName,
  currentStatus,
  nextStatus,
}: {
  publicId: string;
  studentName: string;
  currentStatus: string;
  nextStatus: string;
}) {
  const action = nextStatus === "active"
    ? currentStatus === "inactive" || currentStatus === "disabled" ? "activate" : "enroll"
    : nextStatus === "disabled"
      ? "disable"
      : nextStatus === "inactive"
        ? "deactivate"
        : nextStatus === "admitted"
          ? "approve the admission of"
          : nextStatus === "rejected"
            ? "reject the admission of"
            : "reopen the admission of";
  const label = nextStatus === "admitted"
    ? "Approve"
    : nextStatus === "rejected"
      ? "Reject"
      : nextStatus === "active"
        ? currentStatus === "inactive" || currentStatus === "disabled" ? "Reactivate" : "Enroll"
        : nextStatus === "inactive"
          ? "Deactivate"
          : nextStatus === "disabled"
            ? "Disable"
            : "Reopen";

  return (
    <form action={transitionStudentStatus}>
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm(`Are you sure you want to ${action} ${studentName}?`)) {
            event.preventDefault();
          }
        }}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          nextStatus === "rejected" || nextStatus === "inactive" || nextStatus === "disabled"
            ? "border border-slate-200 text-slate-600 hover:bg-slate-100"
            : "bg-violet-700 text-white hover:bg-violet-800"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
