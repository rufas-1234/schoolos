"use client";

import { useActionState } from "react";
import {
  assignSchoolRoles,
  createSchoolRole,
  deleteSchoolRole,
  updateSchoolRole,
  type RoleActionState,
} from "./role-actions";

type PermissionOption = { id: number; key: string; description: string };
type RoleOption = { id: number; name: string };
type EditableRole = {
  id: number;
  name: string;
  description: string | null;
  permissionIds: number[];
};

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white";

export function CreateRoleForm({ permissions }: { permissions: PermissionOption[] }) {
  const [state, action, pending] = useActionState(createSchoolRole, {});
  return (
    <form action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-slate-900">Create a role</h2>
        <p className="mt-1 text-sm text-slate-500">Choose only the access this role needs.</p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Role name
        <input name="name" required minLength={2} maxLength={80} className={fieldClass} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Description
        <textarea name="description" rows={2} maxLength={255} className={fieldClass} />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">Permissions</legend>
        {permissions.map((permission) => (
          <label key={permission.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm">
            <input type="checkbox" name="permissionIds" value={permission.id} className="mt-1 accent-violet-700" />
            <span>
              <span className="block font-medium text-slate-800">{permission.description}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{permission.key}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
        {pending ? "Creating..." : "Create role"}
      </button>
    </form>
  );
}

export function EditRoleForm({
  role,
  permissions,
}: {
  role: EditableRole;
  permissions: PermissionOption[];
}) {
  const [state, action, pending] = useActionState(updateSchoolRole, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={role.id} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Role name
        <input name="name" required minLength={2} maxLength={80} defaultValue={role.name} className={fieldClass} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Description
        <textarea name="description" rows={2} maxLength={255} defaultValue={role.description ?? ""} className={fieldClass} />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">Permissions</legend>
        {permissions.map((permission) => (
          <label key={permission.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm">
            <input
              type="checkbox"
              name="permissionIds"
              value={permission.id}
              defaultChecked={role.permissionIds.includes(permission.id)}
              className="mt-1 accent-violet-700"
            />
            <span>
              <span className="block font-medium text-slate-800">{permission.description}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{permission.key}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function DeleteRoleForm({ roleId, roleName }: { roleId: number; roleName: string }) {
  const [state, action, pending] = useActionState(deleteSchoolRole, {});
  return (
    <form action={action} className="inline-flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={roleId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (!window.confirm(`Delete the ${roleName} role? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function AccountRolesForm({
  userId,
  currentRoleIds,
  roles,
}: {
  userId: string;
  currentRoleIds: number[];
  roles: RoleOption[];
}) {
  const [state, action, pending] = useActionState(assignSchoolRoles, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="roleIds"
              value={role.id}
              defaultChecked={currentRoleIds.includes(role.id)}
              className="accent-violet-700"
            />
            {role.name}
          </label>
        ))}
      </div>
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {pending ? "Saving..." : "Save role assignments"}
      </button>
    </form>
  );
}

function ActionFeedback({ state }: { state: RoleActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-rose-600">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>;
  return null;
}
