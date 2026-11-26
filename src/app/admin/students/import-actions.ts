"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentCategories,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { parseCsvRows } from "@/lib/csv-import";
import { normalizeSectionName } from "@/lib/student-import-policy";
import { createStudent, type StudentActionState } from "./actions";

const maxCsvBytes = 1_000_000;
const maxStudentRows = 100;
const maxReturnedFailures = 50;

const studentCsvColumns = [
  "branchCode",
  "academicYear",
  "className",
  "sectionName",
  "firstName",
  "lastName",
  "gender",
  "dateOfBirth",
  "admissionDate",
  "email",
  "phone",
  "religion",
  "bloodGroup",
  "currentAddress",
  "permanentAddress",
  "fatherName",
  "fatherOccupation",
  "fatherPhone",
  "motherName",
  "motherOccupation",
  "motherPhone",
  "guardianName",
  "guardianRelation",
  "guardianEmail",
  "guardianPhone",
  "guardianOccupation",
  "guardianAddress",
  "category",
  "caste",
  "heightInches",
  "weightKg",
  "nationalIdNumber",
  "birthCertificateNumber",
  "additionalNotes",
  "bankName",
  "bankAccountNumber",
  "bankIfscCode",
  "previousSchoolDetails",
  "transportRoute",
  "vehicleNumber",
  "dormitoryName",
  "dormitoryRoom",
  "customFieldName",
  "customFieldValue",
] as const;

const requiredCsvColumns = [
  "branchCode",
  "academicYear",
  "className",
  "sectionName",
  "firstName",
  "lastName",
] as const;

