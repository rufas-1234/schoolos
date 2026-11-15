"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  schools,
  user,
  userRoles,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type RoleActionState = { error?: string; success?: boolean };

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function permissionIds(formData: FormData) {
  return formData.getAll("permissionIds").filter((entry): entry is string => typeof entry === "string");
}

function roleIds(formData: FormData) {
  return formData.getAll("roleIds").filter((entry): entry is string => typeof entry === "string");
}

export async function createSchoolRole(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(255),
    permissionIds: z.array(z.string().regex(/^\d+$/).transform(Number))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
  }).safeParse({
    name: value(formData, "name"),
    description: value(formData, "description"),
    permissionIds: permissionIds(formData),
  });
  if (!parsed.success) {
    return { error: "Enter a role name and select at least one unique permission." };
  }
  const selectedPermissions = await db.select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.id, parsed.data.permissionIds));
  if (selectedPermissions.length !== parsed.data.permissionIds.length) {
    return { error: "One or more selected permissions are unavailable." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(roles).values({
        schoolId: context.schoolId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        isSystem: false,
      });
      const [createdRole] = await tx.select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.schoolId, context.schoolId), eq(roles.name, parsed.data.name)))
        .limit(1);
      if (!createdRole) throw new Error("The new role could not be loaded.");
      await tx.insert(rolePermissions).values(
        selectedPermissions.map((permission) => ({
          roleId: createdRole.id,
          permissionId: permission.id,
        })),
      );
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "roles.created",
        resourceType: "role",
        resourcePublicId: String(createdRole.id),
        changedFields: ["name", "description", "permissions"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A role with that name already exists." };
    throw error;
  }

  revalidatePath("/admin/settings/roles");
  return { success: true };
}

export async function updateSchoolRole(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const parsed = z.object({
    id: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(255),
    permissionIds: z.array(z.string().regex(/^\d+$/).transform(Number))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
  }).safeParse({
    id: value(formData, "id"),
    name: value(formData, "name"),
    description: value(formData, "description"),
    permissionIds: permissionIds(formData),
  });
  if (!parsed.success) {
    return { error: "Enter a role name and select at least one unique permission." };
  }
  const selectedPermissions = await db.select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.id, parsed.data.permissionIds));
  if (selectedPermissions.length !== parsed.data.permissionIds.length) {
    return { error: "One or more selected permissions are unavailable." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx.select({
        id: roles.id,
      }).from(roles).where(and(
        eq(roles.id, parsed.data.id),
        eq(roles.schoolId, context.schoolId),
      )).for("update").limit(1);
      if (!existing) return "not-found";

      const assignedToCurrentUser = await tx.select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(and(
          eq(userRoles.membershipId, context.membershipId),
          eq(userRoles.roleId, existing.id),
        ))
        .limit(1);
      const retainsRoleManagement = selectedPermissions.some(
        (permission) => permission.key === "roles.manage",
      );
      if (assignedToCurrentUser.length && !retainsRoleManagement) {
        const [otherManagementRole] = await tx.select({ id: roles.id })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(and(
            eq(userRoles.membershipId, context.membershipId),
            ne(userRoles.roleId, existing.id),
            eq(roles.schoolId, context.schoolId),
            eq(permissions.key, "roles.manage"),
          ))
          .limit(1);
        if (!otherManagementRole) return "cannot-remove-own-access";
      }

      await tx.update(roles).set({
        name: parsed.data.name,
        description: parsed.data.description || null,
      }).where(eq(roles.id, existing.id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, existing.id));
      await tx.insert(rolePermissions).values(
        selectedPermissions.map((permission) => ({
          roleId: existing.id,
          permissionId: permission.id,
        })),
      );
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "roles.updated",
        resourceType: "role",
        resourcePublicId: String(existing.id),
        changedFields: ["name", "description", "permissions"],
      });
      return "updated";
    });
    if (outcome === "not-found") return { error: "That role was not found in this school." };
    if (outcome === "cannot-remove-own-access") {
      return { error: "Keep the role-management permission on this role or another role assigned to you." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A role with that name already exists." };
    throw error;
  }

  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteSchoolRole(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const id = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe())
    .safeParse(value(formData, "id"));
  if (!id.success) return { error: "Choose a valid role." };

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx.select({
      id: roles.id,
      isSystem: roles.isSystem,
    }).from(roles).where(and(
      eq(roles.id, id.data),
      eq(roles.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!existing) return "not-found";
    if (existing.isSystem) return "system-role";

    const [assignment] = await tx.select({ membershipId: userRoles.membershipId })
      .from(userRoles)
      .where(eq(userRoles.roleId, existing.id))
      .limit(1);
    if (assignment) return "in-use";

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, existing.id));
    await tx.delete(roles).where(and(
      eq(roles.id, existing.id),
      eq(roles.schoolId, context.schoolId),
    ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "roles.deleted",
      resourceType: "role",
      resourcePublicId: String(existing.id),
      changedFields: ["name", "description", "permissions"],
    });
    return "deleted";
  });

  if (outcome === "not-found") return { error: "That role was not found in this school." };
  if (outcome === "system-role") return { error: "System roles cannot be deleted." };
  if (outcome === "in-use") return { error: "Unassign this role from all accounts before deleting it." };
  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin");
  return { success: true };
}

