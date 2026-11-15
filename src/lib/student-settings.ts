import type { StudentFieldSettings } from "@/db/schema";

export type StudentSettingField = {
  name: string;
  label: string;
  group: string;
  required?: boolean;
  locked?: boolean;
};

export const studentSettingFields: readonly StudentSettingField[] = [
  { name: "firstName", label: "First name", group: "Personal information", required: true, locked: true },
  { name: "lastName", label: "Last name", group: "Personal information", required: true, locked: true },
  { name: "gender", label: "Gender", group: "Personal information", required: true },
  { name: "dateOfBirth", label: "Date of birth", group: "Personal information", required: true },
  { name: "phone", label: "Student phone", group: "Personal information", required: true },
  { name: "profilePhoto", label: "Profile photo", group: "Personal information" },
  { name: "email", label: "Student email", group: "Personal information" },
  { name: "religion", label: "Religion", group: "Personal information" },
  { name: "caste", label: "Caste", group: "Personal information" },
  { name: "bloodGroup", label: "Blood group", group: "Personal information" },
  { name: "currentAddress", label: "Current address", group: "Personal information" },
  { name: "permanentAddress", label: "Permanent address", group: "Personal information" },
  { name: "heightInches", label: "Height", group: "Personal information" },
  { name: "weightKg", label: "Weight", group: "Personal information" },
  { name: "branchId", label: "Branch", group: "Admission", required: true, locked: true },
  { name: "academicYearId", label: "Academic year", group: "Admission", required: true, locked: true },
  { name: "classLevelId", label: "Class", group: "Admission", required: true, locked: true },
  { name: "classSectionId", label: "Class section", group: "Admission", required: true, locked: true },
  { name: "admissionDate", label: "Admission date", group: "Admission" },
  { name: "categoryId", label: "Student category", group: "Admission" },
  { name: "fatherName", label: "Father's name", group: "Parents and guardian" },
  { name: "fatherOccupation", label: "Father's occupation", group: "Parents and guardian" },
  { name: "fatherPhone", label: "Father's phone", group: "Parents and guardian" },
  { name: "motherName", label: "Mother's name", group: "Parents and guardian" },
  { name: "motherOccupation", label: "Mother's occupation", group: "Parents and guardian" },
  { name: "motherPhone", label: "Mother's phone", group: "Parents and guardian" },
  { name: "guardianName", label: "Guardian's name", group: "Parents and guardian" },
  { name: "guardianRelation", label: "Relationship to student", group: "Parents and guardian" },
  { name: "guardianEmail", label: "Guardian email", group: "Parents and guardian" },
  { name: "guardianPhone", label: "Guardian phone", group: "Parents and guardian" },
  { name: "guardianOccupation", label: "Guardian occupation", group: "Parents and guardian" },
  { name: "guardianAddress", label: "Guardian address", group: "Parents and guardian" },
  { name: "nationalIdNumber", label: "National ID number", group: "Documents and other information" },
  { name: "birthCertificateNumber", label: "Birth certificate number", group: "Documents and other information" },
  { name: "studentDocuments", label: "Student documents", group: "Documents and other information" },
  { name: "bankName", label: "Bank name", group: "Documents and other information" },
  { name: "bankAccountNumber", label: "Bank account number", group: "Documents and other information" },
  { name: "bankIfscCode", label: "Bank routing code", group: "Documents and other information" },
  { name: "additionalNotes", label: "Additional notes", group: "Documents and other information" },
  { name: "previousSchoolDetails", label: "Previous school details", group: "Documents and other information" },
  { name: "transportRoute", label: "Transport route", group: "Documents and other information" },
  { name: "vehicleNumber", label: "Vehicle number", group: "Documents and other information" },
  { name: "dormitoryName", label: "Dormitory", group: "Documents and other information" },
  { name: "dormitoryRoom", label: "Dormitory room", group: "Documents and other information" },
  { name: "customFieldName", label: "Custom field name", group: "Documents and other information" },
  { name: "customFieldValue", label: "Custom field value", group: "Documents and other information" },
];

export const defaultStudentFieldSettings: StudentFieldSettings = Object.fromEntries(
  studentSettingFields.map((field) => [
    field.name,
    { enabled: true, required: field.required ?? false },
  ]),
);

export function normalizeStudentFieldSettings(
  settings: StudentFieldSettings | null | undefined,
): StudentFieldSettings {
  return Object.fromEntries(studentSettingFields.map((field) => {
    const saved = settings?.[field.name];
    return [field.name, {
      enabled: field.locked ? true : saved?.enabled ?? true,
      required: field.locked ? true : saved?.required ?? field.required ?? false,
    }];
  }));
}

export function formatStudentIdentifier(
  format: string,
  sequence: number,
  date: string,
): string | null {
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!Number.isSafeInteger(sequence) || sequence < 1 ||
    !parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date ||
    !format.includes("{SEQ") ||
    !/^[A-Za-z0-9{}:_-]{1,40}$/.test(format)) return null;
  const [year, month, day] = date.split("-");
  const result = format.replace(/\{YYYY\}|\{YY\}|\{MM\}|\{DD\}|\{SEQ(?::([1-9]\d?))?\}/g, (token, width: string | undefined) => {
    if (token === "{YYYY}") return year;
    if (token === "{YY}") return year.slice(-2);
    if (token === "{MM}") return month;
    if (token === "{DD}") return day;
    return String(sequence).padStart(width ? Number(width) : 1, "0");
  });
  return result.length > 0 && result.length <= 40 && !/[{}]/.test(result) ? result : null;
}

export function isValidStudentIdentifierFormat(format: string): boolean {
  return formatStudentIdentifier(format, 1, "2026-03-05") !== null;
}
