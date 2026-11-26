"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  auditLogs,
  roles,
  rolePermissions,
  schoolCurrencies,
  schoolBranches,
  schoolMemberships,
  schools,
  staffMembers,
  students,
  teachers,
  uploadedFiles,
  userStudentLinks,
  userRoles,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isMultiSchoolEnabled, activeSchoolCookieName } from "@/lib/school-context-policy";
import { isSchoolAvailable, schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { deletePracticeWorkspaceRows } from "@/lib/practice-workspace-deletion";
import { getObjectStorage, isObjectStorageConfigured } from "@/lib/storage";
import {
  provisionSchoolWorkspace,
  SchoolNameConflictError,
} from "@/lib/school-provisioning";

type PracticeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PracticeWorkspaceActionState = { error?: string };

class PracticeWorkspaceError extends Error {}

async function lockParentSchool(tx: PracticeTransaction, schoolId: number) {
  const [school] = await tx.select({
    id: schools.id,
    publicId: schools.publicId,
    name: schools.name,
    email: schools.email,
    phone: schools.phone,
    address: schools.address,
    currency: schools.currency,
    timezone: schools.timezone,
    status: schools.status,
    archivedAt: schools.archivedAt,
    isPracticeWorkspace: schools.isPracticeWorkspace,
  }).from(schools).where(eq(schools.id, schoolId)).for("update").limit(1);
  if (!school || school.isPracticeWorkspace || !isSchoolAvailable(school.status, school.archivedAt)) {
    throw new PracticeWorkspaceError("The live school workspace is not available for practice setup.");
  }
  return school;
}

async function findActivePracticeWorkspace(tx: PracticeTransaction, parentSchoolId: number) {
  const [practice] = await tx.select({
    id: schools.id,
    publicId: schools.publicId,
  }).from(schools).where(and(
    eq(schools.practiceParentSchoolId, parentSchoolId),
    eq(schools.isPracticeWorkspace, true),
    eq(schools.status, schoolWorkspaceStatuses.active),
    isNull(schools.archivedAt),
  )).for("update").limit(1);
  return practice ?? null;
}

async function ensurePracticeAdministrator(
  tx: PracticeTransaction,
  practiceSchoolId: number,
  actorUserId: string,
) {
  let accessChanged = false;
  let [membership] = await tx.select({
    id: schoolMemberships.id,
    status: schoolMemberships.status,
  }).from(schoolMemberships).where(and(
    eq(schoolMemberships.schoolId, practiceSchoolId),
    eq(schoolMemberships.userId, actorUserId),
  )).for("update").limit(1);

  if (!membership) {
    accessChanged = true;
    await tx.insert(schoolMemberships).values({
      schoolId: practiceSchoolId,
      userId: actorUserId,
      status: "active",
    });
    [membership] = await tx.select({
      id: schoolMemberships.id,
      status: schoolMemberships.status,
    }).from(schoolMemberships).where(and(
      eq(schoolMemberships.schoolId, practiceSchoolId),
      eq(schoolMemberships.userId, actorUserId),
    )).limit(1);
  } else if (membership.status !== "active") {
    accessChanged = true;
    await tx.update(schoolMemberships).set({ status: "active" })
      .where(eq(schoolMemberships.id, membership.id));
  }
  if (!membership) throw new Error("The practice workspace membership could not be loaded.");

  const [administratorRole] = await tx.select({ id: roles.id }).from(roles).where(and(
    eq(roles.schoolId, practiceSchoolId),
    eq(roles.name, "School administrator"),
  )).limit(1);
  if (!administratorRole) throw new Error("The practice workspace administrator role is unavailable.");

  const [userRole] = await tx.select({
    membershipId: userRoles.membershipId,
  }).from(userRoles).where(and(
    eq(userRoles.membershipId, membership.id),
    eq(userRoles.roleId, administratorRole.id),
  )).limit(1);
  if (!userRole) {
    accessChanged = true;
    await tx.insert(userRoles).values({
      membershipId: membership.id,
      roleId: administratorRole.id,
    });
  }
  if (accessChanged) {
    const [practice] = await tx.select({ publicId: schools.publicId }).from(schools)
      .where(eq(schools.id, practiceSchoolId)).limit(1);
    if (!practice) throw new Error("The practice workspace could not be loaded.");
    await tx.insert(auditLogs).values({
      schoolId: practiceSchoolId,
      actorUserId,
      action: "practice_workspace.administrator_access_granted",
      resourceType: "school",
      resourcePublicId: practice.publicId,
      changedFields: ["membership", "administrator role"],
    });
  }
}

async function syncPracticeWorkspaceAccess(
  tx: PracticeTransaction,
  parentSchoolId: number,
  practiceSchoolId: number,
) {
  const parentMembers = await tx.select({ membershipId: schoolMemberships.id, userId: schoolMemberships.userId })
    .from(schoolMemberships).where(and(
      eq(schoolMemberships.schoolId, parentSchoolId),
      eq(schoolMemberships.status, "active"),
    ));
  if (!parentMembers.length) return;

  const parentRoles = await tx.select({ id: roles.id, name: roles.name, description: roles.description })
    .from(roles).where(eq(roles.schoolId, parentSchoolId));
  const practiceRoles = await tx.select({ id: roles.id, name: roles.name })
    .from(roles).where(eq(roles.schoolId, practiceSchoolId));
  const practiceRolesByName = new Map(practiceRoles.map((role) => [role.name, role.id]));
  const missingRoles = parentRoles.filter((role) => !practiceRolesByName.has(role.name));
  if (missingRoles.length) {
    await tx.insert(roles).values(missingRoles.map((role) => ({
      schoolId: practiceSchoolId,
      name: role.name,
      description: role.description,
      isSystem: false,
    })));
  }
  const allPracticeRoles = await tx.select({ id: roles.id, name: roles.name })
    .from(roles).where(eq(roles.schoolId, practiceSchoolId));
  const practiceRoleIds = new Map(allPracticeRoles.map((role) => [role.name, role.id]));
  const roleIdsBySource = new Map(parentRoles.flatMap((role) => {
    const practiceRoleId = practiceRoleIds.get(role.name);
    return practiceRoleId === undefined ? [] : [[role.id, practiceRoleId] as const];
  }));
  const targetRoleIds = [...new Set(roleIdsBySource.values())];
  if (targetRoleIds.length) {
    await tx.delete(rolePermissions).where(inArray(rolePermissions.roleId, targetRoleIds));
    const sourcePermissionRows = await tx.select({ roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId })
      .from(rolePermissions).where(inArray(rolePermissions.roleId, parentRoles.map((role) => role.id)));
    const copiedGrants = sourcePermissionRows.flatMap((row) => {
      const targetRoleId = roleIdsBySource.get(row.roleId);
      return targetRoleId === undefined ? [] : [{ roleId: targetRoleId, permissionId: row.permissionId }];
    });
    if (copiedGrants.length) await tx.insert(rolePermissions).values(copiedGrants);
  }

  const practiceMembers = await tx.select({ id: schoolMemberships.id, userId: schoolMemberships.userId })
    .from(schoolMemberships).where(eq(schoolMemberships.schoolId, practiceSchoolId));
  const practiceMemberIds = new Map(practiceMembers.map((member) => [member.userId, member.id]));
  for (const member of parentMembers) {
    let membershipId = practiceMemberIds.get(member.userId);
    if (membershipId === undefined) {
      await tx.insert(schoolMemberships).values({ schoolId: practiceSchoolId, userId: member.userId, status: "active" });
      const [created] = await tx.select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(
        eq(schoolMemberships.schoolId, practiceSchoolId),
        eq(schoolMemberships.userId, member.userId),
      )).limit(1);
      if (!created) throw new Error("A practice workspace member could not be loaded.");
      membershipId = created.id;
      practiceMemberIds.set(member.userId, membershipId);
    } else {
      await tx.update(schoolMemberships).set({ status: "active" }).where(eq(schoolMemberships.id, membershipId));
    }

    const assignedRoleRows = await tx.select({ name: roles.name })
      .from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.membershipId, member.membershipId), eq(roles.schoolId, parentSchoolId)));
    await tx.delete(userRoles).where(eq(userRoles.membershipId, membershipId));
    const practiceAssignments = assignedRoleRows.flatMap((assignedRole) => {
      const targetRoleId = practiceRoleIds.get(assignedRole.name);
      return targetRoleId === undefined ? [] : [{ membershipId, roleId: targetRoleId }];
    });
    if (practiceAssignments.length) await tx.insert(userRoles).values(practiceAssignments);
  }

  const [practiceBranch] = await tx.select({ id: schoolBranches.id }).from(schoolBranches)
    .where(eq(schoolBranches.schoolId, practiceSchoolId)).limit(1);
  if (!practiceBranch) return;

  const liveStaff = await tx.select({
    firstName: staffMembers.firstName,
    lastName: staffMembers.lastName,
    linkedUserId: staffMembers.linkedUserId,
    staffMemberId: staffMembers.id,
  }).from(staffMembers).innerJoin(schoolMemberships, and(
    eq(schoolMemberships.schoolId, parentSchoolId),
    eq(schoolMemberships.userId, staffMembers.linkedUserId!),
    eq(schoolMemberships.status, "active"),
  )).where(and(
    eq(staffMembers.schoolId, parentSchoolId),
    eq(staffMembers.status, "active"),
  ));
  const liveTeacherRows = liveStaff.length
    ? await tx.select({ staffMemberId: teachers.staffMemberId }).from(teachers).where(and(
      eq(teachers.schoolId, parentSchoolId),
      eq(teachers.status, "active"),
      inArray(teachers.staffMemberId, liveStaff.map((staff) => staff.staffMemberId)),
    ))
    : [];
  const teacherStaffIds = new Set(liveTeacherRows.flatMap((row) => row.staffMemberId === null ? [] : [row.staffMemberId]));
  for (const staff of liveStaff) {
    if (!staff.linkedUserId) continue;
    const [existingStaff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(
      eq(staffMembers.schoolId, practiceSchoolId),
      eq(staffMembers.linkedUserId, staff.linkedUserId),
    )).limit(1);
    if (existingStaff) continue;
    const practiceStaffPublicId = randomUUID();
    await tx.insert(staffMembers).values({
      publicId: practiceStaffPublicId,
      schoolId: practiceSchoolId,
      branchId: practiceBranch.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      jobTitle: "Practice staff",
      department: "General",
      linkedUserId: staff.linkedUserId,
      status: "active",
    });
    const [practiceStaff] = await tx.select({ id: staffMembers.id }).from(staffMembers)
      .where(eq(staffMembers.publicId, practiceStaffPublicId)).limit(1);
    if (!practiceStaff) continue;
    if (teacherStaffIds.has(staff.staffMemberId)) {
      await tx.insert(teachers).values({
        publicId: randomUUID(),
        schoolId: practiceSchoolId,
        branchId: practiceBranch.id,
        staffMemberId: practiceStaff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        status: "active",
      });
    }
  }

  const liveStudentLinks = await tx.select({
    userId: userStudentLinks.userId,
    firstName: students.firstName,
    lastName: students.lastName,
  }).from(userStudentLinks).innerJoin(students, and(
    eq(students.id, userStudentLinks.studentId),
    eq(students.schoolId, parentSchoolId),
  )).innerJoin(schoolMemberships, and(
    eq(schoolMemberships.schoolId, parentSchoolId),
    eq(schoolMemberships.userId, userStudentLinks.userId),
    eq(schoolMemberships.status, "active"),
  )).where(and(
    eq(userStudentLinks.schoolId, parentSchoolId),
    eq(userStudentLinks.accessType, "student"),
    inArray(students.status, ["active", "admitted"]),
  ));
  for (const linked of liveStudentLinks) {
    const [existing] = await tx.select({ studentId: userStudentLinks.studentId }).from(userStudentLinks)
      .innerJoin(students, eq(students.id, userStudentLinks.studentId)).where(and(
        eq(userStudentLinks.schoolId, practiceSchoolId),
        eq(userStudentLinks.userId, linked.userId),
        eq(userStudentLinks.accessType, "student"),
      )).limit(1);
    if (existing) continue;
    const studentPublicId = randomUUID();
    await tx.insert(students).values({
      publicId: studentPublicId,
      schoolId: practiceSchoolId,
      branchId: practiceBranch.id,
      firstName: linked.firstName,
      lastName: linked.lastName,
      status: "active",
    });
    const [practiceStudent] = await tx.select({ id: students.id }).from(students)
      .where(eq(students.publicId, studentPublicId)).limit(1);
    if (!practiceStudent) continue;
    await tx.insert(userStudentLinks).values({
      schoolId: practiceSchoolId,
      userId: linked.userId,
      studentId: practiceStudent.id,
      accessType: "student",
    });
  }
}

