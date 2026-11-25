"use server";

import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  auditLogs,
  roles,
  schoolCurrencies,
  schoolMemberships,
  schools,
  userRoles,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isMultiSchoolEnabled, activeSchoolCookieName } from "@/lib/school-context-policy";
import { isSchoolAvailable, schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
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

async function writePracticeAudit(
  tx: PracticeTransaction,
  schoolId: number,
  schoolPublicId: string,
  actorUserId: string,
  action: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({
    schoolId,
    actorUserId,
    action,
    resourceType: "school",
    resourcePublicId: schoolPublicId,
    changedFields,
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

    const practicePublicId = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      const currentPractice = await findActivePracticeWorkspace(tx, parent.id);
      if (!currentPractice) throw new PracticeWorkspaceError("There is no active practice workspace to reset.");
      if (context.schoolIsPractice && currentPractice.publicId !== context.schoolPublicId) {
        throw new PracticeWorkspaceError("This practice workspace is no longer active. Switch to the current practice workspace.");
      }

      await tx.update(schools).set({
        archivedAt: new Date(),
        archivedBy: context.user.id,
      }).where(eq(schools.id, currentPractice.id));
      await writePracticeAudit(tx, currentPractice.id, currentPractice.publicId, context.user.id,
        "practice_workspace.reset", ["archivedAt", "archivedBy"]);

      const created = await createPracticeWorkspace(tx, parent, context.user.id);
      const [newPractice] = await tx.select({
        id: schools.id,
        publicId: schools.publicId,
      }).from(schools).where(eq(schools.publicId, created.schoolPublicId)).limit(1);
      if (!newPractice) throw new Error("The reset practice workspace could not be loaded.");
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

    const parentPublicId = await db.transaction(async (tx) => {
      const parent = await lockParentSchool(tx, parentSchoolId);
      const practice = await findActivePracticeWorkspace(tx, parent.id);
      if (!practice) throw new PracticeWorkspaceError("There is no active practice workspace to finish.");
      if (context.schoolIsPractice && practice.publicId !== context.schoolPublicId) {
        throw new PracticeWorkspaceError("This practice workspace is no longer active.");
      }

      await tx.update(schools).set({
        archivedAt: new Date(),
        archivedBy: context.user.id,
      }).where(eq(schools.id, practice.id));
      await writePracticeAudit(tx, practice.id, practice.publicId, context.user.id,
        "practice_workspace.finished", ["archivedAt", "archivedBy"]);
      return parent.publicId;
    });

    return await selectWorkspaceAndRedirect(parentPublicId, "finished");
  } catch (error) {
    if (error instanceof PracticeWorkspaceError) return { error: error.message };
    throw error;
  }
}
