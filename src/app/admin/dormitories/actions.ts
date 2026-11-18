"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  dormitories,
  dormitoryRooms,
  schoolBranches,
  studentDormitoryAssignments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { hasDormitoryCapacity, isDormitoryGenderCompatible } from "@/lib/dormitory-policy";

export type DormitoryActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const optionalId = z.union([z.literal(""), idField]).transform((value) => value || null);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateDormitories() {
  revalidatePath("/admin/dormitories");
  revalidatePath("/admin/students");
  revalidatePath("/admin");
}

export async function createDormitory(
  _state: DormitoryActionState,
  formData: FormData,
): Promise<DormitoryActionState> {
  const context = await requireSchoolPermission("dormitories.manage");
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    branchId: optionalId,
    genderPolicy: z.enum(["male", "female", "mixed"]),
    description: z.string().trim().max(1000).transform((entry) => entry || null),
  }).safeParse({
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
    genderPolicy: value(formData, "genderPolicy"),
    description: value(formData, "description"),
  });
  if (!parsed.success) return { error: "Enter a valid dormitory name and gender policy." };

  try {
    if (parsed.data.branchId) {
      const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
        eq(schoolBranches.id, parsed.data.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      )).limit(1);
      if (!branch) return { error: "Choose an active branch belonging to this school." };
    }

    await db.transaction(async (tx) => {
      const publicId = randomUUID();
      await tx.insert(dormitories).values({
        publicId,
        schoolId: context.schoolId,
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        genderPolicy: parsed.data.genderPolicy,
        description: parsed.data.description,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "dormitory.created",
        resourceType: "dormitory",
        resourcePublicId: publicId,
        changedFields: ["name", "branchId", "genderPolicy", "description"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A dormitory with this name already exists." };
    throw error;
  }
  revalidateDormitories();
  return { success: true, message: "Dormitory created." };
}

export async function createDormitoryRoom(
  _state: DormitoryActionState,
  formData: FormData,
): Promise<DormitoryActionState> {
  const context = await requireSchoolPermission("dormitories.manage");
  const parsed = z.object({
    dormitoryId: idField,
    roomNumber: z.string().trim().min(1).max(40),
    capacity: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(1000)),
  }).safeParse({
    dormitoryId: value(formData, "dormitoryId"),
    roomNumber: value(formData, "roomNumber"),
    capacity: value(formData, "capacity"),
  });
  if (!parsed.success) return { error: "Enter a room number and a capacity greater than zero." };

  const [dormitory] = await db.select({ id: dormitories.id }).from(dormitories).where(and(
    eq(dormitories.id, parsed.data.dormitoryId),
    eq(dormitories.schoolId, context.schoolId),
    eq(dormitories.status, "active"),
  )).limit(1);
  if (!dormitory) return { error: "Choose an active dormitory belonging to this school." };

  try {
    await db.transaction(async (tx) => {
      const publicId = randomUUID();
      await tx.insert(dormitoryRooms).values({
        publicId,
        schoolId: context.schoolId,
        dormitoryId: dormitory.id,
        roomNumber: parsed.data.roomNumber,
        capacity: parsed.data.capacity,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "dormitory_room.created",
        resourceType: "dormitory_room",
        resourcePublicId: publicId,
        changedFields: ["dormitoryId", "roomNumber", "capacity"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "That room number already exists in this dormitory." };
    throw error;
  }
  revalidateDormitories();
  return { success: true, message: "Room added." };
}

export async function assignStudentToRoom(
  _state: DormitoryActionState,
  formData: FormData,
): Promise<DormitoryActionState> {
  const context = await requireSchoolPermission("dormitories.manage");
  const parsed = z.object({
    studentId: idField,
    roomId: idField,
    assignedAt: z.string().refine(
      (date) => isCalendarDate(date) && date <= today(),
      "Enter a valid assignment date that is not in the future.",
    ),
  }).safeParse({
    studentId: value(formData, "studentId"),
    roomId: value(formData, "roomId"),
    assignedAt: value(formData, "assignedAt"),
  });
  if (!parsed.success) return { error: "Choose an eligible student, an active room, and a valid assignment date." };

  const result = await db.transaction(async (tx): Promise<DormitoryActionState> => {
    const [student] = await tx.select({
      id: students.id,
      branchId: students.branchId,
      gender: students.gender,
      status: students.status,
      publicId: students.publicId,
    }).from(students).where(and(
      eq(students.id, parsed.data.studentId),
      eq(students.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!student) return { error: "The selected student does not belong to this school." };
    const [room] = await tx.select({
      id: dormitoryRooms.id,
      capacity: dormitoryRooms.capacity,
      roomNumber: dormitoryRooms.roomNumber,
      dormitoryId: dormitories.id,
      dormitoryName: dormitories.name,
      branchId: dormitories.branchId,
      genderPolicy: dormitories.genderPolicy,
    }).from(dormitoryRooms).innerJoin(dormitories, and(
      eq(dormitories.id, dormitoryRooms.dormitoryId),
      eq(dormitories.schoolId, context.schoolId),
    )).where(and(
      eq(dormitoryRooms.id, parsed.data.roomId),
      eq(dormitoryRooms.schoolId, context.schoolId),
      eq(dormitoryRooms.status, "active"),
      eq(dormitories.status, "active"),
    )).for("update").limit(1);
    if (!room) return { error: "Choose an active room in a dormitory belonging to this school." };
    if (!["active", "admitted"].includes(student.status)) {
      return { error: "Only active or admitted students can be assigned a bed." };
    }
    if (room.branchId && room.branchId !== student.branchId) {
      return { error: "The dormitory belongs to a different branch from this student." };
    }
    if (room.genderPolicy !== "male" && room.genderPolicy !== "female" && room.genderPolicy !== "mixed") {
      return { error: "This dormitory has an invalid resident policy. Update the dormitory before assigning students." };
    }
    if (!isDormitoryGenderCompatible(room.genderPolicy, student.gender)) {
      return { error: "This student does not match the dormitory's gender policy." };
    }

    const [existingAssignment] = await tx.select({ id: studentDormitoryAssignments.id })
      .from(studentDormitoryAssignments).where(and(
        eq(studentDormitoryAssignments.schoolId, context.schoolId),
        eq(studentDormitoryAssignments.studentId, student.id),
        eq(studentDormitoryAssignments.status, "active"),
      )).limit(1);
    if (existingAssignment) return { error: "This student already has an active room assignment." };
    const [occupancy] = await tx.select({ value: count() }).from(studentDormitoryAssignments).where(and(
      eq(studentDormitoryAssignments.schoolId, context.schoolId),
      eq(studentDormitoryAssignments.roomId, room.id),
      eq(studentDormitoryAssignments.status, "active"),
    ));
    if (!hasDormitoryCapacity(room.capacity, Number(occupancy?.value ?? 0))) {
      return { error: "This room is full. Choose a room with an available bed." };
    }

    const publicId = randomUUID();
    await tx.insert(studentDormitoryAssignments).values({
      publicId,
      schoolId: context.schoolId,
      studentId: student.id,
      roomId: room.id,
      assignedAt: parsed.data.assignedAt,
      assignedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.dormitory.assigned",
      resourceType: "student_dormitory_assignment",
      resourcePublicId: publicId,
      changedFields: ["studentId", "roomId", "assignedAt"],
    });
    return { success: true, message: `Student assigned to ${room.dormitoryName}, room ${room.roomNumber}.` };
  });

  revalidateDormitories();
  return result;
}

export async function endStudentRoomAssignment(
  _state: DormitoryActionState,
  formData: FormData,
): Promise<DormitoryActionState> {
  const context = await requireSchoolPermission("dormitories.manage");
  const parsed = z.object({
    assignmentId: idField,
    leftAt: z.string().refine(isCalendarDate, "Enter a valid checkout date."),
  }).safeParse({
    assignmentId: value(formData, "assignmentId"),
    leftAt: value(formData, "leftAt"),
  });
  if (!parsed.success) return { error: "Choose a valid assignment and checkout date." };

  const result = await db.transaction(async (tx): Promise<DormitoryActionState> => {
    const [assignment] = await tx.select({
      id: studentDormitoryAssignments.id,
      publicId: studentDormitoryAssignments.publicId,
      assignedAt: studentDormitoryAssignments.assignedAt,
    }).from(studentDormitoryAssignments).where(and(
      eq(studentDormitoryAssignments.id, parsed.data.assignmentId),
      eq(studentDormitoryAssignments.schoolId, context.schoolId),
      eq(studentDormitoryAssignments.status, "active"),
    )).for("update").limit(1);
    if (!assignment) return { error: "That room assignment is no longer active." };
    if (parsed.data.leftAt < assignment.assignedAt || parsed.data.leftAt > today()) {
      return { error: "Checkout must be on or after the assignment date and cannot be in the future." };
    }
    await tx.update(studentDormitoryAssignments).set({
      status: "completed",
      leftAt: parsed.data.leftAt,
    }).where(and(
      eq(studentDormitoryAssignments.id, assignment.id),
      eq(studentDormitoryAssignments.schoolId, context.schoolId),
      eq(studentDormitoryAssignments.status, "active"),
    ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.dormitory.checked_out",
      resourceType: "student_dormitory_assignment",
      resourcePublicId: assignment.publicId,
      changedFields: ["status", "leftAt"],
    });
    return { success: true, message: "Student checked out." };
  });
  if (!result.success) return result;
  revalidateDormitories();
  return result;
}