async function createPracticeWorkspace(
  tx: PracticeTransaction,
  parent: Awaited<ReturnType<typeof lockParentSchool>>,
  actorUserId: string,
) {
  const existingPractices = await tx.select({ id: schools.id }).from(schools).where(and(
    eq(schools.practiceParentSchoolId, parent.id),
    eq(schools.isPracticeWorkspace, true),
  ));
  let generation = existingPractices.length + 1;
  let name = "";
  while (true) {
    const suffix = ` — Practice ${generation}`;
    name = `${parent.name.slice(0, 255 - suffix.length)}${suffix}`;
    const [existingName] = await tx.select({ id: schools.id }).from(schools)
      .where(eq(schools.name, name)).limit(1);
    if (!existingName) break;
    generation += 1;
  }
  const configuredCurrencies = await tx.select({
    code: schoolCurrencies.code,
    name: schoolCurrencies.name,
    symbol: schoolCurrencies.symbol,
    isDefault: schoolCurrencies.isDefault,
  }).from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, parent.id));
  const currencies = configuredCurrencies.length
    ? configuredCurrencies
    : [{
        code: parent.currency,
        name: parent.currency,
        symbol: parent.currency,
        isDefault: true,
      }];

  return provisionSchoolWorkspace(tx, {
    name,
    email: parent.email,
    phone: parent.phone,
    address: parent.address,
    administratorUserId: actorUserId,
    actorUserId,
    currency: parent.currency,
    timezone: parent.timezone,
    currencies,
    isPracticeWorkspace: true,
    practiceParentSchoolId: parent.id,
  });
}

