import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { AdminActionDialog, AdminDataTable, AdminRecordDialog } from "@/components/admin-data-table";
import { db } from "@/db";
import { studentBehaviorRecords, students, user } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { BehaviorRecordForm, type BehaviorRecordFormData } from "./behavior-form";

const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function StudentBehaviorPage({ searchParams }: { searchParams: Promise<{ search?: string | string[] }> }) {
  const [context, params] = await Promise.all([requireSchoolPermission("students.update"), searchParams]);
  const records = await db.select({
    id: studentBehaviorRecords.id,
    publicId: studentBehaviorRecords.publicId,
    studentPublicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    incidentDate: studentBehaviorRecords.incidentDate,
    category: studentBehaviorRecords.category,
    severity: studentBehaviorRecords.severity,
    details: studentBehaviorRecords.details,
    actionTaken: studentBehaviorRecords.actionTaken,
    followUpDate: studentBehaviorRecords.followUpDate,
    recordedByName: user.name,
  }).from(studentBehaviorRecords)
    .innerJoin(students, and(eq(studentBehaviorRecords.studentId, students.id), eq(students.schoolId, context.schoolId)))
    .innerJoin(user, eq(studentBehaviorRecords.recordedBy, user.id))
    .where(eq(studentBehaviorRecords.schoolId, context.schoolId))
    .orderBy(desc(studentBehaviorRecords.incidentDate), desc(studentBehaviorRecords.id));
  const studentRows = await db.select({ publicId: students.publicId, firstName: students.firstName, lastName: students.lastName, admissionNumber: students.admissionNumber })
    .from(students).where(eq(students.schoolId, context.schoolId)).orderBy(students.firstName, students.lastName);
  const studentOptions = studentRows.map((student) => ({ value: student.publicId, label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}` }));
  const search = typeof params.search === "string" ? params.search.slice(0, 120) : "";
  const canEdit = context.grantedPermissions.includes("students.update");
  return (
    <div className="space-y-6">
      <header><p className="text-sm font-medium text-violet-700">Student Info</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Student behaviour</h1><p className="mt-2 text-sm text-slate-500">Record positive conduct, incidents, and follow-up actions. Records also appear in each student profile.</p></header>
      <AdminDataTable title="Student behaviour records" initialQuery={search} mobileCardView columns={[
        { key: "student", label: "Student" }, { key: "admission", label: "Admission no." }, { key: "date", label: "Incident date" }, { key: "category", label: "Category" }, { key: "severity", label: "Severity" }, { key: "action", label: "Action taken" }, { key: "recordedBy", label: "Recorded by" },
      ]} rows={records.map((record) => {
        const formRecord: BehaviorRecordFormData = { publicId: record.publicId, studentPublicId: record.studentPublicId, incidentDate: record.incidentDate, category: record.category, severity: record.severity, details: record.details, actionTaken: record.actionTaken, followUpDate: record.followUpDate };
        const searchable = `${record.firstName} ${record.lastName} ${record.admissionNumber ?? ""} ${record.category} ${record.severity} ${record.details} ${record.actionTaken}`;
        return { id: record.id, searchableText: searchable, values: { student: `${record.firstName} ${record.lastName}`, admission: record.admissionNumber ?? "—", date: record.incidentDate, category: title(record.category), severity: title(record.severity), action: title(record.actionTaken), recordedBy: record.recordedByName }, actions: <div className="flex flex-wrap items-center gap-2"><Link className="text-sm font-semibold text-violet-700 hover:underline" href={`/admin/students?profile=${record.studentPublicId}`}>Profile</Link>{canEdit && <AdminRecordDialog title={`Edit behaviour record for ${record.firstName} ${record.lastName}`}><BehaviorRecordForm students={studentOptions} record={formRecord} /></AdminRecordDialog>}</div> };
      })} toolbarActions={canEdit ? <AdminActionDialog label="Add behaviour record" title="Add student behaviour record"><BehaviorRecordForm students={studentOptions} /></AdminActionDialog> : null} emptyMessage="No behaviour records have been created yet." />
    </div>
  );
}