export async function assignSchoolRoles(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const parsed = z.object({
    userId: z.string().uuid(),
    roleIds: z.array(z.string().regex(/^\d+$/).transform(Number))
      .refine((ids) => new Set(ids).size === ids.length),
  }).safeParse({
    userId: value(formData, "userId"),
    roleIds: roleIds(formData),
  });
  if (!parsed.success) return { error: "Choose an active school account and valid roles." };

  const outcome = await db.transaction(async (tx) => {
    const [membership] = await tx.select({
      id: schoolMemberships.id,
      userName: user.name,
    }).from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(schoolMemberships.userId, parsed.data.userId),
        eq(schoolMemberships.status, "active"),
        eq(user.isActive, true),
      )).for("update")
      .limit(1);
    if (!membership) return "account-not-found";

    const selectedRoles = parsed.data.roleIds.length
      ? await tx.select({ id: roles.id }).from(roles).where(and(
        eq(roles.schoolId, context.schoolId),
        inArray(roles.id, parsed.data.roleIds),
      ))
      : [];
    if (selectedRoles.length !== parsed.data.roleIds.length) return "invalid-role";

    if (parsed.data.userId === context.user.id) {
      const [adminRole] = selectedRoles.length
        ? await tx.select({ id: roles.id })
          .from(roles)
          .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(and(
            eq(roles.schoolId, context.schoolId),
            inArray(roles.id, selectedRoles.map((role) => role.id)),
            eq(permissions.key, "roles.manage"),
          ))
          .limit(1)
        : [];
      if (!adminRole) return "cannot-remove-own-access";
    }

    await tx.delete(userRoles).where(eq(userRoles.membershipId, membership.id));
    if (selectedRoles.length) {
      await tx.insert(userRoles).values(
        selectedRoles.map((role) => ({ membershipId: membership.id, roleId: role.id })),
      );
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "roles.assigned",
      resourceType: "school_membership",
      resourcePublicId: String(membership.id),
      changedFields: ["roles"],
    });
    return "saved";
  });

  if (outcome === "account-not-found") return { error: "The active account was not found in this school." };
  if (outcome === "invalid-role") return { error: "Select roles that belong to this school." };
  if (outcome === "cannot-remove-own-access") {
    return { error: "Keep at least one role that grants you permission to manage roles." };
  }
  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin");
  return { success: true };
}

export async function setSchoolAccountAccess(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const parsed = z.object({
    membershipId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
    status: z.enum(["active", "inactive"]),
  }).safeParse({
    membershipId: value(formData, "membershipId"),
    status: value(formData, "status"),
  });
  if (!parsed.success) return { error: "Choose a valid school account access status." };

  const outcome = await db.transaction(async (tx) => {
    const [school] = await tx.select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, context.schoolId))
      .for("update")
      .limit(1);
    if (!school) return "not-found";
    const [membership] = await tx.select({
      id: schoolMemberships.id,
      userId: schoolMemberships.userId,
      status: schoolMemberships.status,
    }).from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.id, parsed.data.membershipId),
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(user.isActive, true),
      ))
      .for("update")
      .limit(1);
    if (!membership) return "not-found";
    if (membership.userId === context.user.id && parsed.data.status === "inactive") {
      return "cannot-disable-self";
    }
    if (membership.status === "active" && parsed.data.status === "inactive") {
      const [anotherRoleManager] = await tx.select({ membershipId: schoolMemberships.id })
        .from(schoolMemberships)
        .innerJoin(user, eq(schoolMemberships.userId, user.id))
        .innerJoin(userRoles, eq(userRoles.membershipId, schoolMemberships.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(and(
          eq(schoolMemberships.schoolId, context.schoolId),
          eq(schoolMemberships.status, "active"),
          eq(user.isActive, true),
          ne(schoolMemberships.id, membership.id),
          eq(roles.schoolId, context.schoolId),
          eq(permissions.key, "roles.manage"),
        ))
        .limit(1);
      if (!anotherRoleManager) return "last-role-manager";
    }

    await tx.update(schoolMemberships)
      .set({ status: parsed.data.status })
      .where(and(
        eq(schoolMemberships.id, membership.id),
        eq(schoolMemberships.schoolId, context.schoolId),
      ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "roles.login_access.updated",
      resourceType: "school_membership",
      resourcePublicId: String(membership.id),
      changedFields: ["status"],
    });
    return "updated";
  });

  if (outcome === "not-found") return { error: "The active account was not found in this school." };
  if (outcome === "cannot-disable-self") {
    return { error: "You cannot disable your own access to this school." };
  }
  if (outcome === "last-role-manager") {
    return { error: "Keep at least one other active account with role-management permission." };
  }
  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin");
  return { success: true };
}