type PracticeWorkspaceRecord = {
  id: number;
  publicId: string;
  archivedAt: Date | null;
};

async function getPracticeWorkspaces(tx: PracticeTransaction, parentSchoolId: number) {
  return tx.select({
    id: schools.id,
    publicId: schools.publicId,
    archivedAt: schools.archivedAt,
  }).from(schools).where(and(
    eq(schools.practiceParentSchoolId, parentSchoolId),
    eq(schools.isPracticeWorkspace, true),
  )).for("update");
}

async function archivePracticeWorkspaces(
  tx: PracticeTransaction,
  workspaces: PracticeWorkspaceRecord[],
  actorUserId: string,
) {
  const activeIds = workspaces.filter((workspace) => workspace.archivedAt === null)
    .map((workspace) => workspace.id);
  if (activeIds.length) {
    await tx.update(schools).set({
      archivedAt: new Date(),
      archivedBy: actorUserId,
    }).where(inArray(schools.id, activeIds));
  }
}

async function deletePracticeWorkspaceFiles(workspaces: PracticeWorkspaceRecord[]) {
  for (const workspace of workspaces) {
    const [storedFile] = await db.select({ id: uploadedFiles.id }).from(uploadedFiles)
      .where(eq(uploadedFiles.schoolId, workspace.id)).limit(1);
    let storageConfigured: boolean;
    try {
      storageConfigured = isObjectStorageConfigured();
    } catch (error) {
      console.error("Practice workspace storage configuration could not be read.", error);
      throw new PracticeWorkspaceError(
        "Practice records were not deleted because object storage is misconfigured. Correct the storage settings and retry.",
      );
    }
    if (!storageConfigured) {
      if (storedFile) {
        throw new PracticeWorkspaceError(
          "Practice records were not deleted because object storage is not configured. Configure storage and retry.",
        );
      }
      continue;
    }

    try {
      await getObjectStorage().deleteObjectsByPrefix(`${workspace.publicId}/`);
    } catch (error) {
      console.error("Practice workspace file cleanup failed.", error);
      throw new PracticeWorkspaceError(
        "Practice records were not deleted because some stored files could not be removed. Retry the action.",
      );
    }
  }
}

