"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schoolBranches, staffDepartments, staffDesignations, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type HrCatalogActionState = { error?: string; success?: boolean };
export type HrCatalogKind = "department" | "designation";

const catalogKind = z.enum(["department", "designation"]);
const entryId = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const branchIdField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function revalidateCatalog() {
  revalidatePath("/admin/hr");
  revalidatePath("/admin/hr/departments");
  revalidatePath("/admin/hr/designations");
  revalidatePath("/admin/staff");
}

export async function createStaffCatalogEntry(
  _previousState: HrCatalogActionState,
  formData: FormData,
): Promise<HrCatalogActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const kind = catalogKind.safeParse(value(formData, "kind"));
  const branchId = branchIdField.safeParse(value(formData, "branchId"));
  const name = z.string().trim().min(2).max(120).safeParse(value(formData, "name"));
  if (!kind.success || !branchId.success || !name.success) {
    return { error: "Enter a valid name between 2 and 120 characters." };
  }
  const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
    eq(schoolBranches.id, branchId.data),
    eq(schoolBranches.schoolId, context.schoolId),
    eq(schoolBranches.status, "active"),
  )).limit(1);
  if (!branch) return { error: "Choose an active branch belonging to this school." };

  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      if (kind.data === "department") {
        await tx.insert(staffDepartments).values({
          publicId,
          schoolId: context.schoolId,
          branchId: branch.id,
          name: name.data,
        });
      } else {
        await tx.insert(staffDesignations).values({
          publicId,
          schoolId: context.schoolId,
          branchId: branch.id,
          name: name.data,
        });
      }
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: `staff.${kind.data}.created`,
        resourceType: `staff_${kind.data}`,
        resourcePublicId: publicId,
        changedFields: ["branchId", "name"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: `A ${kind.data} with that name already exists.` };
    }
    throw error;
  }

  revalidateCatalog();
  return { success: true };
}

export async function updateStaffCatalogEntry(
  _previousState: HrCatalogActionState,
  formData: FormData,
): Promise<HrCatalogActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const kind = catalogKind.safeParse(value(formData, "kind"));
  const id = entryId.safeParse(value(formData, "id"));
  const name = z.string().trim().min(2).max(120).safeParse(value(formData, "name"));
  if (!kind.success || !id.success || !name.success) {
    return { error: "Enter a valid name between 2 and 120 characters." };
  }

  try {
    const updated = await db.transaction(async (tx) => {
      if (kind.data === "department") {
        const [existing] = await tx.select({
          id: staffDepartments.id,
          publicId: staffDepartments.publicId,
          name: staffDepartments.name,
          branchId: staffDepartments.branchId,
        }).from(staffDepartments).where(and(
          eq(staffDepartments.id, id.data),
          eq(staffDepartments.schoolId, context.schoolId),
        )).for("update").limit(1);
        if (!existing) return false;
        await tx.update(staffMembers).set({ department: name.data }).where(and(
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.department, existing.name),
          ...(existing.branchId === null ? [] : [eq(staffMembers.branchId, existing.branchId)]),
        ));
        await tx.update(staffDepartments).set({ name: name.data }).where(eq(staffDepartments.id, existing.id));
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "staff.department.renamed",
          resourceType: "staff_department",
          resourcePublicId: existing.publicId,
          changedFields: ["name"],
        });
      } else {
        const [existing] = await tx.select({
          id: staffDesignations.id,
          publicId: staffDesignations.publicId,
          name: staffDesignations.name,
          branchId: staffDesignations.branchId,
        }).from(staffDesignations).where(and(
          eq(staffDesignations.id, id.data),
          eq(staffDesignations.schoolId, context.schoolId),
        )).for("update").limit(1);
        if (!existing) return false;
        await tx.update(staffMembers).set({ jobTitle: name.data }).where(and(
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.jobTitle, existing.name),
          ...(existing.branchId === null ? [] : [eq(staffMembers.branchId, existing.branchId)]),
        ));
        await tx.update(staffDesignations).set({ name: name.data }).where(eq(staffDesignations.id, existing.id));
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "staff.designation.renamed",
          resourceType: "staff_designation",
          resourcePublicId: existing.publicId,
          changedFields: ["name"],
        });
      }
      return true;
    });
    if (!updated) return { error: "That entry was not found in this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: `A ${kind.data} with that name already exists.` };
    }
    throw error;
  }

  revalidateCatalog();
  return { success: true };
}

export async function deleteStaffCatalogEntry(
  _previousState: HrCatalogActionState,
  formData: FormData,
): Promise<HrCatalogActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const kind = catalogKind.safeParse(value(formData, "kind"));
  const id = entryId.safeParse(value(formData, "id"));
  if (!kind.success || !id.success) return { error: "Choose a valid entry." };

  const outcome = await db.transaction(async (tx) => {
    if (kind.data === "department") {
      const [existing] = await tx.select({
        id: staffDepartments.id,
        publicId: staffDepartments.publicId,
        name: staffDepartments.name,
        branchId: staffDepartments.branchId,
      }).from(staffDepartments).where(and(
        eq(staffDepartments.id, id.data),
        eq(staffDepartments.schoolId, context.schoolId),
      )).for("update").limit(1);
      if (!existing) return "not-found";
      const [staff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.department, existing.name),
        ...(existing.branchId === null ? [] : [eq(staffMembers.branchId, existing.branchId)]),
      )).limit(1);
      if (staff) return "in-use";
      await tx.delete(staffDepartments).where(eq(staffDepartments.id, existing.id));
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "staff.department.deleted",
        resourceType: "staff_department",
        resourcePublicId: existing.publicId,
        changedFields: ["name"],
      });
    } else {
      const [existing] = await tx.select({
        id: staffDesignations.id,
        publicId: staffDesignations.publicId,
        name: staffDesignations.name,
        branchId: staffDesignations.branchId,
      }).from(staffDesignations).where(and(
        eq(staffDesignations.id, id.data),
        eq(staffDesignations.schoolId, context.schoolId),
      )).for("update").limit(1);
      if (!existing) return "not-found";
      const [staff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.jobTitle, existing.name),
        ...(existing.branchId === null ? [] : [eq(staffMembers.branchId, existing.branchId)]),
      )).limit(1);
      if (staff) return "in-use";
      await tx.delete(staffDesignations).where(eq(staffDesignations.id, existing.id));
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "staff.designation.deleted",
        resourceType: "staff_designation",
        resourcePublicId: existing.publicId,
        changedFields: ["name"],
      });
    }
    return "deleted";
  });

  if (outcome === "not-found") return { error: "That entry was not found in this school." };
  if (outcome === "in-use") return { error: "Reassign staff members before deleting this entry." };
  revalidateCatalog();
  return { success: true };
}
