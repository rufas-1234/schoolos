"use client";

import { AdminDeleteButton } from "@/components/admin-data-table";
import { ActionForm, Field, SelectField, type Option } from "../academics/academic-forms";
import {
  addStudentGroupMember,
  deleteStudentGroup,
  removeStudentGroupMember,
  saveStudentGroup,
} from "./group-actions";

export function StudentGroupForm({
  record,
}: {
  record?: { id: number; name: string; description: string | null };
}) {
  return (
    <ActionForm
      title={record ? "Edit student group" : "Create student group"}
      action={saveStudentGroup}
      submitLabel={record ? "Save group" : "Create group"}
      recordId={record?.id}
    >
      <Field label="Group name" name="name" placeholder="Science club" defaultValue={record?.name} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={record?.description ?? ""}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        />
      </label>
    </ActionForm>
  );
}

export function StudentGroupMembers({
  groupId,
  groupName,
  students,
  members,
}: {
  groupId: number;
  groupName: string;
  students: Option[];
  members: { membershipId: number; name: string; admissionNumber: string | null }[];
}) {
  return (
    <div className="space-y-5">
      {students.length > 0 && (
        <ActionForm
          title={`Add a student to ${groupName}`}
          action={addStudentGroupMember}
          submitLabel="Add student"
          recordId={groupId}
        >
          <SelectField label="Student" name="studentId" options={students} />
        </ActionForm>
      )}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Group members ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500">No students have been added to this group.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {members.map((member) => (
              <li key={member.membershipId} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{member.name}</span>
                  {member.admissionNumber && (
                    <span className="text-xs text-slate-500">{member.admissionNumber}</span>
                  )}
                </span>
                <form action={removeStudentGroupMember}>
                  <input type="hidden" name="membershipId" value={member.membershipId} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DeleteStudentGroupForm({ groupId, groupName }: { groupId: number; groupName: string }) {
  return (
    <form action={deleteStudentGroup}>
      <input type="hidden" name="recordId" value={groupId} />
      <AdminDeleteButton label={`Delete ${groupName} and its memberships`} />
    </form>
  );
}
