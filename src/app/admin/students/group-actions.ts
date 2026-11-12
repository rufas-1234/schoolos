"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, studentGroupMemberships, studentGroups, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";
import type { AcademicActionState } from "../academics/actions";

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const groupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
});

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readRecordId(formData: FormData): number | null | undefined {
  const value = formData.get("recordId");
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const result = idField.safeParse(value);
  return result.success ? result.data : undefined;
}

function revalidateGroupPages() {
  revalidatePath("/admin/students/groups");
  revalidatePath("/admin/students");
}

export async function saveStudentGroup(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const recordId = readRecordId(formData);
  const context = await requireSchoolPermission(recordId ? "students.update" : "students.create");
  if (recordId === undefined) return { error: "Choose a valid student group." };
  const result = groupSchema.safeParse({
    name: readFormValue(formData, "name"),
    description: readFormValue(formData, "description"),
  });
  if (!result.success) return { error: "Enter a group name and a description of no more than 1,000 characters." };

  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId === null) {
        const publicId = randomUUID();
        await tx.insert(studentGroups).values({
          publicId,
          schoolId: context.schoolId,
          name: result.data.name,
          description: result.data.description || null,
        });
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "student.group.created",
          resourceType: "student_group",
          resourcePublicId: publicId,
          changedFields: ["name", "description"],
        });
        return "created";
      }

      const [group] = await tx
        .select({ publicId: studentGroups.publicId })
        .from(studentGroups)
        .where(and(eq(studentGroups.id, recordId), eq(studentGroups.schoolId, context.schoolId)))
        .for("update")
        .limit(1);
      if (!group) return "not-found";

      await tx
        .update(studentGroups)
        .set({
          name: result.data.name,
          description: result.data.description || null,
        })
        .where(and(eq(studentGroups.id, recordId), eq(studentGroups.schoolId, context.schoolId)));
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "student.group.updated",
        resourceType: "student_group",
        resourcePublicId: group.publicId,
        changedFields: ["name", "description"],
      });
      return "updated";
    });
    if (outcome === "not-found") return { error: "That student group could not be found in this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A student group with that name already exists." };
    throw error;
  }

  revalidateGroupPages();
  return { success: true };
}

export async function addStudentGroupMember(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("students.update");
  const groupId = readRecordId(formData);
  const studentResult = idField.safeParse(readFormValue(formData, "studentId"));
  if (groupId === null || groupId === undefined || !studentResult.success) {
    return { error: "Choose a group and an eligible student." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [group] = await tx
        .select({ publicId: studentGroups.publicId })
        .from(studentGroups)
        .where(and(eq(studentGroups.id, groupId), eq(studentGroups.schoolId, context.schoolId)))
        .for("update")
        .limit(1);
      if (!group) return "group-not-found";

      const [student] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(and(eq(students.id, studentResult.data), eq(students.schoolId, context.schoolId)))
        .for("update")
        .limit(1);
      if (!student || !["admitted", "active", "inactive"].includes(student.status)) {
        return "student-not-eligible";
      }

      await tx.insert(studentGroupMemberships).values({
        schoolId: context.schoolId,
        groupId,
        studentId: student.id,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "student.group.member.added",
        resourceType: "student_group",
        resourcePublicId: group.publicId,
        changedFields: ["members"],
      });
      return "added";
    });
    if (outcome === "group-not-found") return { error: "That student group could not be found in this school." };
    if (outcome === "student-not-eligible") {
      return { error: "Choose an admitted, active, or inactive student from this school." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "That student is already in this group." };
    throw error;
  }

  revalidateGroupPages();
  return { success: true };
}

export async function removeStudentGroupMember(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.update");
  const membershipResult = idField.safeParse(readFormValue(formData, "membershipId"));
  if (!membershipResult.success) throw new Error("Choose a valid group membership.");

  const outcome = await db.transaction(async (tx) => {
    const [membership] = await tx
      .select({
        id: studentGroupMemberships.id,
        groupId: studentGroupMemberships.groupId,
      })
      .from(studentGroupMemberships)
      .where(
        and(
          eq(studentGroupMemberships.id, membershipResult.data),
          eq(studentGroupMemberships.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!membership) return "membership-not-found";

    const [group] = await tx
      .select({ publicId: studentGroups.publicId })
      .from(studentGroups)
      .where(
        and(
          eq(studentGroups.id, membership.groupId),
          eq(studentGroups.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    if (!group) return "group-not-found";

    await tx
      .delete(studentGroupMemberships)
      .where(
        and(
          eq(studentGroupMemberships.id, membership.id),
          eq(studentGroupMemberships.schoolId, context.schoolId),
        ),
      );
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.group.member.removed",
      resourceType: "student_group",
      resourcePublicId: group.publicId,
      changedFields: ["members"],
    });
    return "removed";
  });

  if (outcome === "membership-not-found" || outcome === "group-not-found") {
    throw new Error("That group membership could not be found in this school.");
  }
  revalidateGroupPages();
}

export async function deleteStudentGroup(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.delete");
  const groupId = readRecordId(formData);
  if (groupId === null || groupId === undefined) throw new Error("Choose a valid student group.");

  const outcome = await db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: studentGroups.id, publicId: studentGroups.publicId })
      .from(studentGroups)
      .where(and(eq(studentGroups.id, groupId), eq(studentGroups.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!group) return "not-found";

    await tx.delete(studentGroups).where(
      and(eq(studentGroups.id, group.id), eq(studentGroups.schoolId, context.schoolId)),
    );
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.group.deleted",
      resourceType: "student_group",
      resourcePublicId: group.publicId,
      changedFields: ["name", "description", "members"],
    });
    return "deleted";
  });
  if (outcome === "not-found") throw new Error("That student group could not be found in this school.");
  revalidateGroupPages();
}
