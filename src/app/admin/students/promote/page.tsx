import { and, asc, desc, eq, ne } from "drizzle-orm";
import {
  AdminActionDialog,
  AdminDataTable,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentAcademicEvents,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { EnrollmentOperationForm } from "../../academics/management-forms";

export default async function StudentPromotionPage() {
  const context = await requireSchoolPermission("students.view");
  const canUpdate = context.grantedPermissions.includes("students.update");
  const [years, branches, sections, enrollments, events] = await Promise.all([
    db
      .select({ id: academicYears.id, name: academicYears.name, status: academicYears.status })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), ne(academicYears.status, "archived")))
      .orderBy(asc(academicYears.startDate)),
    db
      .select({ id: schoolBranches.id, name: schoolBranches.name })
      .from(schoolBranches)
      .where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
    db
      .select({
        id: classSections.id,
        academicYearId: classSections.academicYearId,
        branchId: classLevels.branchId,
        yearName: academicYears.name,
        yearStatus: academicYears.status,
        className: classLevels.name,
        sectionName: classSections.name,
      })
      .from(classSections)
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .where(
        and(
          eq(classSections.schoolId, context.schoolId),
          eq(academicYears.schoolId, context.schoolId),
          ne(academicYears.status, "archived"),
          eq(classLevels.schoolId, context.schoolId),
        ),
      )
      .orderBy(asc(academicYears.startDate), asc(classLevels.name), asc(classSections.name)),
    canUpdate
      ? db
          .select({
            id: studentEnrollments.id,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            admissionNumber: students.admissionNumber,
            yearName: academicYears.name,
            className: classLevels.name,
            sectionName: classSections.name,
          })
          .from(studentEnrollments)
          .innerJoin(students, eq(studentEnrollments.studentId, students.id))
          .innerJoin(academicYears, eq(studentEnrollments.academicYearId, academicYears.id))
          .innerJoin(classSections, eq(studentEnrollments.classSectionId, classSections.id))
          .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
          .where(
            and(
              eq(studentEnrollments.schoolId, context.schoolId),
              eq(students.schoolId, context.schoolId),
              eq(academicYears.schoolId, context.schoolId),
              eq(academicYears.status, "active"),
              eq(studentEnrollments.status, "enrolled"),
              eq(students.status, "active"),
            ),
          )
          .orderBy(asc(students.lastName), asc(students.firstName))
      : Promise.resolve([]),
    db
      .select({
        id: studentAcademicEvents.id,
        student: students.firstName,
        lastName: students.lastName,
        eventType: studentAcademicEvents.eventType,
        eventDate: studentAcademicEvents.eventDate,
        reason: studentAcademicEvents.reason,
        externalInstitution: studentAcademicEvents.externalInstitution,
      })
      .from(studentAcademicEvents)
      .innerJoin(students, eq(studentAcademicEvents.studentId, students.id))
      .where(
        and(
          eq(studentAcademicEvents.schoolId, context.schoolId),
          eq(students.schoolId, context.schoolId),
        ),
      )
      .orderBy(desc(studentAcademicEvents.eventDate), desc(studentAcademicEvents.id))
      .limit(100),
  ]);
  const enrollmentOptions = enrollments.map((enrollment) => ({
    id: enrollment.id,
    label: `${enrollment.studentFirstName} ${enrollment.studentLastName}${enrollment.admissionNumber ? ` · ${enrollment.admissionNumber}` : ""} — ${enrollment.className} ${enrollment.sectionName} · ${enrollment.yearName}`,
  }));
  const yearOptions = years.map((year) => ({
    id: year.id,
    label: `${year.name} · ${year.status}`,
  }));
  const sectionOptions = sections.map((section) => ({
    id: section.id,
    branchId: section.branchId,
    academicYearId: section.academicYearId,
    label: `${section.className} ${section.sectionName}`,
  }));
  const branchOptions = branches.map((branch) => ({
    id: branch.id,
    label: branch.name,
  }));
  const eventFilters: AdminTableFilter[] = [{
    key: "eventType",
    label: "event type",
    options: [...new Set(events.map((event) => event.eventType))].map((eventType) => ({
      value: eventType,
      label: eventType.replaceAll("_", " "),
    })),
  }];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Student Info</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Student promotion
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Promote, repeat, transfer, or graduate students while keeping their enrollment history.
          </p>
        </div>
        {canUpdate && enrollmentOptions.length > 0 && (
          <AdminActionDialog label="Record operation" title="Promote or transfer students">
            <EnrollmentOperationForm
              branches={branchOptions}
              enrollments={enrollmentOptions}
              years={yearOptions}
              sections={sectionOptions}
            />
          </AdminActionDialog>
        )}
      </header>

      {canUpdate && enrollmentOptions.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          There are no active student enrollments available for promotion or transfer.
        </p>
      )}

      <AdminDataTable
        title="Student academic history"
        columns={[
          { key: "student", label: "Student" },
          { key: "eventType", label: "Operation" },
          { key: "eventDate", label: "Date" },
          { key: "destination", label: "Destination school" },
          { key: "reason", label: "Reason" },
        ]}
        rows={events.map((event) => ({
          id: event.id,
          values: {
            student: `${event.student} ${event.lastName}`,
            eventType: event.eventType.replaceAll("_", " "),
            eventDate: event.eventDate,
            destination: event.externalInstitution ?? "",
            reason: event.reason,
          },
        }))}
        filters={eventFilters}
        requireSearchCriteria
        emptyMessage="No promotion, transfer, or placement history has been recorded."
      />
    </div>
  );
}
