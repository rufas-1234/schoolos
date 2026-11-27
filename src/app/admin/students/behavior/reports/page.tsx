import { and, asc, desc, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import { DownloadCsv } from "@/components/download-csv";
import { PrintButton } from "@/components/print-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentBehaviorOptions,
  studentBehaviorRecords,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";

type ReportKind = "students" | "classes" | "sections" | "incidents";
type SearchParams = {
  report?: string | string[];
  from?: string | string[];
  to?: string | string[];
  branchId?: string | string[];
  classLevelId?: string | string[];
  sectionId?: string | string[];
  category?: string | string[];
  search?: string | string[];
  yearId?: string | string[];
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function numericId(value: string): number | undefined {
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function rankScore(severity: string): number {
  if (severity === "positive") return 3;
  if (severity === "low") return -1;
  if (severity === "moderate") return -2;
  if (severity === "serious") return -3;
  return 0;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const reports: { id: ReportKind; label: string }[] = [
  { id: "students", label: "Student behavior ranking" },
  { id: "classes", label: "Class-wise ranking" },
  { id: "sections", label: "Section-wise ranking" },
  { id: "incidents", label: "Incident-wise ranking" },
];

export default async function StudentBehaviorReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["students.view", "students.update"]);
  const [params, academicYearSelection] = await Promise.all([
    searchParams,
    getSchoolAcademicYearSelection(context.schoolId),
  ]);
  const requestedYearId = numericId(first(params.yearId));
  const yearId = requestedYearId && academicYearSelection.years.some((year) => year.id === requestedYearId)
    ? requestedYearId
    : academicYearSelection.selectedYear?.id;
  const requestedReport = first(params.report) as ReportKind;
  const report: ReportKind = reports.some((item) => item.id === requestedReport) ? requestedReport : "students";
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const fromCandidate = first(params.from);
  const toCandidate = first(params.to);
  const from = validDate(fromCandidate) ? fromCandidate : defaultFrom;
  const to = validDate(toCandidate) && toCandidate >= from ? toCandidate : today;
  const branchId = numericId(first(params.branchId));
  const classLevelId = numericId(first(params.classLevelId));
  const sectionId = numericId(first(params.sectionId));
  const category = first(params.category).slice(0, 40);
  const search = first(params.search).trim().slice(0, 120);

  const [sections, configuredCategories] = await Promise.all([
    yearId
      ? db.select({
        id: classSections.id,
        name: classSections.name,
        classLevelId: classLevels.id,
        className: classLevels.name,
        branchId: schoolBranches.id,
        branchName: schoolBranches.name,
      }).from(classSections)
        .innerJoin(classLevels, and(
          eq(classSections.classLevelId, classLevels.id),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(schoolBranches, and(
          eq(classLevels.branchId, schoolBranches.id),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, yearId),
        ))
        .orderBy(asc(schoolBranches.name), asc(classLevels.name), asc(classSections.name))
      : Promise.resolve([]),
    db.select({ name: studentBehaviorOptions.name })
      .from(studentBehaviorOptions)
      .where(and(
        eq(studentBehaviorOptions.schoolId, context.schoolId),
        eq(studentBehaviorOptions.kind, "category"),
      )),
  ]);
  const branchOptions = [...new Map(sections.map((item) => [item.branchId, item.branchName]))]
    .map(([id, name]) => ({ value: String(id), label: name }));
  const classOptions = [...new Map(sections
    .filter((item) => !branchId || item.branchId === branchId)
    .map((item) => [item.classLevelId, item.className]))]
    .map(([id, name]) => ({ value: String(id), label: name }));
  const sectionOptions = sections
    .filter((item) => (!branchId || item.branchId === branchId) && (!classLevelId || item.classLevelId === classLevelId))
    .map((item) => ({ value: String(item.id), label: `${item.className} · ${item.name}` }));
  const categories = [...new Set([
    "positive", "classroom", "attendance", "uniform", "peer_conflict", "bullying", "property", "safety", "other",
    ...configuredCategories.map((item) => item.name),
  ])].sort((a, b) => label(a).localeCompare(label(b)));
  const searchPattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const records = yearId ? await db.select({
    studentId: students.id,
    studentPublicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    incidentDate: studentBehaviorRecords.incidentDate,
    category: studentBehaviorRecords.category,
    severity: studentBehaviorRecords.severity,
    details: studentBehaviorRecords.details,
    actionTaken: studentBehaviorRecords.actionTaken,
    classLevelId: classLevels.id,
    className: classLevels.name,
    sectionId: classSections.id,
    sectionName: classSections.name,
    branchId: schoolBranches.id,
    branchName: schoolBranches.name,
  }).from(studentBehaviorRecords)
    .innerJoin(students, and(
      eq(studentBehaviorRecords.studentId, students.id),
      eq(students.schoolId, context.schoolId),
    ))
    .leftJoin(studentEnrollments, and(
      eq(studentEnrollments.studentId, students.id),
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, yearId),
      inArray(studentEnrollments.status, ["enrolled", "pending"]),
    ))
    .leftJoin(classSections, and(
      eq(studentEnrollments.classSectionId, classSections.id),
      eq(classSections.schoolId, context.schoolId),
    ))
    .leftJoin(classLevels, and(
      eq(classSections.classLevelId, classLevels.id),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .leftJoin(schoolBranches, and(
      eq(classLevels.branchId, schoolBranches.id),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .where(and(
      eq(studentBehaviorRecords.schoolId, context.schoolId),
      gte(studentBehaviorRecords.incidentDate, from),
      lte(studentBehaviorRecords.incidentDate, to),
      ...(category ? [eq(studentBehaviorRecords.category, category)] : []),
      ...(branchId ? [eq(schoolBranches.id, branchId)] : []),
      ...(classLevelId ? [eq(classLevels.id, classLevelId)] : []),
      ...(sectionId ? [eq(classSections.id, sectionId)] : []),
      ...(search ? [or(
        like(students.firstName, searchPattern),
        like(students.lastName, searchPattern),
        like(students.admissionNumber, searchPattern),
        like(studentBehaviorRecords.details, searchPattern),
      )!] : []),
    ))
    .orderBy(asc(students.lastName), asc(students.firstName), desc(studentBehaviorRecords.incidentDate))
    : [];

  const studentRanks = [...records.reduce((map, record) => {
    const entry = map.get(record.studentId) ?? {
      id: record.studentId,
      publicId: record.studentPublicId,
      name: `${record.firstName} ${record.lastName}`,
      admissionNumber: record.admissionNumber ?? "—",
      branch: record.branchName ?? "Unassigned",
      className: record.className ?? "Unassigned",
      sectionName: record.sectionName ?? "Unassigned",
      positives: 0,
      incidents: 0,
      score: 0,
    };
    entry.score += rankScore(record.severity);
    if (record.severity === "positive") entry.positives += 1;
    else entry.incidents += 1;
    map.set(record.studentId, entry);
    return map;
  }, new Map<number, {
    id: number; publicId: string; name: string; admissionNumber: string; branch: string;
    className: string; sectionName: string; positives: number; incidents: number; score: number;
  }>()).values()]
    .sort((a, b) => b.score - a.score || b.positives - a.positives || a.incidents - b.incidents || a.name.localeCompare(b.name));

  const groupedRank = (keyOf: (student: (typeof studentRanks)[number]) => string, labelOf: (student: (typeof studentRanks)[number]) => string) => {
    const groups = new Map<string, { name: string; students: number; score: number; positives: number; incidents: number }>();
    for (const student of studentRanks) {
      const key = keyOf(student);
      const group = groups.get(key) ?? { name: labelOf(student), students: 0, score: 0, positives: 0, incidents: 0 };
      group.students += 1;
      group.score += student.score;
      group.positives += student.positives;
      group.incidents += student.incidents;
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({ ...group, average: group.students ? group.score / group.students : 0 }))
      .sort((a, b) => b.average - a.average || b.positives - a.positives || a.name.localeCompare(b.name));
  };
  const classRanks = groupedRank((student) => `${student.branch}|${student.className}`, (student) => `${student.branch} · ${student.className}`);
  const sectionRanks = groupedRank((student) => `${student.branch}|${student.className}|${student.sectionName}`, (student) => `${student.branch} · ${student.className} · ${student.sectionName}`);
  const incidentGroups = new Map<string, { name: string; incidents: number; students: Set<number>; low: number; moderate: number; serious: number }>();
  for (const record of records.filter((item) => item.severity !== "positive")) {
    const group = incidentGroups.get(record.category) ?? { name: label(record.category), incidents: 0, students: new Set<number>(), low: 0, moderate: 0, serious: 0 };
    group.incidents += 1;
    group.students.add(record.studentId);
    if (record.severity === "low" || record.severity === "moderate" || record.severity === "serious") group[record.severity] += 1;
    incidentGroups.set(record.category, group);
  }
  const incidentRanks = [...incidentGroups.values()]
    .map((item) => ({ ...item, studentsAffected: item.students.size }))
    .sort((a, b) => b.incidents - a.incidents || b.serious - a.serious || a.name.localeCompare(b.name));
  const rankTitle = reports.find((item) => item.id === report)?.label ?? "Student behavior ranking";
  const filterSummary = [
    yearId ? academicYearSelection.years.find((year) => year.id === yearId)?.name ?? "Academic year" : "No academic year selected",
    `${from} to ${to}`,
    branchId ? branchOptions.find((item) => item.value === String(branchId))?.label ?? "Selected branch" : "All branches",
    classLevelId ? classOptions.find((item) => item.value === String(classLevelId))?.label ?? "Selected class" : "All classes",
    sectionId ? sectionOptions.find((item) => item.value === String(sectionId))?.label ?? "Selected section" : "All sections",
    category ? label(category) : "All incident types",
  ].join(" · ");
  const csvRows = report === "students"
    ? studentRanks.map((item, index) => [index + 1, item.name, item.admissionNumber, item.branch, item.className, item.sectionName, item.positives, item.incidents, item.score])
    : report === "classes"
      ? classRanks.map((item, index) => [index + 1, item.name, item.students, item.positives, item.incidents, item.average.toFixed(2)])
      : report === "sections"
        ? sectionRanks.map((item, index) => [index + 1, item.name, item.students, item.positives, item.incidents, item.average.toFixed(2)])
        : incidentRanks.map((item, index) => [index + 1, item.name, item.incidents, item.studentsAffected, item.low, item.moderate, item.serious]);
  const csvHeaders = report === "students"
    ? ["Rank", "Student", "Admission number", "Branch", "Class", "Section", "Positive records", "Incidents", "Behavior score"]
    : report === "classes" || report === "sections"
      ? ["Rank", report === "classes" ? "Class" : "Section", "Students ranked", "Positive records", "Incidents", "Average score"]
      : ["Rank", "Incident type", "Incidents", "Students affected", "Low", "Moderate", "Serious"];

  return (
    <main className="space-y-6 print-report-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700 print:text-black">Behavior</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Behavior reports &amp; rankings</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Rank positive conduct and recorded incidents for the selected school year and filters.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <DownloadCsv fileName={`student-behavior-${report}.csv`} headers={csvHeaders} rows={csvRows} />
          <PrintButton label="Print filtered behavior report" targetId="student-behavior-report" pageOrientation="landscape" />
        </div>
      </header>

      <SmartFilterForm method="get" className="print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm font-medium text-slate-700">Report
          <select name="report" defaultValue={report} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
            {reports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Academic year
          <select name="yearId" defaultValue={yearId ? String(yearId) : ""} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
            {academicYearSelection.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">From
          <input type="date" name="from" defaultValue={from} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">To
          <input type="date" name="to" defaultValue={to} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </label>
        <SearchableSelect label="Branch" name="branchId" options={[{ value: "", label: "All branches" }, ...branchOptions]} defaultValue={branchId ? String(branchId) : ""} placeholder="Search branches..." />
        <SearchableSelect label="Class" name="classLevelId" options={[{ value: "", label: "All classes" }, ...classOptions]} defaultValue={classLevelId ? String(classLevelId) : ""} placeholder="Search classes..." />
        <SearchableSelect label="Section" name="sectionId" options={[{ value: "", label: "All sections" }, ...sectionOptions]} defaultValue={sectionId ? String(sectionId) : ""} placeholder="Search sections..." />
        <SearchableSelect label="Incident type" name="category" options={[{ value: "", label: "All incident types" }, ...categories.map((item) => ({ value: item, label: label(item) }))]} defaultValue={category} placeholder="Search incident types..." />
        <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-3">Search student or incident details
          <input type="search" name="search" defaultValue={search} maxLength={120} placeholder="Student name, admission number, or incident details" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </label>
      </SmartFilterForm>

      <section id="student-behavior-report" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <header className="print-report-heading">
          <p className="print-report-kicker">Student behavior · {academicYearSelection.years.find((year) => year.id === yearId)?.name ?? "School year"}</p>
          <h2>{rankTitle}</h2>
          <p>{filterSummary}</p>
          <p className="text-xs">Behavior score: +3 for each positive record, −1 for a low incident, −2 for a moderate incident, and −3 for a serious incident. Higher scores rank first; this is a conduct summary, not a disciplinary decision.</p>
        </header>

        {!yearId && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Create or select an academic year to rank students by their current class and section.</p>}

        {report === "students" && <RankTable
          headings={["Rank", "Student", "Admission no.", "Branch", "Class", "Section", "Positive", "Incidents", "Score"]}
          empty="No behavior records match these filters."
          rows={studentRanks.map((student, index) => [
            <strong key="rank">{index + 1}</strong>,
            student.name,
            student.admissionNumber,
            student.branch,
            student.className,
            student.sectionName,
            student.positives,
            student.incidents,
            <strong key="score">{student.score}</strong>,
          ])}
        />}
        {report === "classes" && <RankTable
          headings={["Rank", "Branch / class", "Students ranked", "Positive records", "Incidents", "Average behavior score"]}
          empty="No class behavior records match these filters."
          rows={classRanks.map((item, index) => [index + 1, item.name, item.students, item.positives, item.incidents, item.average.toFixed(2)])}
        />}
        {report === "sections" && <RankTable
          headings={["Rank", "Branch / class / section", "Students ranked", "Positive records", "Incidents", "Average behavior score"]}
          empty="No section behavior records match these filters."
          rows={sectionRanks.map((item, index) => [index + 1, item.name, item.students, item.positives, item.incidents, item.average.toFixed(2)])}
        />}
        {report === "incidents" && <RankTable
          headings={["Rank", "Incident type", "Incidents", "Students affected", "Low", "Moderate", "Serious"]}
          empty="No incident records match these filters. Positive conduct entries are excluded from incident rankings."
          rows={incidentRanks.map((item, index) => [index + 1, item.name, item.incidents, item.studentsAffected, item.low, item.moderate, item.serious])}
        />}
        <p className="text-xs text-slate-500">Students are grouped by their enrollment in the selected academic year. Class and section averages include students with at least one matching behavior record.</p>
      </section>
    </main>
  );
}

function RankTable({
  headings,
  rows,
  empty,
}: {
  headings: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{empty}</p>;
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[48rem] border-collapse text-left text-sm print:min-w-0 print:text-xs">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headings.map((heading) => <th key={heading} className="border border-slate-200 px-3 py-2.5">{heading}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="odd:bg-white even:bg-slate-50">{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-200 px-3 py-2.5 text-slate-700">{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
