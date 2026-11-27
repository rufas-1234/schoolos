"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schools } from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  canApproveSchool,
  canRejectSchool,
  canReopenSchoolReview,
  schoolWorkspaceStatuses,
} from "@/lib/school-lifecycle-policy";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { createTrialSubscriptionForSchool } from "@/lib/school-provisioning";

export type SchoolManagementState = { error?: string; success?: string };

type SchoolTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class SchoolManagementError extends Error {}

const reviewSchema = z.object({
  schoolPublicId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "pending"]),
});

const updateSchema = z.object({
  schoolPublicId: z.string().uuid(),
  schoolName: z.string().trim().min(2).max(255),
  schoolEmail: z.union([z.literal(""), z.string().trim().email().max(320)]),
  schoolPhone: z.string().trim().max(40),
  schoolAddress: z.string().trim().max(1000),
});

const archiveSchema = z.object({
  schoolPublicId: z.string().uuid(),
  decision: z.enum(["archive", "restore"]),
});

async function writeSchoolAudit(
  tx: SchoolTransaction,
  actorUserId: string,
  schoolId: number,
  schoolPublicId: string,
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

export async function reviewSchool(
  _previousState: SchoolManagementState,
  formData: FormData,
): Promise<SchoolManagementState> {
  const actor = await requirePlatformAdmin();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Select a valid school and review decision." };
  const { schoolPublicId, decision } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [school] = await tx.select({
        id: schools.id,
        publicId: schools.publicId,
        status: schools.status,
        archivedAt: schools.archivedAt,
      }).from(schools).where(eq(schools.publicId, schoolPublicId)).for("update").limit(1);
      if (!school) throw new SchoolManagementError("That school workspace no longer exists.");
      if (school.archivedAt) throw new SchoolManagementError("Restore the archived school before reviewing it.");

      if (decision === "approve") {
        if (!canApproveSchool(school.status)) {
          throw new SchoolManagementError("Only pending or rejected school applications can be approved.");
        }
        await tx.update(schools).set({
          status: schoolWorkspaceStatuses.active,
          approvedAt: new Date(),
          approvedBy: actor.id,
        }).where(eq(schools.id, school.id));
        await createTrialSubscriptionForSchool(tx, school.id, actor.id);
        await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.approved", [
          "status",
          "approvedAt",
          "approvedBy",
        ]);
      } else if (decision === "reject") {
        if (!canRejectSchool(school.status)) {
          throw new SchoolManagementError("Only pending school applications can be rejected.");
        }
        await tx.update(schools).set({
          status: schoolWorkspaceStatuses.rejected,
          approvedAt: null,
          approvedBy: null,
        }).where(eq(schools.id, school.id));
        await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.rejected", [
          "status",
          "approvedAt",
          "approvedBy",
        ]);
      } else {
        if (!canReopenSchoolReview(school.status)) {
          throw new SchoolManagementError("Only approved schools can be returned to pending review.");
        }
        await tx.update(schools).set({
          status: schoolWorkspaceStatuses.pending,
          approvedAt: null,
          approvedBy: null,
        }).where(eq(schools.id, school.id));
        await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.review_reopened", [
          "status",
          "approvedAt",
          "approvedBy",
        ]);
      }
    });
  } catch (error) {
    if (error instanceof SchoolManagementError) return { error: error.message };
    throw error;
  }

  revalidatePath("/platform/schools");
  revalidatePath("/select-school");
  return {
    success: decision === "approve"
      ? "School approved."
      : decision === "reject"
        ? "School application rejected."
        : "School returned to pending review; access is disabled until approval.",
  };
}

export async function updateSchool(
  _previousState: SchoolManagementState,
  formData: FormData,
): Promise<SchoolManagementState> {
  const actor = await requirePlatformAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the school name, email, phone, and address." };
  const values = parsed.data;
  const updatedValues = {
    name: values.schoolName,
    email: values.schoolEmail || null,
    phone: values.schoolPhone || null,
    address: values.schoolAddress || null,
  };

  try {
    const changedFields = await db.transaction(async (tx) => {
      const [school] = await tx.select({
        id: schools.id,
        publicId: schools.publicId,
        name: schools.name,
        email: schools.email,
        phone: schools.phone,
        address: schools.address,
      }).from(schools).where(eq(schools.publicId, values.schoolPublicId)).for("update").limit(1);
      if (!school) throw new SchoolManagementError("That school workspace no longer exists.");

      const [nameConflict] = await tx.select({ id: schools.id }).from(schools)
        .where(and(eq(schools.name, updatedValues.name), ne(schools.id, school.id))).limit(1);
      if (nameConflict) throw new SchoolManagementError("Another school already uses that name.");

      const changedFields = (Object.keys(updatedValues) as (keyof typeof updatedValues)[])
        .filter((key) => school[key] !== updatedValues[key]);
      if (!changedFields.length) return changedFields;

      await tx.update(schools).set(updatedValues).where(eq(schools.id, school.id));
      await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.updated", changedFields);
      return changedFields;
    });
    if (!changedFields.length) return { success: "No school detail changes to save." };
  } catch (error) {
    if (error instanceof SchoolManagementError) return { error: error.message };
    if (isDuplicateEntryError(error)) return { error: "Another school already uses that name." };
    throw error;
  }

  revalidatePath("/platform/schools");
  return { success: "School details saved." };
}

export async function archiveSchool(
  _previousState: SchoolManagementState,
  formData: FormData,
): Promise<SchoolManagementState> {
  const actor = await requirePlatformAdmin();
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Select a valid school and archive decision." };
  const { schoolPublicId, decision } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [school] = await tx.select({
        id: schools.id,
        publicId: schools.publicId,
        archivedAt: schools.archivedAt,
      }).from(schools).where(eq(schools.publicId, schoolPublicId)).for("update").limit(1);
      if (!school) throw new SchoolManagementError("That school workspace no longer exists.");

      if (decision === "archive") {
        if (school.archivedAt) throw new SchoolManagementError("That school is already archived.");
        await tx.update(schools).set({ archivedAt: new Date(), archivedBy: actor.id })
          .where(eq(schools.id, school.id));
        await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.archived", [
          "archivedAt",
          "archivedBy",
        ]);
      } else {
        if (!school.archivedAt) throw new SchoolManagementError("That school is not archived.");
        await tx.update(schools).set({ archivedAt: null, archivedBy: null })
          .where(eq(schools.id, school.id));
        await writeSchoolAudit(tx, actor.id, school.id, school.publicId, "school.restored", [
          "archivedAt",
          "archivedBy",
        ]);
      }
    });
  } catch (error) {
    if (error instanceof SchoolManagementError) return { error: error.message };
    throw error;
  }

  revalidatePath("/platform/schools");
  revalidatePath("/select-school");
  return { success: decision === "archive" ? "School archived; its data has been preserved." : "School restored." };
}
