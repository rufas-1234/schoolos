"use client";

import { useActionState } from "react";
import { AdminConfirmSubmitButton } from "@/components/admin-data-table";
import { AccountTemporaryPassword } from "@/components/account-temporary-password";
import { transitionStudentStatusAction } from "./actions";

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
  const [state, actionHandler, pending] = useActionState(transitionStudentStatusAction, {});
  const action = nextStatus === "active"
    ? currentStatus === "inactive" || currentStatus === "disabled" ? "reactivate" : "enroll"
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
    <form action={actionHandler} className="space-y-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <AdminConfirmSubmitButton
        label={`${label} ${studentName}`}
        buttonText={pending ? "Saving..." : label}
        confirmationTitle={`Confirm ${label.toLowerCase()}`}
        confirmationMessage={`Are you sure you want to ${action} ${studentName}?`}
        variant={nextStatus === "rejected" || nextStatus === "inactive" || nextStatus === "disabled" ? "danger" : "primary"}
        disabled={pending}
      />
      {state.error && <p role="alert" className="text-xs text-rose-700">{state.error}</p>}
      {state.temporaryCredentials?.map((credential) => (
        <AccountTemporaryPassword key={credential.admissionNumber} username={credential.admissionNumber} password={credential.password} />
      ))}
    </form>
  );
}
