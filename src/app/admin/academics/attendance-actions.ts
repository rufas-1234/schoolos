"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classSections,
  studentAttendance,
  studentEnrollments,
} from "@/db/schema";
import { isCalendarDate } from "@/lib/academic-policy";
import { isAttendanceStatus } from "@/lib/attendance-policy";
import { parseCsvRows } from "@/lib/csv-import";
import { requireSchoolPermission } from "@/lib/access-control";
import type { AcademicActionState } from "./actions";

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const dateField = z.string().refine(isCalendarDate);

export type AttendanceCsvImportState = { error?: string; success?: boolean; imported?: number };

export async function importAttendanceFromCsv(
  _previousState: AttendanceCsvImportState,
  formData: FormData,
): Promise<AttendanceCsvImportState> {
  const context = await requireSchoolPermission("students.update");
  const sectionResult = idField.safeParse(formData.get("classSectionId"));
  const dateResult = dateField.safeParse(formData.get("attendanceDate"));
  const uploadedFile = formData.get("csvFile");
  if (!sectionResult.success || !dateResult.success) return { error: "Choose a valid section and attendance date first." };
  if (!(uploadedFile instanceof File) || uploadedFile.size === 0) return { error: "Choose a completed attendance CSV file." };
  if (uploadedFile.size > 1_000_000) return { error: "The attendance CSV must be 1 MB or smaller." };

  let rows: string[][];
  try {
    rows = parseCsvRows(await uploadedFile.text());
  } catch (error) {
    return { error: error instanceof Error ? `The CSV file is invalid: ${error.message}` : "The CSV file is invalid." };
  }
  const nonemptyRows = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = nonemptyRows[0]?.map((header) => header.trim().toLocaleLowerCase());
  if (!headers?.length) return { error: "The CSV file is empty." };
  if (new Set(headers).size !== headers.length) return { error: "The CSV contains duplicate column names." };
  const supportedHeaders = new Set(["studentid", "admissionnumber", "studentname", "attendancedate", "status", "note"]);
  const unknownHeader = headers.find((header) => !supportedHeaders.has(header));
  if (unknownHeader) return { error: `Unsupported CSV column: ${unknownHeader}.` };
  const index = new Map(headers.map((header, column) => [header, column]));
  for (const required of ["studentid", "attendancedate", "status"]) {
    if (!index.has(required)) return { error: `The CSV is missing the required "${required}" column.` };
  }
  const dataRows = nonemptyRows.slice(1);
  if (!dataRows.length) return { error: "The CSV has headers but no student rows." };
  if (dataRows.length > 1000) return { error: "Import attendance for up to 1,000 students at a time." };

  const byStudent = new Map<number, { status: string; note: string }>();
  for (const [rowNumber, row] of dataRows.entries()) {
    const studentIdResult = idField.safeParse(row[index.get("studentid")!] ?? "");
    if (!studentIdResult.success) return { error: `Row ${rowNumber + 2}: enter a valid student ID.` };
    if (byStudent.has(studentIdResult.data)) return { error: `Row ${rowNumber + 2}: student IDs must not be repeated.` };
    const rowDate = (row[index.get("attendancedate")!] ?? "").trim();
    if (rowDate !== dateResult.data) return { error: `Row ${rowNumber + 2}: the date must match the selected attendance date (${dateResult.data}).` };
    const status = (row[index.get("status")!] ?? "").trim().toLocaleLowerCase();
    const note = (row[index.get("note")!] ?? "").trim();
    if (status && !isAttendanceStatus(status)) return { error: `Row ${rowNumber + 2}: use Present, Absent, Late, Excused, or leave status blank.` };
    if (note.length > 500) return { error: `Row ${rowNumber + 2}: notes must be 500 characters or fewer.` };
    if (status) byStudent.set(studentIdResult.data, { status, note });
  }
  if (!byStudent.size) return { error: "Add a status to at least one student row before uploading." };

  const sectionId = sectionResult.data;
  const studentIds = [...byStudent.keys()];
  const outcome = await db.transaction(async (tx) => {
    const [section] = await tx.select({ publicId: classSections.publicId, academicYearId: classSections.academicYearId })
      .from(classSections).innerJoin(academicYears, eq(academicYears.id, classSections.academicYearId))
      .where(and(
        eq(classSections.id, sectionId),
        eq(classSections.schoolId, context.schoolId),
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, "active"),
      )).for("update").limit(1);
    if (!section) return "section-not-found";
    const eligible = await tx.select({ studentId: studentEnrollments.studentId, enrollmentId: studentEnrollments.id })
      .from(studentEnrollments).where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.classSectionId, sectionId),
        eq(studentEnrollments.academicYearId, section.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
        inArray(studentEnrollments.studentId, studentIds),
      ));
    const enrollmentByStudent = new Map(eligible.map((row) => [row.studentId, row.enrollmentId]));
    if (enrollmentByStudent.size !== studentIds.length) return "roster-changed";
    for (const [studentId, mark] of byStudent) {
      const enrollmentId = enrollmentByStudent.get(studentId);
      if (!enrollmentId) return "roster-changed";
      await tx.insert(studentAttendance).values({
        publicId: randomUUID(),
        schoolId: context.schoolId,
        studentId,
        enrollmentId,
        classSectionId: sectionId,
        attendanceDate: dateResult.data,
        status: mark.status,
        note: mark.note || null,
        recordedBy: context.user.id,
      }).onDuplicateKeyUpdate({
        set: { enrollmentId, classSectionId: sectionId, status: mark.status, note: mark.note || null, recordedBy: context.user.id },
      });
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "academic.attendance.csv_imported",
      resourceType: "class_section",
      resourcePublicId: section.publicId,
      changedFields: ["attendanceDate", "status", "note", "csvImport"],
    });
    return "saved";
  });
  if (outcome === "section-not-found") return { error: "The class section is not active in this school year." };
  if (outcome === "roster-changed") return { error: "The roster changed or this file contains a student outside this section. Reload the roster and download a fresh CSV." };
  revalidatePath("/admin/academics");
  return { success: true, imported: byStudent.size };
}

