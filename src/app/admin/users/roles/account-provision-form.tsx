"use client";

import { useActionState, useMemo, useState } from "react";
import { createSchoolAccount, type RoleActionState } from "../../settings/role-actions";
import { getStudentRoleId } from "@/lib/account-provisioning-policy";

type ProfileOption = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  admissionNumber?: string | null;
  childName?: string;
};

type RoleOption = { id: number; name: string };

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white";

export function AccountProvisionForm({
  staff,
  students,
  parents,
  roles,
  suggestedRoleId,
}: {
  staff: ProfileOption[];
  students: ProfileOption[];
  parents: ProfileOption[];
  roles: RoleOption[];
  suggestedRoleId?: number;
}) {
  const [state, action, pending] = useActionState<RoleActionState, FormData>(createSchoolAccount, {});
  const [personType, setPersonType] = useState<"staff" | "student" | "parent">("staff");
  const [recordId, setRecordId] = useState("");
  const [parentLogin, setParentLogin] = useState<"email" | "phone">("email");
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>(
    suggestedRoleId ? [suggestedRoleId] : [],
  );
  const studentRoleId = getStudentRoleId(roles);
  const profiles = personType === "staff" ? staff : personType === "student" ? students : parents;
  const selectedParent = useMemo(
    () => parents.find((profile) => String(profile.id) === recordId),
    [parents, recordId],
  );
  const parentHasEmail = Boolean(selectedParent?.email?.trim());
  const parentHasPhone = Boolean(selectedParent?.phone?.trim());

  return (
    <form action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-slate-900">Create a login account</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">
          Select an existing school profile, create a password, and assign its school roles.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Account type
        <select
          name="personType"
          value={personType}
          onChange={(event) => {
            const nextType = event.target.value as "staff" | "student" | "parent";
            setPersonType(nextType);
            setRecordId("");
            if (nextType === "student" && studentRoleId !== null) {
              setSelectedRoleIds((current) => current.includes(studentRoleId) ? current : [...current, studentRoleId]);
            } else if (personType === "student" && studentRoleId !== null) {
              setSelectedRoleIds((current) => current.filter((id) => id !== studentRoleId));
            }
          }}
          className={fieldClass}
        >
          <option value="staff">Staff / teacher</option>
          <option value="student">Student</option>
          <option value="parent">Parent / guardian</option>
        </select>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        {personType === "staff" ? "Active staff profile" : personType === "student" ? "Active student profile" : "Parent or guardian profile"}
        <select
          name="recordId"
          required
          value={recordId}
          onChange={(event) => {
            const nextRecordId = event.target.value;
            setRecordId(nextRecordId);
            const nextParent = parents.find((profile) => String(profile.id) === nextRecordId);
            if (!nextParent?.email?.trim() && nextParent?.phone?.trim()) setParentLogin("phone");
            else setParentLogin("email");
          }}
          className={fieldClass}
        >
          <option value="">Select a profile</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
              {personType === "staff" && profile.email ? ` · ${profile.email}` : ""}
              {personType === "student" && profile.admissionNumber ? ` · ${profile.admissionNumber}` : ""}
              {personType === "parent" ? ` · guardian of ${profile.childName}` : ""}
              {personType === "parent" && profile.email ? ` · ${profile.email}` : ""}
              {personType === "parent" && profile.phone ? ` · ${profile.phone}` : ""}
            </option>
          ))}
        </select>
        {profiles.length === 0 && (
          <span className="block text-xs font-normal text-slate-500">
            No eligible profiles are available for this account type.
          </span>
        )}
      </label>
      {personType === "staff" && (
        <p className="rounded-xl bg-violet-50 px-3 py-2.5 text-xs leading-5 text-violet-900">
          Staff sign in with their profile email; a valid phone number on the profile will also work. Teachers must also have the Teacher role and teaching assignments.
        </p>
      )}
      {personType === "student" && (
        <p className="rounded-xl bg-violet-50 px-3 py-2.5 text-xs leading-5 text-violet-900">
          Students sign in with their admission number. Student portal access is linked to the selected student record.
        </p>
      )}
      {personType === "parent" && (
        <>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Parent login identifier
            <select
              name="parentLogin"
              value={parentLogin}
              onChange={(event) => setParentLogin(event.target.value as "email" | "phone")}
              className={fieldClass}
            >
              <option value="email" disabled={!parentHasEmail}>Email{parentHasEmail ? ` · ${selectedParent?.email}` : " (not on profile)"}</option>
              <option value="phone" disabled={!parentHasPhone}>Phone{parentHasPhone ? ` · ${selectedParent?.phone}` : " (not on profile)"}</option>
            </select>
          </label>
          <p className="rounded-xl bg-violet-50 px-3 py-2.5 text-xs leading-5 text-violet-900">
            The parent portal will show active children whose guardian contact matches the selected profile.
          </p>
        </>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Assign school roles</legend>
        {suggestedRoleId && roles.find((role) => role.id === suggestedRoleId) && (
          <p className="text-xs text-violet-800">
            {roles.find((role) => role.id === suggestedRoleId)?.name} is preselected for this caretaker account.
          </p>
        )}
        {personType === "student" && studentRoleId !== null && (
          <p className="text-xs text-slate-500">
            {selectedRoleIds.includes(studentRoleId)
              ? "The Student role is selected. Add any other roles this account needs."
              : "Select the Student role to enable student access. Add any other roles this account needs."}
          </p>
        )}
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="roleIds"
                value={role.id}
                checked={selectedRoleIds.includes(role.id)}
                onChange={(event) => {
                  setSelectedRoleIds((current) =>
                    event.target.checked
                      ? [...current, role.id]
                      : current.filter((id) => id !== role.id),
                  );
                }}
                className="accent-violet-700"
              />
              {role.name}
            </label>
          ))}
          {roles.length === 0 && <p className="text-sm text-slate-500">Create a role before provisioning an account.</p>}
        </div>
      </fieldset>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Create password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          className={fieldClass}
        />
        <span className="block text-xs font-normal text-slate-500">Use at least 12 characters. Passwords are stored as secure hashes.</span>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Confirm password
        <input
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          className={fieldClass}
        />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message ?? "Account created and linked successfully."}</p>}
      <button
        disabled={pending || roles.length === 0 || profiles.length === 0}
        className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