async function permanentlyDeletePracticeWorkspaces(
  parentSchoolId: number,
  actorUserId: string,
  workspaces: PracticeWorkspaceRecord[],
  action: string,
  allowOtherActiveWorkspaces = false,
) {
  if (!workspaces.length) return;
  await deletePracticeWorkspaceFiles(workspaces);

  await db.transaction(async (tx) => {
    const parent = await lockParentSchool(tx, parentSchoolId);
    const remaining = await getPracticeWorkspaces(tx, parent.id);
    const requestedIds = new Set(workspaces.map((workspace) => workspace.id));
    const unexpected = remaining.filter((workspace) => !requestedIds.has(workspace.id));
    if (unexpected.some((workspace) => !allowOtherActiveWorkspaces || workspace.archivedAt !== null)) {
      throw new PracticeWorkspaceError(
        "Practice workspaces changed while deletion was in progress. No remaining workspace was deleted; retry the action.",
      );
    }

    const deletedIds = await deletePracticeWorkspaceRows(
      tx,
      parent.id,
      workspaces.map((workspace) => workspace.id),
    );
    const deletedPublicIds = workspaces
      .filter((workspace) => deletedIds.includes(workspace.id))
      .map((workspace) => workspace.publicId);
    if (deletedPublicIds.length) {
      await tx.insert(auditLogs).values(deletedPublicIds.map((publicId) => ({
        schoolId: parent.id,
        actorUserId,
        action,
        resourceType: "school",
        resourcePublicId: publicId,
        changedFields: ["permanentlyDeleted"],
      })));
    }
  });
}

