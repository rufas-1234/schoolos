"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicHolidays,
  academicTerms,
  academicYears,
  auditLogs,
  classRooms,
  classRoutines,
  classLevels,
  classSections,
  classSubjects,
  schools,
  schoolBranches,
  studentAcademicEvents,
  studentEnrollments,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  canTransitionAcademicYear,
  enrollmentOperationTypes,
  isCalendarDate,
  isDateRangeWithin,
  doTimeRangesOverlap,
  isValidDateRange,
  isValidEnrollmentOperation,
  isValidTimeRange,
} from "@/lib/academic-policy";
import type { AcademicActionState } from "./actions";

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const optionalIdField = z.union([z.literal(""), idField]).transform((value) =>
  value === "" ? null : value,
);
const dateField = z.string().refine(isCalendarDate);
const MAX_SECTION_CAPACITY = 4_294_967_295;
const requiredText = (max: number) => z.string().trim().min(1).max(max);

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

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: Awaited<ReturnType<typeof requireSchoolPermission>>,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({
    schoolId: context.schoolId,
    actorUserId: context.user.id,
    action,
    resourceType,
    resourcePublicId,
    changedFields,
  });
}

export async function setAcademicYearStatus(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = z
    .object({
      academicYearId: idField,
      status: z.enum(["active", "archived"]),
    })
    .safeParse({
      academicYearId: readFormValue(formData, "academicYearId"),
      status: readFormValue(formData, "status"),
    });
  if (!result.success) return { error: "Choose an academic year and a valid action." };

  const outcome = await db.transaction(async (tx) => {
    const [school] = await tx
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, context.schoolId))
      .for("update")
      .limit(1);
    if (!school) return "year-not-found";

    const [year] = await tx
      .select({
        id: academicYears.id,
        publicId: academicYears.publicId,
        status: academicYears.status,
      })
      .from(academicYears)
      .where(
        and(
          eq(academicYears.id, result.data.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!year) return "year-not-found";
    if (!canTransitionAcademicYear(year.status, result.data.status)) return "invalid-transition";

    if (result.data.status === "active") {
      const [activeYear] = await tx
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.schoolId, context.schoolId),
            eq(academicYears.status, "active"),
            ne(academicYears.id, year.id),
          ),
        )
        .for("update")
        .limit(1);
      if (activeYear) {
        const [currentEnrollments] = await tx
          .select({ total: count() })
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.schoolId, context.schoolId),
              eq(studentEnrollments.academicYearId, activeYear.id),
              eq(studentEnrollments.status, "enrolled"),
            ),
          );
        if (Number(currentEnrollments.total) > 0) return "current-year-has-enrollments";
      }
      await tx
        .update(academicYears)
        .set({ status: "planned" })
        .where(
          and(
            eq(academicYears.schoolId, context.schoolId),
            eq(academicYears.status, "active"),
            ne(academicYears.id, year.id),
          ),
        );
    }
    if (result.data.status === "archived") {
      const [currentEnrollments] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.academicYearId, year.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(currentEnrollments.total) > 0) return "current-year-has-enrollments";
    }
    await tx
      .update(academicYears)
      .set({ status: result.data.status })
      .where(and(eq(academicYears.id, year.id), eq(academicYears.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      `academic.year.${result.data.status}`,
      "academic_year",
      year.publicId,
      ["status"],
    );
    return "updated";
  });

  if (outcome === "year-not-found") return { error: "Choose an academic year belonging to your school." };
  if (outcome === "invalid-transition") {
    return { error: "Archived academic years cannot be changed; choose a planned or active year." };
  }
  if (outcome === "current-year-has-enrollments") {
    return { error: "Finish or transfer all current student enrollments before changing or archiving this year." };
  }
  revalidatePath("/admin/academics");
  return { success: true };
}

const branchSchema = z.object({
  name: requiredText(120),
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  contactNumber: z.string().trim().max(40),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  address: z.string().trim().max(1000),
});

