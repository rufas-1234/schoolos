"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  account as authAccount,
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  schools,
  staffMembers,
  students,
  user,
  userLoginIdentifiers,
  userRoles,
  userStudentLinks,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolAccountInputSchema } from "@/lib/account-provisioning-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  normalizePhoneIdentifier,
  shouldSkipConflictingLoginIdentifier,
} from "@/lib/login-identifier-policy";

export type RoleActionState = { error?: string; success?: boolean; message?: string };

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

function generatedAccountEmail(kind: "student" | "parent", schoolId: number, recordId: number) {
  return `${kind}-${schoolId}-${recordId}@accounts.schoolos.invalid`;
}

export async function createSchoolAccount(
  _previousState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const context = await requireSchoolPermission("roles.manage");
  const parsed = schoolAccountInputSchema.safeParse({
    personType: value(formData, "personType"),
    recordId: value(formData, "recordId"),
    parentLogin: value(formData, "parentLogin"),
    password: value(formData, "password"),
    passwordConfirmation: value(formData, "passwordConfirmation"),
    roleIds: roleIds(formData),
  });
  if (!parsed.success) {
    return { error: "Choose a profile, select at least one school role, and enter matching passwords of at least 12 characters." };
  }

  const selectedRoles = await db.select({ id: roles.id })
    .from(roles)
    .where(and(
      eq(roles.schoolId, context.schoolId),
      inArray(roles.id, parsed.data.roleIds),
    ));
  if (selectedRoles.length !== parsed.data.roleIds.length) {
    return { error: "One or more selected roles are unavailable for this school." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  let phoneIdentifierUnavailable = false;
  try {
    const outcome = await db.transaction(async (tx) => {
      let name = "";
      let email = "";
      let identifier: string | null = null;
      let identifierKind = "";
      let linkedStaffId: number | null = null;
      let linkedStudentIds: number[] = [];

      if (parsed.data.personType === "staff") {
        const [staff] = await tx.select({
          id: staffMembers.id,
          firstName: staffMembers.firstName,
          lastName: staffMembers.lastName,
          email: staffMembers.email,
          phone: staffMembers.phone,
          linkedUserId: staffMembers.linkedUserId,
        }).from(staffMembers)
          .where(and(
            eq(staffMembers.id, parsed.data.recordId),
            eq(staffMembers.schoolId, context.schoolId),
            eq(staffMembers.status, "active"),
          ))
          .for("update")
          .limit(1);
        if (!staff) return "profile-not-found";
        if (staff.linkedUserId) return "profile-linked";
        if (!staff.email?.trim()) return "email-required";
        name = `${staff.firstName} ${staff.lastName}`;
        email = staff.email.trim().toLowerCase();
        linkedStaffId = staff.id;
        if (staff.phone?.trim()) {
          identifier = normalizePhoneIdentifier(staff.phone);
          if (!identifier) return "invalid-phone";
          identifierKind = "staff_phone";
        }
      } else if (parsed.data.personType === "student") {
        const [student] = await tx.select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNumber: students.admissionNumber,
        }).from(students)
          .where(and(
            eq(students.id, parsed.data.recordId),
            eq(students.schoolId, context.schoolId),
            inArray(students.status, ["admitted", "active"]),
          ))
          .for("update")
          .limit(1);
        if (!student) return "profile-not-found";
        if (!student.admissionNumber?.trim()) return "admission-required";
        name = `${student.firstName} ${student.lastName}`;
        email = generatedAccountEmail("student", context.schoolId, student.id);
        identifier = student.admissionNumber.trim().toLocaleUpperCase();
        identifierKind = "student_admission";
        linkedStudentIds = [student.id];
      } else {
        const [student] = await tx.select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          guardianName: students.guardianName,
          guardianEmail: students.guardianEmail,
          guardianPhone: students.guardianPhone,
        }).from(students)
          .where(and(
            eq(students.id, parsed.data.recordId),
            eq(students.schoolId, context.schoolId),
            inArray(students.status, ["admitted", "active"]),
          ))
          .for("update")
          .limit(1);
        if (!student) return "profile-not-found";
        const loginType = parsed.data.parentLogin;
        if (loginType === "email" && student.guardianEmail?.trim()) {
          email = student.guardianEmail.trim().toLowerCase();
          identifier = email;
          identifierKind = "parent_email";
        } else if (loginType === "phone" && student.guardianPhone?.trim()) {
          identifier = normalizePhoneIdentifier(student.guardianPhone);
          if (!identifier) return "invalid-phone";
          email = generatedAccountEmail("parent", context.schoolId, student.id);
          identifierKind = "parent_phone";
        } else {
          return "parent-contact-required";
        }
        name = student.guardianName?.trim() || `Parent of ${student.firstName} ${student.lastName}`;
        const matchingStudents = await tx.select({ id: students.id })
          .from(students)
          .where(and(
            eq(students.schoolId, context.schoolId),
            inArray(students.status, ["admitted", "active"]),
            loginType === "email"
              ? eq(students.guardianEmail, student.guardianEmail!)
              : eq(students.guardianPhone, student.guardianPhone!),
          ));
        linkedStudentIds = [...new Set([student.id, ...matchingStudents.map(({ id }) => id)])];
      }

      if (identifier) {
        const [existingIdentifier] = await tx.select({
          id: userLoginIdentifiers.id,
          userId: userLoginIdentifiers.userId,
          kind: userLoginIdentifiers.kind,
        })
          .from(userLoginIdentifiers)
          .where(and(
            eq(userLoginIdentifiers.schoolId, context.schoolId),
            eq(userLoginIdentifiers.identifier, identifier),
          ))
          .limit(1);
        if (existingIdentifier) {
          if (parsed.data.personType === "student" && existingIdentifier.kind === "student_admission") {
            const [existingStudentLink] = await tx.select({ studentId: userStudentLinks.studentId })
              .from(userStudentLinks)
              .where(and(
                eq(userStudentLinks.schoolId, context.schoolId),
                eq(userStudentLinks.userId, existingIdentifier.userId),
                eq(userStudentLinks.studentId, parsed.data.recordId),
                eq(userStudentLinks.accessType, "student"),
              ))
              .limit(1);
            if (existingStudentLink) return "student-account-exists";
          }
          if (shouldSkipConflictingLoginIdentifier(parsed.data.personType, existingIdentifier.kind)) {
            identifier = null;
            phoneIdentifierUnavailable = true;
          } else {
            return "identifier-in-use";
          }
        }
      }
      const [existingEmail] = await tx.select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (existingEmail) return "email-in-use";

      const userId = randomUUID();
      await tx.insert(user).values({
        id: userId,
        name,
        email,
        emailVerified: false,
        isActive: true,
      });
      await tx.insert(authAccount).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });
      await tx.insert(schoolMemberships).values({
        schoolId: context.schoolId,
        userId,
        status: "active",
      });
      const [membership] = await tx.select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .where(and(
          eq(schoolMemberships.schoolId, context.schoolId),
          eq(schoolMemberships.userId, userId),
        ))
        .limit(1);
      if (!membership) throw new Error("The new school account membership could not be loaded.");
      await tx.insert(userRoles).values(selectedRoles.map((role) => ({
        membershipId: membership.id,
        roleId: role.id,
      })));
      if (identifier) {
        await tx.insert(userLoginIdentifiers).values({
          schoolId: context.schoolId,
          userId,
          kind: identifierKind,
          identifier,
        });
      }
      if (linkedStaffId !== null) {
        await tx.update(staffMembers)
          .set({ linkedUserId: userId })
          .where(and(
            eq(staffMembers.id, linkedStaffId),
            eq(staffMembers.schoolId, context.schoolId),
          ));
      }
      if (linkedStudentIds.length) {
        await tx.insert(userStudentLinks).values(linkedStudentIds.map((studentId) => ({
          schoolId: context.schoolId,
          userId,
          studentId,
          accessType: parsed.data.personType,
        })));
      }
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "school_account.created",
        resourceType: "user",
        resourcePublicId: userId,
        changedFields: [
          "user",
          "credential.password",
          "schoolMembership",
          "roles",
          ...(identifier ? ["loginIdentifier"] : []),
          ...(linkedStaffId !== null ? ["staffMember.linkedUserId"] : []),
          ...(linkedStudentIds.length ? ["studentLinks"] : []),
        ],
      });
      return "created";
    });

    if (outcome === "profile-not-found") return { error: "That active profile was not found in this school." };
    if (outcome === "profile-linked") return { error: "That staff profile is already linked to a login account." };
    if (outcome === "email-required") return { error: "Add an email address to the staff profile before creating its login." };
    if (outcome === "admission-required") return { error: "Add an admission number to the student profile before creating its login." };
    if (outcome === "parent-contact-required") return { error: "The selected parent login method is not available on this student profile." };
    if (outcome === "invalid-phone") return { error: "The profile phone number must include 7–15 digits to be used for login." };
    if (outcome === "student-account-exists") {
      revalidatePath("/admin/users");
      revalidatePath("/admin/users/roles");
      return {
        success: true,
        message: "This student already has a login account linked. No duplicate account was created.",
      };
    }
    if (outcome === "identifier-in-use") {
      return parsed.data.personType === "student"
        ? { error: "That admission number is already used by another login in this school. Check the existing account or correct the student record." }
        : { error: "That login identifier is already assigned to an account in this school." };
    }
    if (outcome === "email-in-use") return { error: "An account already uses this email. Assign roles from the existing account instead." };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "An account or login identifier already exists for that profile. Refresh the page and check the account directory." };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  revalidatePath("/admin/staff");
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
  return phoneIdentifierUnavailable
    ? {
      success: true,
      message: "Account created and linked successfully. The phone number is already used by another login, so this staff account must sign in with its profile email.",
    }
    : { success: true };
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

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  return { success: true };
}