async function selectWorkspaceAndRedirect(schoolPublicId: string, reason: string): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(activeSchoolCookieName, schoolPublicId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/admin/settings");
  revalidatePath("/select-school");
  redirect(`/admin/settings?practice=${reason}`);
}

function requireWorkspaceSwitching() {
  if (!isMultiSchoolEnabled()) {
    throw new PracticeWorkspaceError("Practice workspaces require multi-school workspace switching to be enabled.");
  }
}

export async function startPracticeWorkspace(
  _state: PracticeWorkspaceActionState,
  _formData: FormData,
): Promise<PracticeWorkspaceActionState> {
  void _state;
  void _formData;
  const context = await requireSchoolPermission("school.settings.manage");
  try {
    requireWorkspaceSwitching();
    if (context.schoolIsPractice) {
      throw new PracticeWorkspaceError("Start practice mode from your live school workspace.");
    }

    const staleWorkspaces = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, context.schoolId);
      const workspaces = await getPracticeWorkspaces(tx, parent.id);
      const stale = workspaces.filter((workspace) => workspace.archivedAt !== null);
      await archivePracticeWorkspaces(tx, stale, context.user.id);
      return stale;
    });
    await permanentlyDeletePracticeWorkspaces(
      context.schoolId,
      context.user.id,
      staleWorkspaces,
      "practice_workspace.stale_data_deleted",
      true,
    );

    const practicePublicId = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, context.schoolId);
      let practice = await findActivePracticeWorkspace(tx, parent.id);
      if (!practice) {
        const created = await createPracticeWorkspace(tx, parent, context.user.id);
        const [createdSchool] = await tx.select({
          id: schools.id,
          publicId: schools.publicId,
        }).from(schools).where(eq(schools.publicId, created.schoolPublicId)).limit(1);
        if (!createdSchool) throw new Error("The practice workspace could not be loaded.");
        practice = createdSchool;
      } else {
        await ensurePracticeAdministrator(tx, practice.id, context.user.id);
      }
      await syncPracticeWorkspaceAccess(tx, parent.id, practice.id);
      await ensurePracticeAdministrator(tx, practice.id, context.user.id);
      return practice.publicId;
    });

    return await selectWorkspaceAndRedirect(practicePublicId, "started");
  } catch (error) {
    if (error instanceof PracticeWorkspaceError) return { error: error.message };
    if (error instanceof SchoolNameConflictError) return { error: "The practice workspace name is already in use. Try again to create it with a new name." };
    throw error;
  }
}