export async function saveAttendance(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("students.update");
  const sectionResult = idField.safeParse(formData.get("classSectionId"));
  const dateResult = dateField.safeParse(formData.get("attendanceDate"));
  if (!sectionResult.success || !dateResult.success) {
    return { error: "Choose a class section and a valid attendance date." };
  }

  const statuses = new Map<number, string>();
  const notes = new Map<number, string>();
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const statusMatch = /^status_(\d+)$/.exec(key);
    const noteMatch = /^note_(\d+)$/.exec(key);
    const match = statusMatch ?? noteMatch;
    if (!match) continue;
    const studentResult = idField.safeParse(match[1]);
    if (!studentResult.success) return { error: "The attendance roster contains an invalid student." };
    if (statusMatch) statuses.set(studentResult.data, value);
    else notes.set(studentResult.data, value.trim());
  }

  const markedStudents = [...statuses.entries()].filter(([, status]) => status !== "");
  if (markedStudents.length === 0 || markedStudents.some(([, status]) => !isAttendanceStatus(status))) {
    return { error: "Mark at least one student with a valid attendance status." };
  }
  if ([...notes.values()].some((note) => note.length > 500)) {
    return { error: "Attendance notes must be 500 characters or fewer." };
  }

  const sectionId = sectionResult.data;
  const attendanceDate = dateResult.data;
  const studentIds = markedStudents.map(([studentId]) => studentId);
  const outcome = await db.transaction(async (tx) => {
    const [section] = await tx
      .select({
        publicId: classSections.publicId,
        academicYearId: classSections.academicYearId,
      })
      .from(classSections)
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .where(
        and(
          eq(classSections.id, sectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ),
      )
      .limit(1);
    if (!section) return "section-not-found";

    const eligibleStudents = await tx
      .select({ studentId: studentEnrollments.studentId, enrollmentId: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.classSectionId, sectionId),
          eq(studentEnrollments.academicYearId, section.academicYearId),
          eq(studentEnrollments.status, "enrolled"),
          inArray(studentEnrollments.studentId, studentIds),
        ),
      );
    const enrollmentByStudentId = new Map(
      eligibleStudents.map((enrollment) => [enrollment.studentId, enrollment.enrollmentId]),
    );
    if (enrollmentByStudentId.size !== studentIds.length) return "roster-changed";

    for (const [studentId, status] of markedStudents) {
      const enrollmentId = enrollmentByStudentId.get(studentId);
      if (!enrollmentId) return "roster-changed";
      await tx
        .insert(studentAttendance)
        .values({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          studentId,
          enrollmentId,
          classSectionId: sectionId,
          attendanceDate,
          status,
          note: notes.get(studentId) || null,
          recordedBy: context.user.id,
        })
        .onDuplicateKeyUpdate({
          set: {
            enrollmentId,
            classSectionId: sectionId,
            status,
            note: notes.get(studentId) || null,
            recordedBy: context.user.id,
          },
        });
    }

    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "academic.attendance.saved",
      resourceType: "class_section",
      resourcePublicId: section.publicId,
      changedFields: ["attendanceDate", "status", "note"],
    });
    return "saved";
  });

  if (outcome === "section-not-found") return { error: "Choose a class section belonging to your school." };
  if (outcome === "roster-changed") {
    return { error: "The class roster changed. Reload the attendance list before saving." };
  }

  revalidatePath("/admin/academics");
  return { success: true };
}