export async function createSchoolBranch(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid branch." };
  const result = branchSchema.safeParse({
    name: readFormValue(formData, "name"),
    code: readFormValue(formData, "code"),
    contactNumber: readFormValue(formData, "contactNumber"),
    email: readFormValue(formData, "email"),
    address: readFormValue(formData, "address"),
  });
  if (!result.success) return { error: "Enter a branch name, short code, and valid contact details." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [branch] = await tx
          .select({ id: schoolBranches.id, publicId: schoolBranches.publicId })
          .from(schoolBranches)
          .where(and(eq(schoolBranches.id, recordId), eq(schoolBranches.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!branch) return "branch-not-found";

        await tx
          .update(schoolBranches)
          .set({
            ...result.data,
            contactNumber: result.data.contactNumber || null,
            email: result.data.email || null,
            address: result.data.address || null,
          })
          .where(and(eq(schoolBranches.id, recordId), eq(schoolBranches.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.branch.updated", "school_branch", branch.publicId, [
          "name",
          "code",
          "contactNumber",
          "email",
          "address",
        ]);
        return "updated";
      }

      await tx.insert(schoolBranches).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
        contactNumber: result.data.contactNumber || null,
        email: result.data.email || null,
        address: result.data.address || null,
      });
      await writeAudit(tx, context, "academic.branch.created", "school_branch", publicId, [
        "name",
        "code",
        "contactNumber",
        "email",
        "address",
      ]);
      return "created";
    });
    if (outcome === "branch-not-found") return { error: "Branch was not found in this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A branch with that name or code already exists." };
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function setSchoolBranchStatus(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = z
    .object({
      branchId: idField,
      status: z.enum(["active", "inactive"]),
    })
    .safeParse({
      branchId: readFormValue(formData, "branchId"),
      status: readFormValue(formData, "status"),
    });
  if (!result.success) throw new Error("Invalid branch status request.");

  await db.transaction(async (tx) => {
    const [branch] = await tx
      .select({
        id: schoolBranches.id,
        publicId: schoolBranches.publicId,
        status: schoolBranches.status,
      })
      .from(schoolBranches)
      .where(
        and(
          eq(schoolBranches.id, result.data.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!branch) throw new Error("Branch was not found in this school.");
    if (branch.status === result.data.status) return;

    if (result.data.status === "inactive") {
      const [classes] = await tx
        .select({ total: count() })
        .from(classLevels)
        .where(
          and(eq(classLevels.schoolId, context.schoolId), eq(classLevels.branchId, branch.id)),
        );
      const [subjectsCount] = await tx
        .select({ total: count() })
        .from(subjects)
        .where(and(eq(subjects.schoolId, context.schoolId), eq(subjects.branchId, branch.id)));
      const [teachersCount] = await tx
        .select({ total: count() })
        .from(teachers)
        .where(and(eq(teachers.schoolId, context.schoolId), eq(teachers.branchId, branch.id)));
      const [rooms] = await tx
        .select({ total: count() })
        .from(classRooms)
        .where(and(eq(classRooms.schoolId, context.schoolId), eq(classRooms.branchId, branch.id)));
      if (
        Number(classes.total) + Number(subjectsCount.total) +
          Number(teachersCount.total) + Number(rooms.total) >
        0
      ) {
        throw new Error("Move or remove this branch's academic records before deactivating it.");
      }
    }

    await tx
      .update(schoolBranches)
      .set({ status: result.data.status })
      .where(and(eq(schoolBranches.id, branch.id), eq(schoolBranches.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      `academic.branch.${result.data.status}`,
      "school_branch",
      branch.publicId,
      ["status"],
    );
  });

  revalidatePath("/admin/academics");
}

const teacherSchema = z.object({
  branchId: idField,
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  employeeCode: z.string().trim().max(40).transform((value) => value.toUpperCase()),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
});

export async function createTeacher(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid teacher." };
  const result = teacherSchema.safeParse({
    branchId: readFormValue(formData, "branchId"),
    firstName: readFormValue(formData, "firstName"),
    lastName: readFormValue(formData, "lastName"),
    employeeCode: readFormValue(formData, "employeeCode"),
    email: readFormValue(formData, "email"),
    phone: readFormValue(formData, "phone"),
  });
  if (!result.success) return { error: "Enter valid teacher details and contact information." };

  const [branch] = await db
    .select({ id: schoolBranches.id })
    .from(schoolBranches)
    .where(
      and(
        eq(schoolBranches.id, result.data.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ),
    )
    .limit(1);
  if (!branch) return { error: "Choose an active branch belonging to your school." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [teacher] = await tx
          .select({ id: teachers.id, publicId: teachers.publicId, branchId: teachers.branchId })
          .from(teachers)
          .where(and(eq(teachers.id, recordId), eq(teachers.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!teacher) return "teacher-not-found";

        if (teacher.branchId !== result.data.branchId) {
          const [[sectionCount], [subjectCount]] = await Promise.all([
            tx
              .select({ total: count() })
              .from(classSections)
              .where(and(eq(classSections.schoolId, context.schoolId), eq(classSections.classTeacherId, recordId))),
            tx
              .select({ total: count() })
              .from(classSubjects)
              .where(and(eq(classSubjects.schoolId, context.schoolId), eq(classSubjects.teacherId, recordId))),
          ]);
          if (Number(sectionCount.total) + Number(subjectCount.total) > 0) return "teacher-has-assignments";
        }

        await tx
          .update(teachers)
          .set({
            branchId: result.data.branchId,
            firstName: result.data.firstName,
            lastName: result.data.lastName,
            employeeCode: result.data.employeeCode || null,
            email: result.data.email || null,
            phone: result.data.phone || null,
          })
          .where(and(eq(teachers.id, recordId), eq(teachers.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.teacher.updated", "teacher", teacher.publicId, [
          "branchId",
          "firstName",
          "lastName",
          "employeeCode",
          "email",
          "phone",
        ]);
        return "updated";
      }

      await tx.insert(teachers).values({
        publicId,
        schoolId: context.schoolId,
        branchId: result.data.branchId,
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        employeeCode: result.data.employeeCode || null,
        email: result.data.email || null,
        phone: result.data.phone || null,
      });
      await writeAudit(tx, context, "academic.teacher.created", "teacher", publicId, [
        "firstName",
        "lastName",
        "employeeCode",
        "email",
        "phone",
      ]);
      return "created";
    });
    if (outcome === "teacher-not-found") return { error: "Teacher was not found in this school." };
    if (outcome === "teacher-has-assignments") {
      return { error: "A teacher's branch cannot be changed while they are assigned to a class or subject." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "A teacher with that employee code or email already exists for this school." };
    }
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

const classRoomSchema = z.object({
  branchId: idField,
  roomNumber: requiredText(80),
  capacity: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value <= 4_294_967_295),
  location: z.string().trim().max(255),
});

export async function createClassRoom(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid classroom." };
  const result = classRoomSchema.safeParse({
    branchId: readFormValue(formData, "branchId"),
    roomNumber: readFormValue(formData, "roomNumber"),
    capacity: readFormValue(formData, "capacity"),
    location: readFormValue(formData, "location"),
  });
  if (!result.success) return { error: "Enter a room number, a positive capacity, and valid details." };

  const [branch] = await db
    .select({ id: schoolBranches.id })
    .from(schoolBranches)
    .where(
      and(
        eq(schoolBranches.id, result.data.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ),
    )
    .limit(1);
  if (!branch) return { error: "Choose an active branch belonging to your school." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [room] = await tx
          .select({ id: classRooms.id, publicId: classRooms.publicId, branchId: classRooms.branchId })
          .from(classRooms)
          .where(and(eq(classRooms.id, recordId), eq(classRooms.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!room) return "room-not-found";

        if (room.branchId !== result.data.branchId) {
          const [routineCount] = await tx
            .select({ total: count() })
            .from(classRoutines)
            .where(and(eq(classRoutines.schoolId, context.schoolId), eq(classRoutines.classRoomId, recordId)));
          if (Number(routineCount.total) > 0) return "room-has-routines";
        }

        await tx
          .update(classRooms)
          .set({
            branchId: result.data.branchId,
            roomNumber: result.data.roomNumber,
            capacity: result.data.capacity,
            location: result.data.location || null,
          })
          .where(and(eq(classRooms.id, recordId), eq(classRooms.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.classroom.updated", "class_room", room.publicId, [
          "branchId",
          "roomNumber",
          "capacity",
          "location",
        ]);
        return "updated";
      }

      await tx.insert(classRooms).values({
        publicId,
        schoolId: context.schoolId,
        branchId: result.data.branchId,
        roomNumber: result.data.roomNumber,
        capacity: result.data.capacity,
        location: result.data.location || null,
      });
      await writeAudit(tx, context, "academic.classroom.created", "class_room", publicId, [
        "branchId",
        "roomNumber",
        "capacity",
        "location",
      ]);
      return "created";
    });
    if (outcome === "room-not-found") return { error: "Classroom was not found in this school." };
    if (outcome === "room-has-routines") {
      return { error: "A classroom's branch cannot be changed while it is used in the timetable." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "That room number already exists at this branch." };
    }
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

const classRoutineSchema = z
  .object({
    sectionId: idField,
    classSubjectId: idField,
    classRoomId: optionalIdField,
    dayOfWeek: z.string().regex(/^[1-7]$/).transform(Number),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .refine((value) => isValidTimeRange(value.startsAt, value.endsAt), {
    path: ["endsAt"],
  });

export async function createClassRoutine(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid class routine." };
  const result = classRoutineSchema.safeParse({
    sectionId: readFormValue(formData, "sectionId"),
    classSubjectId: readFormValue(formData, "classSubjectId"),
    classRoomId: readFormValue(formData, "classRoomId"),
    dayOfWeek: readFormValue(formData, "dayOfWeek"),
    startsAt: readFormValue(formData, "startsAt"),
    endsAt: readFormValue(formData, "endsAt"),
  });
  if (!result.success) return { error: "Choose the class details and enter a valid time period." };

  const publicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [school] = await tx
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, context.schoolId))
      .for("update")
      .limit(1);
    if (!school) return "school-not-found";

    const [existingRoutine] =
      recordId === null
        ? []
        : await tx
            .select({ id: classRoutines.id, publicId: classRoutines.publicId })
            .from(classRoutines)
            .where(and(eq(classRoutines.id, recordId), eq(classRoutines.schoolId, context.schoolId)))
            .for("update")
            .limit(1);
    if (recordId !== null && !existingRoutine) return "routine-not-found";

    const [section] = await tx
      .select({
        id: classSections.id,
        classLevelId: classSections.classLevelId,
        branchId: classLevels.branchId,
        yearStatus: academicYears.status,
      })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .where(
        and(
          eq(classSections.id, result.data.sectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classLevels.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!section) return "section-not-found";
    if (section.yearStatus === "archived") return "year-archived";

    const [assignment] = await tx
      .select({
        id: classSubjects.id,
        classLevelId: classSubjects.classLevelId,
        teacherId: classSubjects.teacherId,
      })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.id, result.data.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!assignment) return "subject-not-found";
    if (assignment.classLevelId !== section.classLevelId) return "subject-class-mismatch";

    if (result.data.classRoomId !== null) {
      const [room] = await tx
        .select({ id: classRooms.id, branchId: classRooms.branchId })
        .from(classRooms)
        .where(
          and(
            eq(classRooms.id, result.data.classRoomId),
            eq(classRooms.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      if (!room) return "room-not-found";
      if (room.branchId !== section.branchId) return "room-branch-mismatch";
    }

    const existingRoutines = await tx
      .select({
        id: classRoutines.id,
        classSectionId: classRoutines.classSectionId,
        classRoomId: classRoutines.classRoomId,
        teacherId: classSubjects.teacherId,
        startsAt: classRoutines.startsAt,
        endsAt: classRoutines.endsAt,
      })
      .from(classRoutines)
      .leftJoin(classSubjects, eq(classRoutines.classSubjectId, classSubjects.id))
      .where(
        and(
          eq(classRoutines.schoolId, context.schoolId),
          eq(classRoutines.dayOfWeek, result.data.dayOfWeek),
        ),
      );
    const overlaps = existingRoutines.filter((routine) =>
      routine.id !== recordId &&
      doTimeRangesOverlap(
        result.data.startsAt,
        result.data.endsAt,
        routine.startsAt,
        routine.endsAt,
      ),
    );
    if (overlaps.some((routine) => routine.classSectionId === section.id)) {
      return "section-time-conflict";
    }
    if (
      result.data.classRoomId !== null &&
      overlaps.some((routine) => routine.classRoomId === result.data.classRoomId)
    ) {
      return "room-time-conflict";
    }
    if (
      assignment.teacherId !== null &&
      overlaps.some((routine) => routine.teacherId === assignment.teacherId)
    ) {
      return "teacher-time-conflict";
    }

    if (recordId !== null && existingRoutine) {
      await tx
        .update(classRoutines)
        .set({
          classSectionId: section.id,
          classSubjectId: assignment.id,
          classRoomId: result.data.classRoomId,
          dayOfWeek: result.data.dayOfWeek,
          startsAt: result.data.startsAt,
          endsAt: result.data.endsAt,
        })
        .where(and(eq(classRoutines.id, recordId), eq(classRoutines.schoolId, context.schoolId)));
      await writeAudit(tx, context, "academic.class_routine.updated", "class_routine", existingRoutine.publicId, [
        "classSectionId",
        "classSubjectId",
        "classRoomId",
        "dayOfWeek",
        "startsAt",
        "endsAt",
      ]);
      return "updated";
    }

    await tx.insert(classRoutines).values({
      publicId,
      schoolId: context.schoolId,
      classSectionId: section.id,
      classSubjectId: assignment.id,
      classRoomId: result.data.classRoomId,
      dayOfWeek: result.data.dayOfWeek,
      startsAt: result.data.startsAt,
      endsAt: result.data.endsAt,
    });
    await writeAudit(tx, context, "academic.class_routine.created", "class_routine", publicId, [
      "classSectionId",
      "classSubjectId",
      "classRoomId",
      "dayOfWeek",
      "startsAt",
      "endsAt",
    ]);
    return "created";
  });

  if (outcome === "school-not-found") return { error: "The school record could not be verified." };
  if (outcome === "routine-not-found") return { error: "Class routine was not found in this school." };
  if (outcome === "section-not-found") return { error: "Choose a class section belonging to your school." };
  if (outcome === "year-archived") return { error: "Archived academic years cannot have new class routines." };
  if (outcome === "subject-not-found") return { error: "Choose a subject assignment belonging to your school." };
  if (outcome === "subject-class-mismatch") return { error: "Choose a subject assigned to the selected class." };
  if (outcome === "room-not-found") return { error: "Choose a classroom belonging to your school." };
  if (outcome === "room-branch-mismatch") return { error: "Choose a classroom at the selected class branch." };
  if (outcome === "section-time-conflict") return { error: "That class section already has a routine during this time." };
  if (outcome === "room-time-conflict") return { error: "That classroom is already booked during this time." };
  if (outcome === "teacher-time-conflict") return { error: "That teacher is already assigned during this time." };

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function deleteClassRoutine(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = z.object({ publicId: z.string().uuid() }).safeParse({
    publicId: readFormValue(formData, "publicId"),
  });
  if (!result.success) throw new Error("Invalid class routine request.");

  await db.transaction(async (tx) => {
    const [routine] = await tx
      .select({ id: classRoutines.id, publicId: classRoutines.publicId })
      .from(classRoutines)
      .where(
        and(
          eq(classRoutines.publicId, result.data.publicId),
          eq(classRoutines.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!routine) throw new Error("Class routine was not found in this school.");
    await tx
      .delete(classRoutines)
      .where(and(eq(classRoutines.id, routine.id), eq(classRoutines.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      "academic.class_routine.deleted",
      "class_routine",
      routine.publicId,
      ["deleted"],
    );
  });

  revalidatePath("/admin/academics");
}

export async function deleteClassRoom(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = z.object({ publicId: z.string().uuid() }).safeParse({
    publicId: readFormValue(formData, "publicId"),
  });
  if (!result.success) throw new Error("Invalid classroom request.");

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ id: classRooms.id, publicId: classRooms.publicId })
      .from(classRooms)
      .where(
        and(
          eq(classRooms.publicId, result.data.publicId),
          eq(classRooms.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!room) throw new Error("Classroom was not found in this school.");
    const [usage] = await tx
      .select({ total: count() })
      .from(classRoutines)
      .where(
        and(
          eq(classRoutines.schoolId, context.schoolId),
          eq(classRoutines.classRoomId, room.id),
        ),
      );
    if (Number(usage.total) > 0) {
      throw new Error("Remove this classroom from its class routines before deleting it.");
    }
    await tx
      .delete(classRooms)
      .where(and(eq(classRooms.id, room.id), eq(classRooms.schoolId, context.schoolId)));
    await writeAudit(tx, context, "academic.classroom.deleted", "class_room", room.publicId, [
      "deleted",
    ]);
  });

  revalidatePath("/admin/academics");
}

const holidaySchema = z
  .object({
    academicYearId: idField,
    academicTermId: optionalIdField,
    name: requiredText(120),
    startDate: dateField,
    endDate: dateField,
  })
  .refine((value) => isValidDateRange(value.startDate, value.endDate), { path: ["endDate"] });

export async function createAcademicHoliday(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid school holiday." };
  const result = holidaySchema.safeParse({
    academicYearId: readFormValue(formData, "academicYearId"),
    academicTermId: readFormValue(formData, "academicTermId"),
    name: readFormValue(formData, "name"),
    startDate: readFormValue(formData, "startDate"),
    endDate: readFormValue(formData, "endDate"),
  });
  if (!result.success) return { error: "Enter a holiday name and valid date range." };

  const [year] = await db
    .select({
      id: academicYears.id,
      startDate: academicYears.startDate,
      endDate: academicYears.endDate,
    })
    .from(academicYears)
    .where(
      and(
        eq(academicYears.id, result.data.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ),
    )
    .limit(1);
  if (!year) return { error: "Choose an academic year belonging to your school." };
  if (!isDateRangeWithin(result.data.startDate, result.data.endDate, year.startDate, year.endDate)) {
    return { error: "Holiday dates must fall within the selected academic year." };
  }

  if (result.data.academicTermId !== null) {
    const [term] = await db
      .select({
        id: academicTerms.id,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
      })
      .from(academicTerms)
      .where(
        and(
          eq(academicTerms.id, result.data.academicTermId),
          eq(academicTerms.academicYearId, year.id),
          eq(academicTerms.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    if (!term) return { error: "Choose a term belonging to the selected academic year." };
    if (!isDateRangeWithin(result.data.startDate, result.data.endDate, term.startDate, term.endDate)) {
      return { error: "Holiday dates must fall within the selected term." };
    }
  }

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [holiday] = await tx
          .select({ id: academicHolidays.id, publicId: academicHolidays.publicId })
          .from(academicHolidays)
          .where(and(eq(academicHolidays.id, recordId), eq(academicHolidays.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!holiday) return "holiday-not-found";

        await tx
          .update(academicHolidays)
          .set(result.data)
          .where(and(eq(academicHolidays.id, recordId), eq(academicHolidays.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.holiday.updated", "academic_holiday", holiday.publicId, [
          "academicYearId",
          "academicTermId",
          "name",
          "startDate",
          "endDate",
        ]);
        return "updated";
      }

      await tx.insert(academicHolidays).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.holiday.created", "academic_holiday", publicId, [
        "academicYearId",
        "academicTermId",
        "name",
        "startDate",
        "endDate",
      ]);
      return "created";
    });
    if (outcome === "holiday-not-found") return { error: "School holiday was not found in this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "A holiday with that name and start date already exists for this year." };
    }
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

const sectionAssignmentSchema = z.object({
  sectionId: idField,
  capacity: z
    .union([z.literal(""), z.string().regex(/^[1-9]\d*$/)])
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isSafeInteger(value) && value <= MAX_SECTION_CAPACITY),
    ),
  teacherId: optionalIdField,
});

export async function updateSectionAssignment(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = sectionAssignmentSchema.safeParse({
    sectionId: readFormValue(formData, "sectionId"),
    capacity: readFormValue(formData, "capacity"),
    teacherId: readFormValue(formData, "teacherId"),
  });
  if (!result.success) return { error: "Choose a section, a valid capacity, and an optional class teacher." };

  const outcome = await db.transaction(async (tx) => {
    const [section] = await tx
      .select({
        id: classSections.id,
        publicId: classSections.publicId,
        capacity: classSections.capacity,
        branchId: classLevels.branchId,
      })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .where(and(eq(classSections.id, result.data.sectionId), eq(classSections.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!section) return "section-not-found";

    if (result.data.teacherId !== null) {
      const [teacher] = await tx
        .select({ id: teachers.id, branchId: teachers.branchId })
        .from(teachers)
        .where(
          and(
            eq(teachers.id, result.data.teacherId),
            eq(teachers.schoolId, context.schoolId),
            eq(teachers.status, "active"),
          ),
        )
        .limit(1);
      if (!teacher) return "teacher-not-found";
      if (teacher.branchId !== section.branchId) return "teacher-branch-mismatch";
    }

    if (result.data.capacity !== null) {
      const [enrollmentCount] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.classSectionId, section.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(enrollmentCount.total) > result.data.capacity) return "capacity-too-low";
    }

    await tx
      .update(classSections)
      .set({ capacity: result.data.capacity, classTeacherId: result.data.teacherId })
      .where(and(eq(classSections.id, section.id), eq(classSections.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      "academic.section.assignment.updated",
      "class_section",
      section.publicId,
      ["capacity", "classTeacherId"],
    );
    return "updated";
  });

  if (outcome === "section-not-found") return { error: "Choose a section belonging to your school." };
  if (outcome === "teacher-not-found") return { error: "Choose an active teacher belonging to your school." };
  if (outcome === "teacher-branch-mismatch") return { error: "Choose a teacher who works at the selected class branch." };
  if (outcome === "capacity-too-low") {
    return { error: "Capacity cannot be lower than the number of currently enrolled students." };
  }
  revalidatePath("/admin/academics");
  return { success: true };
}

export async function setClassLevelStatus(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const classLevelId = idField.safeParse(readFormValue(formData, "classLevelId"));
  const status = z.enum(["active", "archived"]).safeParse(readFormValue(formData, "status"));
  if (!classLevelId.success || !status.success) {
    return { error: "Choose a class and valid status." };
  }

  const outcome = await db.transaction(async (tx) => {
    const [classLevel] = await tx.select({
      id: classLevels.id,
      publicId: classLevels.publicId,
      status: classLevels.status,
    })
      .from(classLevels)
      .where(and(eq(classLevels.id, classLevelId.data), eq(classLevels.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!classLevel) return "class-not-found";
    if (status.data === "archived") {
      const [activeEnrollments] = await tx.select({ total: count() })
        .from(studentEnrollments)
        .innerJoin(classSections, eq(classSections.id, studentEnrollments.classSectionId))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(classSections.classLevelId, classLevel.id),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ));
      if (Number(activeEnrollments.total) > 0) return "class-has-students";
    }
    if (classLevel.status === status.data) return "unchanged";
    await tx.update(classLevels).set({ status: status.data })
      .where(and(eq(classLevels.id, classLevel.id), eq(classLevels.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      status.data === "archived" ? "academic.class_level.archived" : "academic.class_level.restored",
      "class_level",
      classLevel.publicId,
      ["status"],
    );
    return "updated";
  });

  if (outcome === "class-not-found") return { error: "Choose a class belonging to your school." };
  if (outcome === "class-has-students") {
    return { error: "Move currently assigned students before archiving this class. Historical enrollment and fee records will be preserved." };
  }
  revalidatePath("/admin/academics");
  revalidatePath("/admin/students");
  revalidatePath("/admin/fees");
  return { success: true };
}

const subjectTeacherSchema = z.object({
  assignmentId: idField,
  teacherId: optionalIdField,
});

export async function updateSubjectTeacher(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = subjectTeacherSchema.safeParse({
    assignmentId: readFormValue(formData, "assignmentId"),
    teacherId: readFormValue(formData, "teacherId"),
  });
  if (!result.success) return { error: "Choose a class-subject assignment and an optional teacher." };

  const outcome = await db.transaction(async (tx) => {
    const [school] = await tx
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, context.schoolId))
      .for("update")
      .limit(1);
    if (!school) return "school-not-found";

    const [assignment] = await tx
      .select({
        id: classSubjects.id,
        publicId: classSubjects.publicId,
        branchId: classLevels.branchId,
      })
      .from(classSubjects)
      .innerJoin(classLevels, eq(classSubjects.classLevelId, classLevels.id))
      .where(
        and(
          eq(classSubjects.id, result.data.assignmentId),
          eq(classSubjects.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!assignment) return "assignment-not-found";

    if (result.data.teacherId !== null) {
      const [teacher] = await tx
        .select({ id: teachers.id, branchId: teachers.branchId })
        .from(teachers)
        .where(
          and(
            eq(teachers.id, result.data.teacherId),
            eq(teachers.schoolId, context.schoolId),
            eq(teachers.status, "active"),
          ),
        )
        .limit(1);
      if (!teacher) return "teacher-not-found";
      if (teacher.branchId !== assignment.branchId) return "teacher-branch-mismatch";

      const assignmentRoutines = await tx
        .select({
          dayOfWeek: classRoutines.dayOfWeek,
          startsAt: classRoutines.startsAt,
          endsAt: classRoutines.endsAt,
        })
        .from(classRoutines)
        .where(
          and(
            eq(classRoutines.schoolId, context.schoolId),
            eq(classRoutines.classSubjectId, assignment.id),
          ),
        );
      const teacherRoutines = await tx
        .select({
          dayOfWeek: classRoutines.dayOfWeek,
          startsAt: classRoutines.startsAt,
          endsAt: classRoutines.endsAt,
        })
        .from(classRoutines)
        .innerJoin(classSubjects, eq(classRoutines.classSubjectId, classSubjects.id))
        .where(
          and(
            eq(classRoutines.schoolId, context.schoolId),
            eq(classSubjects.teacherId, teacher.id),
            ne(classSubjects.id, assignment.id),
          ),
        );
      if (
        assignmentRoutines.some((routine) =>
          teacherRoutines.some(
            (other) =>
              other.dayOfWeek === routine.dayOfWeek &&
              doTimeRangesOverlap(
                routine.startsAt,
                routine.endsAt,
                other.startsAt,
                other.endsAt,
              ),
          ),
        )
      ) {
        return "teacher-time-conflict";
      }
    }

    await tx
      .update(classSubjects)
      .set({ teacherId: result.data.teacherId })
      .where(and(eq(classSubjects.id, assignment.id), eq(classSubjects.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      "academic.subject.teacher.updated",
      "class_subject",
      assignment.publicId,
      ["teacherId"],
    );
    return "updated";
  });

  if (outcome === "school-not-found") return { error: "The school record could not be verified." };
  if (outcome === "assignment-not-found") return { error: "Choose an assignment belonging to your school." };
  if (outcome === "teacher-not-found") return { error: "Choose an active teacher belonging to your school." };
  if (outcome === "teacher-branch-mismatch") return { error: "Choose a teacher who works at the selected class branch." };
  if (outcome === "teacher-time-conflict") {
    return { error: "That teacher already has a class routine during the selected period." };
  }
  revalidatePath("/admin/academics");
  return { success: true };
}

const placementSchema = z.object({
  studentId: idField,
  sectionId: idField,
  eventType: z.enum(["initial_placement", "transfer_in"]),
  eventDate: dateField,
  reason: requiredText(1000),
  externalInstitution: z.string().trim().max(255),
});

export async function placeStudent(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("students.update");
  const result = placementSchema.safeParse({
    studentId: readFormValue(formData, "studentId"),
    sectionId: readFormValue(formData, "sectionId"),
    eventType: readFormValue(formData, "eventType"),
    eventDate: readFormValue(formData, "eventDate"),
    reason: readFormValue(formData, "reason"),
    externalInstitution: readFormValue(formData, "externalInstitution"),
  });
  if (!result.success) return { error: "Enter valid placement details and an explanation." };
  if (result.data.eventType === "transfer_in" && !result.data.externalInstitution) {
    return { error: "Enter the previous school for a transfer-in." };
  }

  const enrollmentPublicId = randomUUID();
  const eventPublicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        status: students.status,
        branchId: students.branchId,
      })
      .from(students)
      .where(and(eq(students.id, result.data.studentId), eq(students.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!student) return "student-not-found";
    if (student.status !== "admitted" && student.status !== "active") return "student-not-ready";

    const [section] = await tx
      .select({
        id: classSections.id,
        academicYearId: classSections.academicYearId,
        capacity: classSections.capacity,
        yearStartDate: academicYears.startDate,
        yearEndDate: academicYears.endDate,
        yearStatus: academicYears.status,
        branchId: classLevels.branchId,
      })
      .from(classSections)
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .where(
        and(
          eq(classSections.id, result.data.sectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classLevels.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!section) return "section-not-found";
    if (student.branchId !== null && student.branchId !== section.branchId) return "branch-mismatch";
    if (section.yearStatus !== "active") return "year-not-active";
    if (!isDateRangeWithin(result.data.eventDate, result.data.eventDate, section.yearStartDate, section.yearEndDate)) {
      return "date-outside-year";
    }

    const [existingYearEnrollment] = await tx
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.studentId, student.id),
          eq(studentEnrollments.academicYearId, section.academicYearId),
        ),
      )
      .for("update")
      .limit(1);
    if (existingYearEnrollment) return "already-enrolled-this-year";

    const [currentEnrollment] = await tx
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.studentId, student.id),
          eq(studentEnrollments.status, "enrolled"),
        ),
      )
      .for("update")
      .limit(1);
    if (currentEnrollment) return "finish-current-enrollment";

    if (section.capacity !== null) {
      const [enrollmentCount] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.classSectionId, section.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(enrollmentCount.total) >= section.capacity) return "section-full";
    }

    await tx.insert(studentEnrollments).values({
      publicId: enrollmentPublicId,
      schoolId: context.schoolId,
      studentId: student.id,
      academicYearId: section.academicYearId,
      classSectionId: section.id,
      enrolledAt: result.data.eventDate,
    });
    const [enrollment] = await tx
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(eq(studentEnrollments.publicId, enrollmentPublicId))
      .limit(1);
    if (!enrollment) throw new Error("The new enrollment could not be read after insertion.");

    if (student.status === "admitted" || student.branchId === null) {
      await tx
        .update(students)
        .set({
          ...(student.status === "admitted" ? { status: "active" } : {}),
          ...(student.branchId === null ? { branchId: section.branchId } : {}),
        })
        .where(and(eq(students.id, student.id), eq(students.schoolId, context.schoolId)));
    }
    await tx.insert(studentAcademicEvents).values({
      publicId: eventPublicId,
      schoolId: context.schoolId,
      studentId: student.id,
      toEnrollmentId: enrollment.id,
      toClassSectionId: section.id,
      eventType: result.data.eventType,
      eventDate: result.data.eventDate,
      reason: result.data.reason,
      externalInstitution: result.data.externalInstitution || null,
      createdBy: context.user.id,
    });
    await writeAudit(
      tx,
      context,
      `student.enrollment.${result.data.eventType}`,
      "student",
      student.publicId,
      ["academicYearId", "classSectionId", "branchId", "status"],
    );
    return "created";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "enrollment-conflict" as const;
    throw error;
  });

  const placementErrors: Record<string, string> = {
    "student-not-found": "Choose a student belonging to your school.",
    "student-not-ready": "Only admitted or active students can be placed in a class.",
    "section-not-found": "Choose a class section belonging to your school.",
    "branch-mismatch": "Choose a class section at the student's branch.",
    "year-not-active": "Students can only be placed in a section for the active academic year.",
    "date-outside-year": "The placement date must fall within the active academic year.",
    "already-enrolled-this-year": "This student already has an enrollment record for that academic year.",
    "finish-current-enrollment": "Complete or transfer the student's current enrollment before placing them again.",
    "section-full": "The selected class section has reached its capacity.",
    "enrollment-conflict": "The student's enrollment changed while placing them. Reload the page and review the current enrollment.",
  };
  if (outcome !== "created") return { error: placementErrors[outcome] ?? "The placement could not be completed." };

  revalidatePath("/admin/academics");
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/unassigned");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

const enrollmentOperationSchema = z.object({
  enrollmentId: idField,
  operation: z.enum(enrollmentOperationTypes),
  targetYearId: optionalIdField,
  targetSectionId: optionalIdField,
  eventDate: dateField,
  reason: requiredText(1000),
  externalInstitution: z.string().trim().max(255),
});

export async function recordEnrollmentOperation(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("students.update");
  const result = enrollmentOperationSchema.safeParse({
    enrollmentId: readFormValue(formData, "enrollmentId"),
    operation: readFormValue(formData, "operation"),
    targetYearId: readFormValue(formData, "targetYearId"),
    targetSectionId: readFormValue(formData, "targetSectionId"),
    eventDate: readFormValue(formData, "eventDate"),
    reason: readFormValue(formData, "reason"),
    externalInstitution: readFormValue(formData, "externalInstitution"),
  });
  if (!result.success) return { error: "Enter valid enrollment operation details and an explanation." };
  if (result.data.operation === "transfer_out" && !result.data.externalInstitution) {
    return { error: "Enter the destination school for a transfer-out." };
  }
  if (
    result.data.operation !== "transfer_out" &&
    result.data.operation !== "graduate" &&
    (result.data.targetYearId === null || result.data.targetSectionId === null)
  ) {
    return { error: "Choose the destination academic year and class section." };
  }
  if (
    (result.data.operation === "transfer_out" || result.data.operation === "graduate") &&
    (result.data.targetYearId !== null || result.data.targetSectionId !== null)
  ) {
    return { error: "Do not select a destination year or section for this operation." };
  }

  const eventPublicId = randomUUID();
  const nextEnrollmentPublicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [sourceReference] = await tx
      .select({ studentId: studentEnrollments.studentId })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.id, result.data.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    if (!sourceReference) return "enrollment-not-found";

    const [student] = await tx
      .select({ id: students.id, publicId: students.publicId, status: students.status })
      .from(students)
      .where(
        and(
          eq(students.id, sourceReference.studentId),
          eq(students.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!student) return "source-structure-invalid";
    if (student.status !== "active") return "student-not-active";

    const [source] = await tx
      .select({
        id: studentEnrollments.id,
        publicId: studentEnrollments.publicId,
        studentId: studentEnrollments.studentId,
        academicYearId: studentEnrollments.academicYearId,
        classSectionId: studentEnrollments.classSectionId,
        status: studentEnrollments.status,
      })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.id, result.data.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!source) return "enrollment-not-found";
    if (source.status !== "enrolled") return "enrollment-not-current";

    const [sourceYear] = await tx
      .select({
        id: academicYears.id,
        startDate: academicYears.startDate,
        endDate: academicYears.endDate,
        status: academicYears.status,
      })
      .from(academicYears)
      .where(
        and(
          eq(academicYears.id, source.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    const [sourceSection] = await tx
      .select({
        id: classSections.id,
        classLevelId: classSections.classLevelId,
        academicYearId: classSections.academicYearId,
      })
      .from(classSections)
      .where(
        and(
          eq(classSections.id, source.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ),
      )
      .limit(1);
    if (
      !sourceYear ||
      !sourceSection ||
      sourceSection.academicYearId !== source.academicYearId
    ) {
      return "source-structure-invalid";
    }
    if (sourceYear.status !== "active") return "source-year-not-active";

    let targetYear:
      | { id: number; startDate: string; status: string }
      | undefined;
    let targetSection:
      | { id: number; classLevelId: number; academicYearId: number; capacity: number | null }
      | undefined;

    if (result.data.targetYearId !== null) {
      const [year] = await tx
        .select({
          id: academicYears.id,
          startDate: academicYears.startDate,
          status: academicYears.status,
        })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.id, result.data.targetYearId),
            eq(academicYears.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      targetYear = year;
      if (!targetYear) return "target-year-not-found";
      if (targetYear.status === "archived") return "target-year-archived";
    }

    if (result.data.targetSectionId !== null) {
      const [section] = await tx
        .select({
          id: classSections.id,
          classLevelId: classSections.classLevelId,
          academicYearId: classSections.academicYearId,
          capacity: classSections.capacity,
        })
        .from(classSections)
        .where(
          and(
            eq(classSections.id, result.data.targetSectionId),
            eq(classSections.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      targetSection = section;
      if (!targetSection || !targetYear) return "target-section-not-found";
      if (targetSection.academicYearId !== targetYear.id) return "target-section-year-mismatch";
    }

    if (
      !isValidEnrollmentOperation({
        operation: result.data.operation,
        sourceYearStartDate: sourceYear.startDate,
        targetYearStartDate: targetYear?.startDate,
        sourceClassLevelId: sourceSection.classLevelId,
        targetClassLevelId: targetSection?.classLevelId,
        sourceSectionId: sourceSection.id,
        targetSectionId: targetSection?.id,
      })
    ) {
      return "operation-invalid";
    }

    const isInYearTransfer = result.data.operation === "transfer_in_school";
    const isNextYearOperation =
      result.data.operation === "promote" || result.data.operation === "repeat";
    if (isNextYearOperation && result.data.eventDate < sourceYear.endDate) {
      return "operation-before-year-end";
    }
    if (
      isInYearTransfer &&
      !isDateRangeWithin(result.data.eventDate, result.data.eventDate, sourceYear.startDate, sourceYear.endDate)
    ) {
      return "operation-outside-year";
    }
    if (
      result.data.operation === "graduate" &&
      result.data.eventDate < sourceYear.endDate
    ) {
      return "operation-before-year-end";
    }
    if (
      result.data.operation === "transfer_out" &&
      !isDateRangeWithin(result.data.eventDate, result.data.eventDate, sourceYear.startDate, sourceYear.endDate)
    ) {
      return "operation-outside-year";
    }

    if (targetSection && isNextYearOperation) {
      const [otherActiveEnrollment] = await tx
        .select({ id: studentEnrollments.id })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.studentId, source.studentId),
            eq(studentEnrollments.status, "enrolled"),
            ne(studentEnrollments.id, source.id),
          ),
        )
        .for("update")
        .limit(1);
      if (otherActiveEnrollment) return "other-current-enrollment";
    }

    if (targetSection && targetSection.capacity !== null) {
      const [enrollmentCount] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.classSectionId, targetSection.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(enrollmentCount.total) >= targetSection.capacity) return "section-full";
    }

    let nextEnrollmentId: number | null = null;
    if (isNextYearOperation && targetSection && targetYear) {
      const [existingDestination] = await tx
        .select({ id: studentEnrollments.id })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.studentId, source.studentId),
            eq(studentEnrollments.academicYearId, targetYear.id),
          ),
        )
        .for("update")
        .limit(1);
      if (existingDestination) return "already-enrolled-target-year";
    }

    if (isInYearTransfer && targetSection) {
      await tx
        .update(studentEnrollments)
        .set({ classSectionId: targetSection.id })
        .where(
          and(
            eq(studentEnrollments.id, source.id),
            eq(studentEnrollments.schoolId, context.schoolId),
          ),
        );
      nextEnrollmentId = source.id;
    } else {
      const nextStatus =
        result.data.operation === "promote"
          ? "completed"
          : result.data.operation === "repeat"
            ? "repeated"
            : result.data.operation === "transfer_out"
              ? "transferred"
              : "graduated";
      await tx
        .update(studentEnrollments)
        .set({ status: nextStatus })
        .where(
          and(
            eq(studentEnrollments.id, source.id),
            eq(studentEnrollments.schoolId, context.schoolId),
          ),
        );
      if (isNextYearOperation && targetSection && targetYear) {
        await tx.insert(studentEnrollments).values({
          publicId: nextEnrollmentPublicId,
          schoolId: context.schoolId,
          studentId: source.studentId,
          academicYearId: targetYear.id,
          classSectionId: targetSection.id,
          enrolledAt: targetYear.startDate,
        });
        const [nextEnrollment] = await tx
          .select({ id: studentEnrollments.id })
          .from(studentEnrollments)
          .where(eq(studentEnrollments.publicId, nextEnrollmentPublicId))
          .limit(1);
        if (!nextEnrollment) throw new Error("The next enrollment could not be read after insertion.");
        nextEnrollmentId = nextEnrollment.id;
      }
      if (result.data.operation === "transfer_out" || result.data.operation === "graduate") {
        await tx
          .update(students)
          .set({ status: "inactive" })
          .where(
            and(
              eq(students.id, student.id),
              eq(students.schoolId, context.schoolId),
            ),
          );
      }
    }

    await tx.insert(studentAcademicEvents).values({
      publicId: eventPublicId,
      schoolId: context.schoolId,
      studentId: source.studentId,
      fromEnrollmentId: source.id,
      toEnrollmentId: nextEnrollmentId,
      fromClassSectionId: source.classSectionId,
      toClassSectionId: targetSection?.id ?? null,
      eventType: result.data.operation,
      eventDate: result.data.eventDate,
      reason: result.data.reason,
      externalInstitution: result.data.externalInstitution || null,
      createdBy: context.user.id,
    });
    await writeAudit(
      tx,
      context,
      `student.enrollment.${result.data.operation}`,
      "student_academic_event",
      eventPublicId,
      ["eventType", "eventDate", "reason", "classSectionId"],
    );
    if (result.data.operation === "transfer_out" || result.data.operation === "graduate") {
      await writeAudit(
        tx,
        context,
        `student.status.active.to.inactive`,
        "student",
        student.publicId,
        ["status"],
      );
    }
    return "recorded";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "enrollment-conflict" as const;
    throw error;
  });

  const operationErrors: Record<string, string> = {
    "enrollment-not-found": "Choose an enrollment belonging to your school.",
    "enrollment-not-current": "Only a current enrollment can receive an academic operation.",
    "student-not-active": "Only active students can receive an academic operation.",
    "source-structure-invalid": "The enrollment's academic year or section could not be verified.",
    "source-year-not-active": "The source enrollment must belong to the active academic year.",
    "target-year-not-found": "Choose a destination academic year belonging to your school.",
    "target-year-archived": "Students cannot be enrolled in an archived academic year.",
    "target-section-not-found": "Choose a destination section belonging to your school.",
    "target-section-year-mismatch": "The destination section must belong to the selected academic year.",
    "operation-invalid": "The selected operation does not match the source and destination classes.",
    "operation-before-year-end": "Promotion, repetition, and graduation must be dated on or after the academic year ends.",
    "operation-outside-year": "An in-year transfer must be dated within the active academic year.",
    "other-current-enrollment": "Resolve the student's other current enrollment before advancing them.",
    "section-full": "The destination class section has reached its capacity.",
    "already-enrolled-target-year": "The student already has an enrollment record for the destination year.",
    "enrollment-conflict": "The student's enrollment changed while recording this operation. Reload the page and review the current enrollment.",
  };
  if (outcome !== "recorded") {
    return { error: operationErrors[outcome] ?? "The academic operation could not be completed." };
  }

  revalidatePath("/admin/academics");
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/promote");
  revalidatePath("/admin/dashboard");
  return { success: true };
}
