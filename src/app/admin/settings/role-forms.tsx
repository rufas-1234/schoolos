"use client";

import { useActionState, useMemo, useState } from "react";
import { AdminConfirmSubmitButton, AdminDeleteButton } from "@/components/admin-data-table";
import {
  assignSchoolRoles,
  createSchoolRole,
  deleteSchoolRole,
  setSchoolAccountAccess,
  updateSchoolRole,
  type RoleActionState,
} from "./role-actions";

type PermissionOption = { id: number; key: string; description: string };
type RoleOption = { id: number; name: string; categories: string[] };
type SchoolAccount = {
  membershipId: number;
  userId: string;
  name: string;
  email: string;
  membershipStatus: string;
  currentRoleIds: number[];
};
type EditableRole = {
  id: number;
  name: string;
  description: string | null;
  permissionIds: number[];
};

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white";
const permissionCategoryLabels: Record<string, string> = {
  accounts: "Accounts",
  academics: "Academics",
  dashboard: "Dashboard",
  examinations: "Examinations",
  fees: "Fees",
  inventory: "Inventory",
  library: "Library",
  payments: "Payments",
  results: "Results",
  roles: "Users & access",
  school: "School settings",
  staff: "Human resources",
  students: "Students",
};

function groupPermissions(permissions: PermissionOption[]) {
  const grouped = new Map<string, PermissionOption[]>();
  for (const permission of permissions) {
    const category = permissionCategoryLabels[permission.key.split(".")[0]] ?? "Other permissions";
    grouped.set(category, [...(grouped.get(category) ?? []), permission]);
  }
  return [...grouped].sort(([first], [second]) => first.localeCompare(second));
}

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
      <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-sm font-semibold text-slate-700">Permissions by category</p>
        {groupPermissions(permissions).map(([category, items]) => (
          <fieldset key={category} className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-800">{category}</legend>
            {items.map((permission) => (
              <label key={permission.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm">
                <input type="checkbox" name="permissionIds" value={permission.id} className="mt-1 accent-violet-700" />
                <span>
                  <span className="block font-medium text-slate-800">{permission.description}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{permission.key}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
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
      <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        <p className="text-sm font-semibold text-slate-700">Permissions by category</p>
        {groupPermissions(permissions).map(([category, items]) => (
          <fieldset key={category} className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-800">{category}</legend>
            {items.map((permission) => (
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
        ))}
      </div>
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
      <AdminDeleteButton
        label={`Delete the ${roleName} role`}
        disabled={pending}
        showLabel
        buttonText={pending ? "Deleting..." : "Delete"}
      />
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
  const rolesByCategory = new Map<string, RoleOption[]>();
  for (const role of roles) {
    const category = role.categories[0] ?? "Other roles";
    rolesByCategory.set(category, [...(rolesByCategory.get(category) ?? []), role]);
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Individual role assignments</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Select a base role and any extra roles for this account. Permissions from selected roles are combined.
        </p>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-slate-100 p-3">
        {[...rolesByCategory].sort(([first], [second]) => first.localeCompare(second)).map(([category, categoryRoles]) => (
          <fieldset key={category} className="space-y-1.5">
            <legend className="text-xs font-bold uppercase tracking-wide text-violet-800">{category}</legend>
            {categoryRoles.map((role) => (
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
          </fieldset>
        ))}
      </div>
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {pending ? "Saving..." : "Save role assignments"}
      </button>
    </form>
  );
}

export function AccountRoleDirectory({
  accounts,
  roles,
}: {
  accounts: SchoolAccount[];
  roles: RoleOption[];
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const visibleAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return accounts.filter((account) =>
      (!normalizedQuery || `${account.name} ${account.email}`.toLocaleLowerCase().includes(normalizedQuery)) &&
      (!roleFilter || account.currentRoleIds.includes(Number(roleFilter))) &&
      (!accessFilter || account.membershipStatus === accessFilter),
    );
  }, [accessFilter, accounts, query, roleFilter]);

  return (
    <>
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(10rem,auto)]">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Search accounts
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or email"
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className={fieldClass}>
            <option value="">All roles</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          School access
          <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} className={fieldClass}>
            <option value="">All access statuses</option>
            <option value="active">Enabled</option>
            <option value="inactive">Disabled</option>
          </select>
        </label>
      </div>
      <p className="px-5 py-3 text-xs text-slate-500">{visibleAccounts.length} of {accounts.length} accounts</p>
      {visibleAccounts.length === 0 ? (
        <p className="px-5 pb-6 text-center text-sm text-slate-500">No accounts match these filters.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibleAccounts.map((account) => (
            <li key={account.membershipId} className="grid gap-4 p-5 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{account.name}</p>
                <p className="truncate text-sm text-slate-500">{account.email}</p>
                <p className={`mt-1 text-xs font-semibold ${account.membershipStatus === "active" ? "text-emerald-700" : "text-rose-700"}`}>
                  {account.membershipStatus === "active" ? "School access enabled" : "School access disabled"}
                </p>
                <div className="mt-3">
                  <SchoolAccountAccessForm
                    membershipId={account.membershipId}
                    enabled={account.membershipStatus === "active"}
                    userName={account.name}
                  />
                </div>
              </div>
              {account.membershipStatus === "active" ? (
                <AccountRolesForm
                  userId={account.userId}
                  currentRoleIds={account.currentRoleIds}
                  roles={roles}
                />
              ) : (
                <p className="self-center text-sm text-slate-500">Enable school access before assigning roles.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SchoolAccountAccessForm({
  membershipId,
  enabled,
  userName,
}: {
  membershipId: number;
  enabled: boolean;
  userName: string;
}) {
  const [state, action, pending] = useActionState(setSchoolAccountAccess, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="status" value={enabled ? "inactive" : "active"} />
      <AdminConfirmSubmitButton
        label={enabled ? `Disable ${userName}'s school access` : `Enable ${userName}'s school access`}
        buttonText={pending ? "Saving..." : enabled ? "Disable school access" : "Enable school access"}
        confirmationTitle={enabled ? "Confirm access deactivation" : "Confirm access activation"}
        confirmationMessage={enabled
          ? `Disable ${userName}'s access to this school? They will no longer be able to sign in to this school workspace.`
          : `Enable ${userName}'s access to this school?`}
        disabled={pending}
        variant={enabled ? "danger" : "primary"}
      />
      <ActionFeedback state={state} />
    </form>
  );
}

function ActionFeedback({ state }: { state: RoleActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-rose-600">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>;
  return null;
}