export async function resetPracticeWorkspace(
  _state: PracticeWorkspaceActionState,
  _formData: FormData,
): Promise<PracticeWorkspaceActionState> {
  void _state;
  void _formData;
  const context = await requireSchoolPermission("school.settings.manage");
  try {
    requireWorkspaceSwitching();
    const parentSchoolId = context.schoolIsPractice
      ? context.practiceParentSchoolId
      : context.schoolId;
    if (parentSchoolId === null) {
      throw new PracticeWorkspaceError("This practice workspace is not linked to a live school.");
    }

    const practiceWorkspaces = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      const currentPractice = await findActivePracticeWorkspace(tx, parent.id);
      if (!currentPractice) throw new PracticeWorkspaceError("There is no active practice workspace to reset.");
      if (context.schoolIsPractice && currentPractice.publicId !== context.schoolPublicId) {
        throw new PracticeWorkspaceError("This practice workspace is no longer active. Switch to the current practice workspace.");
      }

      const workspaces = await getPracticeWorkspaces(tx, parent.id);
      await archivePracticeWorkspaces(tx, workspaces, context.user.id);
      return workspaces;
    });
    await permanentlyDeletePracticeWorkspaces(
      parentSchoolId,
      context.user.id,
      practiceWorkspaces,
      "practice_workspace.reset",
    );

    const practicePublicId = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      const currentPractice = await findActivePracticeWorkspace(tx, parent.id);
      if (currentPractice) {
        await syncPracticeWorkspaceAccess(tx, parent.id, currentPractice.id);
        await ensurePracticeAdministrator(tx, currentPractice.id, context.user.id);
        return currentPractice.publicId;
      }

      const created = await createPracticeWorkspace(tx, parent, context.user.id);
      const [newPractice] = await tx.select({
        id: schools.id,
        publicId: schools.publicId,
      }).from(schools).where(eq(schools.publicId, created.schoolPublicId)).limit(1);
      if (!newPractice) throw new Error("The reset practice workspace could not be loaded.");
      await syncPracticeWorkspaceAccess(tx, parent.id, newPractice.id);
      await ensurePracticeAdministrator(tx, newPractice.id, context.user.id);
      return newPractice.publicId;
    });

    return await selectWorkspaceAndRedirect(practicePublicId, "reset");
  } catch (error) {
    if (error instanceof PracticeWorkspaceError) return { error: error.message };
    if (error instanceof SchoolNameConflictError) return { error: "The practice workspace name is already in use. Try again to create it with a new name." };
    throw error;
  }
}

export async function finishPracticeWorkspace(
  _state: PracticeWorkspaceActionState,
  _formData: FormData,
): Promise<PracticeWorkspaceActionState> {
  void _state;
  void _formData;
  const context = await requireSchoolPermission("school.settings.manage");
  try {
    requireWorkspaceSwitching();
    const parentSchoolId = context.schoolIsPractice
      ? context.practiceParentSchoolId
      : context.schoolId;
    if (parentSchoolId === null) {
      throw new PracticeWorkspaceError("This practice workspace is not linked to a live school.");
    }

    const practiceWorkspaces = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      const practice = await findActivePracticeWorkspace(tx, parent.id);
      if (!practice) throw new PracticeWorkspaceError("There is no active practice workspace to finish.");
      if (context.schoolIsPractice && practice.publicId !== context.schoolPublicId) {
        throw new PracticeWorkspaceError("This practice workspace is no longer active.");
      }

      const workspaces = await getPracticeWorkspaces(tx, parent.id);
      await archivePracticeWorkspaces(tx, workspaces, context.user.id);
      return workspaces;
    });
    await permanentlyDeletePracticeWorkspaces(
      parentSchoolId,
      context.user.id,
      practiceWorkspaces,
      "practice_workspace.finished",
    );

    const parentPublicId = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      return parent.publicId;
    });

    return await selectWorkspaceAndRedirect(parentPublicId, "finished");
  } catch (error) {
    if (error instanceof PracticeWorkspaceError) return { error: error.message };
    throw error;
  }
}
