"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
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