type ImportFailure = { row: number; message: string };
type StudentCsvImportState = {
  error?: string;
  completed?: number;
  total?: number;
  failures?: ImportFailure[];
  omittedFailures?: number;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function readValue(record: Map<string, string>, key: string) {
  return record.get(normalize(key))?.trim() ?? "";
}

function uniqueMatch<T>(
  candidates: T[],
  label: string,
  getName: (candidate: T) => string,
  value: string,
  normalizeName: (name: string) => string = normalize,
): { match?: T; error?: string } {
  const found = candidates.filter((candidate) => normalizeName(getName(candidate)) === normalizeName(value));
  if (found.length === 1) return { match: found[0] };
  if (found.length > 1) return { error: `More than one ${label} matches "${value}".` };
  return { error: `No active ${label} matches "${value}".` };
}

function createStudentFormData(
  record: Map<string, string>,
  enrollment: {
    branchId: number;
    academicYearId: number;
    classLevelId: number;
    classSectionId: number;
    categoryId: number | null;
  },
) {
  const formData = new FormData();
  for (const column of studentCsvColumns) {
    if (column === "branchCode" || column === "academicYear" || column === "className" ||
      column === "sectionName" || column === "category") continue;
    formData.set(column, readValue(record, column));
  }
  formData.set("branchId", String(enrollment.branchId));
  formData.set("academicYearId", String(enrollment.academicYearId));
  formData.set("classLevelId", String(enrollment.classLevelId));
  formData.set("classSectionId", String(enrollment.classSectionId));
  formData.set("categoryId", enrollment.categoryId ? String(enrollment.categoryId) : "");
  for (let slot = 1; slot <= 4; slot += 1) {
    formData.set(`documentTitle${slot}`, "");
    formData.set(`documentFileName${slot}`, "");
    formData.set(`documentObjectKey${slot}`, "");
  }
  formData.set("profilePhotoFileName", "");
  formData.set("profilePhotoObjectKey", "");
  return formData;
}

export async function importStudentsFromCsv(
  _previousState: StudentCsvImportState,
  formData: FormData,
): Promise<StudentCsvImportState> {
  const context = await requireSchoolPermission("students.create");
  const uploadedFile = formData.get("csvFile");
  if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
    return { error: "Choose a CSV file to import." };
  }
  if (uploadedFile.size > maxCsvBytes) {
    return { error: "The CSV file must be 1 MB or smaller." };
  }

  let rows: string[][];
  try {
    rows = parseCsvRows(await uploadedFile.text());
  } catch (error) {
    return {
      error: error instanceof Error ? `The CSV file is invalid: ${error.message}` : "The CSV file is invalid.",
    };
  }

  const nonemptyRows = rows.filter((row) => row.some((value) => value.trim() !== ""));
  const headerRow = nonemptyRows[0];
  if (!headerRow) return { error: "The CSV file is empty." };

  const headers = headerRow.map((header) => header.trim());
  const normalizedHeaders = headers.map(normalize);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    return { error: "The CSV contains duplicate column names." };
  }
  const supportedColumns = new Set<string>(studentCsvColumns.map(normalize));
  const unknownColumn = normalizedHeaders.find((header) => !supportedColumns.has(header));
  if (unknownColumn) return { error: `Unsupported CSV column: ${unknownColumn}.` };
  const missingColumn = requiredCsvColumns.find((column) => !normalizedHeaders.includes(normalize(column)));
  if (missingColumn) return { error: `The CSV is missing the required "${missingColumn}" column.` };

  const dataRows = nonemptyRows.slice(1);
  if (dataRows.length === 0) return { error: "The CSV has headers but no student rows." };
  if (dataRows.length > maxStudentRows) {
    return { error: `Import up to ${maxStudentRows} students at a time.` };
  }

  const [branches, years, levels, sections, categories] = await Promise.all([
    db.select({ id: schoolBranches.id, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active"))),
    db.select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active"))),
    db.select({
      id: classLevels.id,
      branchId: classLevels.branchId,
      name: classLevels.name,
    }).from(classLevels).where(and(
      eq(classLevels.schoolId, context.schoolId),
      eq(classLevels.status, "active"),
    )),
    db.select({
      id: classSections.id,
      academicYearId: classSections.academicYearId,
      classLevelId: classSections.classLevelId,
      name: classSections.name,
    }).from(classSections).where(eq(classSections.schoolId, context.schoolId)),
    db.select({
      id: studentCategories.id,
      branchId: studentCategories.branchId,
      name: studentCategories.name,
    }).from(studentCategories).where(eq(studentCategories.schoolId, context.schoolId)),
  ]);

  let completed = 0;
  const failures: ImportFailure[] = [];
  let omittedFailures = 0;
  const addFailure = (failure: ImportFailure) => {
    if (failures.length < maxReturnedFailures) failures.push(failure);
    else omittedFailures += 1;
  };

  for (const [index, values] of dataRows.entries()) {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      addFailure({ row: rowNumber, message: "The number of values does not match the header columns." });
      continue;
    }

    const record = new Map(
      normalizedHeaders.map((header, columnIndex) => [header, values[columnIndex] ?? ""]),
    );
    const branchResult = uniqueMatch(branches, "active branch code", (branch) => branch.code, readValue(record, "branchCode"));
    if (!branchResult.match) {
      addFailure({ row: rowNumber, message: branchResult.error ?? "Choose a valid active branch." });
      continue;
    }
    const yearResult = uniqueMatch(years, "active academic year", (year) => year.name, readValue(record, "academicYear"));
    if (!yearResult.match) {
      addFailure({ row: rowNumber, message: yearResult.error ?? "Choose a valid active academic year." });
      continue;
    }
    const classResult = uniqueMatch(
      levels.filter((level) => level.branchId === branchResult.match?.id),
      "class",
      (level) => level.name,
      readValue(record, "className"),
    );
    if (!classResult.match) {
      addFailure({ row: rowNumber, message: classResult.error ?? "Choose a valid class." });
      continue;
    }
    const sectionResult = uniqueMatch(
      sections.filter((section) =>
        section.academicYearId === yearResult.match?.id &&
        section.classLevelId === classResult.match?.id),
      "section",
      (section) => section.name,
      readValue(record, "sectionName"),
      normalizeSectionName,
    );
    if (!sectionResult.match) {
      addFailure({ row: rowNumber, message: sectionResult.error ?? "Choose a valid section." });
      continue;
    }

    let categoryId: number | null = null;
    const categoryName = readValue(record, "category");
    if (categoryName) {
      const categoryResult = uniqueMatch(
        categories.filter((category) => category.branchId === branchResult.match?.id),
        "category",
        (category) => category.name,
        categoryName,
      );
      if (!categoryResult.match) {
        addFailure({ row: rowNumber, message: categoryResult.error ?? "Choose a valid category." });
        continue;
      }
      categoryId = categoryResult.match.id;
    }

    const result: StudentActionState = await createStudent({}, createStudentFormData(record, {
      branchId: branchResult.match.id,
      academicYearId: yearResult.match.id,
      classLevelId: classResult.match.id,
      classSectionId: sectionResult.match.id,
      categoryId,
    }));
    if (result.success) {
      completed += 1;
    } else {
      addFailure({ row: rowNumber, message: result.error ?? "The student record could not be created." });
    }
  }

  return {
    completed,
    total: dataRows.length,
    failures,
    omittedFailures,
  };
}