export async function createCaretakerRoles(
  _previousState: RoleActionState,
  _formData: FormData,
): Promise<RoleActionState> {
  void _previousState;
  void _formData;
  const context = await requireSchoolPermission("roles.manage");
  const templates = [
    {
      name: "Dormitory Caretaker",
      description: "Manage dormitories, rooms, and student room assignments.",
      permissionKey: "dormitories.manage",
    },
    {
      name: "Library Caretaker",
      description: "Manage library books, memberships, and book lending.",
      permissionKey: "library.manage",
    },
  ] as const;
  const created: string[] = [];
  const updated: string[] = [];
  const alreadyPresent: string[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const template of templates) {
        const [permission] = await tx.select({ id: permissions.id }).from(permissions)
          .where(eq(permissions.key, template.permissionKey)).limit(1);
        if (!permission) {
          throw new Error(`The required permission ${template.permissionKey} is not available.`);
        }
        const [existingRole] = await tx.select({ id: roles.id }).from(roles).where(and(
          eq(roles.schoolId, context.schoolId),
          eq(roles.name, template.name),
        )).limit(1);
        if (existingRole) {
          const [existingPermission] = await tx.select({ roleId: rolePermissions.roleId })
            .from(rolePermissions).where(and(
              eq(rolePermissions.roleId, existingRole.id),
              eq(rolePermissions.permissionId, permission.id),
            )).limit(1);
          if (existingPermission) {
            alreadyPresent.push(template.name);
            continue;
          }
          await tx.insert(rolePermissions).values({
            roleId: existingRole.id,
            permissionId: permission.id,
          });
          await tx.insert(auditLogs).values({
            schoolId: context.schoolId,
            actorUserId: context.user.id,
            action: "roles.updated",
            resourceType: "role",
            resourcePublicId: String(existingRole.id),
            changedFields: ["permissions"],
          });
          updated.push(template.name);
          continue;
        }
        await tx.insert(roles).values({
          schoolId: context.schoolId,
          name: template.name,
          description: template.description,
          isSystem: false,
        });
        const [role] = await tx.select({ id: roles.id }).from(roles).where(and(
          eq(roles.schoolId, context.schoolId),
          eq(roles.name, template.name),
        )).limit(1);
        if (!role) throw new Error(`The ${template.name} role could not be loaded.`);
        await tx.insert(rolePermissions).values({ roleId: role.id, permissionId: permission.id });
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "roles.created",
          resourceType: "role",
          resourcePublicId: String(role.id),
          changedFields: ["name", "description", "permissions"],
        });
        created.push(template.name);
      }
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "A caretaker role was created at the same time. Refresh the page and check the role list." };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  const changes = [
    created.length ? `Created: ${created.join(", ")}.` : "",
    updated.length ? `Added the required module access to: ${updated.join(", ")}.` : "",
    alreadyPresent.length ? `Already configured: ${alreadyPresent.join(", ")}.` : "",
  ].filter(Boolean);
  const message = changes.join(" ") || "Caretaker roles are ready.";
  return { success: true, message };
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

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
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
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
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
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
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
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
  revalidatePath("/admin");
  return { success: true };
}
