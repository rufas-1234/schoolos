"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, schoolBranches, studentCategories, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  isValidStudentCategoryName,
  normalizeStudentCategoryName,
} from "@/lib/student-category-policy";

export type StudentCategoryActionState = { error?: string; success?: boolean };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const publicIdField = z.string().uuid();

function revalidateStudentPages() {
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/categories");
}

export async function saveStudentCategory(
  _previousState: StudentCategoryActionState,
  formData: FormData,
): Promise<StudentCategoryActionState> {
  const recordIdValue = formData.get("publicId");
  const recordPublicId = recordIdValue === null ? null : publicIdField.safeParse(recordIdValue);
  const branchResult = idField.safeParse(formData.get("branchId"));
  const nameValue = formData.get("name");
  const name =
    typeof nameValue === "string" ? normalizeStudentCategoryName(nameValue) : "";

  if (
    (recordIdValue !== null && (!recordPublicId || !recordPublicId.success)) ||
    !branchResult.success ||
    !isValidStudentCategoryName(name)
  ) {
    return { error: "Choose a branch and enter a category name (up to 120 characters)." };
  }

  const context = await requireSchoolPermission(
    recordIdValue === null ? "students.create" : "students.update",
  );
  const branchId = branchResult.data;
  const publicId = recordPublicId?.success ? recordPublicId.data : randomUUID();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: schoolBranches.id })
        .from(schoolBranches)
        .where(
          and(
            eq(schoolBranches.id, branchId),
            eq(schoolBranches.schoolId, context.schoolId),
            eq(schoolBranches.status, "active"),
          ),
        )
        .limit(1);
      if (!branch) return "branch-not-found";

      if (recordIdValue !== null) {
        const [category] = await tx
          .select({ id: studentCategories.id, publicId: studentCategories.publicId, branchId: studentCategories.branchId })
          .from(studentCategories)
          .where(
            and(
              eq(studentCategories.publicId, publicId),
              eq(studentCategories.schoolId, context.schoolId),
            ),
          )
          .for("update")
          .limit(1);
        if (!category) return "category-not-found";

        if (category.branchId !== branchId) {
          const [usage] = await tx
            .select({ count: count() })
            .from(students)
            .where(
              and(
                eq(students.schoolId, context.schoolId),
                eq(students.categoryId, category.id),
              ),
            );
          if (usage.count > 0) return "category-in-use";
        }

        await tx
          .update(studentCategories)
          .set({ branchId, name })
          .where(
            and(
              eq(studentCategories.id, category.id),
              eq(studentCategories.schoolId, context.schoolId),
            ),
          );
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "student.category.updated",
          resourceType: "student_category",
          resourcePublicId: category.publicId,
          changedFields: ["branchId", "name"],
        });
        return "updated";
      }

      await tx.insert(studentCategories).values({
        publicId,
        schoolId: context.schoolId,
        branchId,
        name,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "student.category.created",
        resourceType: "student_category",
        resourcePublicId: publicId,
        changedFields: ["branchId", "name"],
      });
      return "created";
    });

    if (outcome === "branch-not-found") return { error: "Choose an active branch in your school." };
    if (outcome === "category-not-found") return { error: "Student category was not found." };
    if (outcome === "category-in-use") {
      return { error: "A category assigned to students cannot be moved to another branch." };
    }

    revalidateStudentPages();
    return { success: true };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "That category already exists in the selected branch." };
    }
    throw error;
  }
}

export async function deleteStudentCategory(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.delete");
  const result = publicIdField.safeParse(formData.get("publicId"));
  if (!result.success) throw new Error("Invalid student category.");

  const outcome = await db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: studentCategories.id })
      .from(studentCategories)
      .where(
        and(
          eq(studentCategories.publicId, result.data),
          eq(studentCategories.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!category) return "not-found";

    const [usage] = await tx
      .select({ count: count() })
      .from(students)
      .where(
        and(
          eq(students.schoolId, context.schoolId),
          eq(students.categoryId, category.id),
        ),
      );
    if (usage.count > 0) return "in-use";

    await tx
      .delete(studentCategories)
      .where(
        and(
          eq(studentCategories.id, category.id),
          eq(studentCategories.schoolId, context.schoolId),
        ),
      );
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.category.deleted",
      resourceType: "student_category",
      resourcePublicId: result.data,
      changedFields: ["deleted"],
    });
    return "deleted";
  });

  if (outcome === "not-found") throw new Error("Student category was not found.");
  if (outcome === "in-use") {
    throw new Error("This category is assigned to students and cannot be deleted.");
  }
  revalidateStudentPages();
}
