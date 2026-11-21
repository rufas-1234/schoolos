import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { Printer, CreditCard } from "lucide-react";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  schools,
  studentEnrollments,
  students,
} from "@/db/schema";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";
import { StudentIdPrintRegister, type StudentIdCardRecord } from "./student-id-print-register";
import styles from "./student-ids.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const validOption = (value: string, options: Array<{ id: number }>) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && options.some((option) => option.id === id) ? id : undefined;
};

export default async function StudentIdsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const context = await requireSchoolPermission("students.view");
  const [school] = await db.select({
    name: schools.name,
    email: schools.email,
    phone: schools.phone,
    address: schools.address,
    logoUrl: schools.logoUrl,
  })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);

  const [branches, classes, sections, years] = await Promise.all([
    db.select({ id: schoolBranches.id, name: schoolBranches.name }).from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active"))).orderBy(asc(schoolBranches.name)),
    db.select({ id: classLevels.id, name: classLevels.name, branchId: classLevels.branchId }).from(classLevels)
      .where(eq(classLevels.schoolId, context.schoolId)).orderBy(asc(classLevels.name)),
    db.select({ id: classSections.id, name: classSections.name, classLevelId: classSections.classLevelId, yearId: classSections.academicYearId })
      .from(classSections).innerJoin(academicYears, and(eq(academicYears.id, classSections.academicYearId), eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
      .where(eq(classSections.schoolId, context.schoolId)).orderBy(asc(classSections.name)),
    db.select({ id: academicYears.id, name: academicYears.name }).from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active"))).orderBy(desc(academicYears.startDate)),
  ]);

  const rawSearch = first(query.search).trim().slice(0, 100);
  const branchId = validOption(first(query.branch), branches);
  const classId = validOption(first(query.class), classes);
  const sectionId = validOption(first(query.section), sections);
  const yearId = validOption(first(query.year), years);
  const rawStatus = first(query.status);
  const status = ["active", "inactive", "disabled", "admitted"].includes(rawStatus) ? rawStatus : "active";
  const searchPattern = `%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`;
  const conditions = [eq(students.schoolId, context.schoolId), eq(students.status, status)];
  if (rawSearch) conditions.push(or(
    like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, searchPattern.toLowerCase()),
    like(sql`lower(coalesce(${students.admissionNumber}, ''))`, searchPattern.toLowerCase()),
    like(sql`lower(coalesce(${studentEnrollments.rollNumber}, ''))`, searchPattern.toLowerCase()),
  )!);
  if (branchId) conditions.push(eq(sql`coalesce(${students.branchId}, ${classLevels.branchId})`, branchId));
  if (classId) conditions.push(eq(classLevels.id, classId));
  if (sectionId) conditions.push(eq(classSections.id, sectionId));
  if (yearId) conditions.push(eq(academicYears.id, yearId));

  const rows = await db.select({
    id: students.id,
    publicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    dateOfBirth: students.dateOfBirth,
    currentAddress: students.currentAddress,
    fatherName: students.fatherName,
    fatherPhone: students.fatherPhone,
    motherName: students.motherName,
    guardianName: students.guardianName,
    guardianPhone: students.guardianPhone,
    phone: students.phone,
    additionalDetails: students.additionalDetails,
    className: classLevels.name,
    sectionName: classSections.name,
    rollNumber: studentEnrollments.rollNumber,
    yearName: academicYears.name,
  }).from(students)
    .leftJoin(studentEnrollments, and(eq(studentEnrollments.studentId, students.id), eq(studentEnrollments.schoolId, context.schoolId), eq(studentEnrollments.status, "enrolled")))
    .leftJoin(academicYears, and(eq(academicYears.id, studentEnrollments.academicYearId), eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
    .leftJoin(classSections, and(eq(classSections.id, studentEnrollments.classSectionId), eq(classSections.schoolId, context.schoolId)))
    .leftJoin(classLevels, and(eq(classLevels.id, classSections.classLevelId), eq(classLevels.schoolId, context.schoolId)))
    .where(and(...conditions))
    .orderBy(asc(students.firstName), asc(students.lastName), desc(studentEnrollments.enrolledAt))
    .limit(1000);

  const seen = new Set<number>();
  const records: StudentIdCardRecord[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const photo = row.additionalDetails?.profilePhoto;
    records.push({
      id: row.id,
      publicId: row.publicId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      admissionNumber: row.admissionNumber,
      dateOfBirth: row.dateOfBirth,
      className: row.className,
      sectionName: row.sectionName,
      rollNumber: row.rollNumber,
      yearName: row.yearName,
      fatherName: row.fatherName ?? row.guardianName,
      motherName: row.motherName,
      phone: row.phone ?? row.guardianPhone ?? row.fatherPhone,
      address: row.currentAddress,
      photoUrl: photo?.objectKey ? `/api/admin/students/${row.publicId}/photo` : null,
    });
  }
  const selectionKey = [
    rawSearch,
    branchId ?? "",
    classId ?? "",
    sectionId ?? "",
    yearId ?? "",
    status,
  ].join(":");

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div className={styles.headingIcon}><CreditCard size={21} /></div>
        <div><p className={styles.eyebrow}>STUDENT SERVICES</p><h1>Student ID cards</h1><p>Find students, select a class list, and print school ID cards in one batch.</p></div>
      </header>

      <SmartFilterForm method="get" action="/admin/students/ids" className={styles.filters}>
        <label className={styles.searchField}>Search students
          <input type="search" name="search" placeholder="Name, admission no. or roll no." defaultValue={rawSearch} />
        </label>
        <label>Branch<select name="branch" defaultValue={branchId ? String(branchId) : ""}><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Class<select name="class" defaultValue={classId ? String(classId) : ""}><option value="">All classes</option>{classes.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Section<select name="section" defaultValue={sectionId ? String(sectionId) : ""}><option value="">All sections</option>{sections.filter((item) => (!classId || item.classLevelId === classId) && (!yearId || item.yearId === yearId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Academic year<select name="year" defaultValue={yearId ? String(yearId) : ""}><option value="">Current year</option>{years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="admitted">Admitted</option><option value="inactive">Inactive</option><option value="disabled">Disabled</option></select></label>
      </SmartFilterForm>

      <StudentIdPrintRegister
        key={selectionKey}
        records={records}
        schoolName={school?.name ?? context.schoolName}
        schoolEmail={school?.email ?? null}
        schoolLogo={schoolLogoSource(school?.logoUrl ?? null)}
        schoolPhone={school?.phone ?? null}
        schoolAddress={school?.address ?? null}
      />

      {records.length === 1000 && <p className={styles.limitNotice}>Showing the first 1,000 students. Narrow the filters for a larger print batch.</p>}
      <div className={styles.printHint}><Printer size={15} /> Use your ID printer with CR80 / ID-1 stock (85.6 x 54 mm), landscape, 100% scale, and no margins if supported. Do not select A4 or letter.</div>
    </main>
  );
}
