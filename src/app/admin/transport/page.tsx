import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { BusFront, MapPin, Users, Wallet } from "lucide-react";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { DownloadCsv } from "@/components/download-csv";
import { PrintButton } from "@/components/print-button";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import { academicTerms, academicYears, classLevels, classSections, schoolBranches, staffMembers, studentEnrollments, students, transportAssignments, transportDrivers, transportFeeMasters, transportPickupPoints, transportRoutes } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { resolveBranchFilterId } from "@/lib/branch-selection-policy";
import { TransportRecordForm, type TransportField } from "./transport-form";

export const dynamic = "force-dynamic";
type SearchParams = { section?: string | string[]; yearId?: string | string[]; branchId?: string | string[] };
const sections = [
  { id: "overview", label: "Transport overview", href: "/admin/transport" },
  { id: "routes", label: "Routes", href: "/admin/transport?section=routes" },
  { id: "points", label: "Pickup points", href: "/admin/transport?section=points" },
  { id: "drivers", label: "Drivers", href: "/admin/transport?section=drivers" },
  { id: "fees", label: "Fee master", href: "/admin/transport?section=fees" },
  { id: "assignments", label: "Student assignments", href: "/admin/transport?section=assignments" },
  { id: "reports", label: "Reports & printouts", href: "/admin/transport?section=reports" },
];

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function money(value: string) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default async function TransportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission(["transport.manage", "school.settings.manage"]);
  const [params, yearSelection] = await Promise.all([searchParams, getSchoolAcademicYearSelection(context.schoolId)]);
  const querySection = first(params.section);
  const section = querySection === "reports" ? "reports" : sections.some((item) => item.id === querySection) ? querySection || "overview" : "overview";
  const requestedYear = /^\d+$/.test(first(params.yearId)) ? Number(first(params.yearId)) : undefined;
  const selectedYear = yearSelection.years.find((year) => year.id === requestedYear) ?? yearSelection.selectedYear;
  const [branches, routes, drivers, staffRecords, points, terms, feeMasters, enrollments, assignments] = await Promise.all([
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code }).from(schoolBranches).where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active"))).orderBy(asc(schoolBranches.name)),
    db.select({ id: transportRoutes.id, name: transportRoutes.name, code: transportRoutes.code, description: transportRoutes.description, status: transportRoutes.status, branchId: transportRoutes.branchId, branchName: schoolBranches.name, driverName: transportDrivers.name }).from(transportRoutes).leftJoin(schoolBranches, and(eq(schoolBranches.id, transportRoutes.branchId), eq(schoolBranches.schoolId, context.schoolId))).leftJoin(transportDrivers, and(eq(transportDrivers.id, transportRoutes.driverId), eq(transportDrivers.schoolId, context.schoolId))).where(eq(transportRoutes.schoolId, context.schoolId)).orderBy(asc(transportRoutes.name)),
    db.select({ id: transportDrivers.id, name: transportDrivers.name, phone: transportDrivers.phone, licenseNumber: transportDrivers.licenseNumber, staffName: staffMembers.firstName, staffLastName: staffMembers.lastName, status: transportDrivers.status }).from(transportDrivers).leftJoin(staffMembers, and(eq(staffMembers.id, transportDrivers.staffId), eq(staffMembers.schoolId, context.schoolId))).where(eq(transportDrivers.schoolId, context.schoolId)).orderBy(asc(transportDrivers.name)),
    db.select({ id: staffMembers.id, firstName: staffMembers.firstName, lastName: staffMembers.lastName, employeeCode: staffMembers.employeeCode }).from(staffMembers).where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.status, "active"))).orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({ id: transportPickupPoints.id, name: transportPickupPoints.name, routeId: transportPickupPoints.routeId, routeName: transportRoutes.name, sequence: transportPickupPoints.sequence, pickupTime: transportPickupPoints.pickupTime, dropoffTime: transportPickupPoints.dropoffTime }).from(transportPickupPoints).innerJoin(transportRoutes, and(eq(transportRoutes.id, transportPickupPoints.routeId), eq(transportRoutes.schoolId, context.schoolId))).where(eq(transportPickupPoints.schoolId, context.schoolId)).orderBy(asc(transportRoutes.name), asc(transportPickupPoints.sequence)),
    db.select({ id: academicTerms.id, yearId: academicTerms.academicYearId, yearName: academicYears.name, name: academicTerms.name }).from(academicTerms).innerJoin(academicYears, and(eq(academicYears.id, academicTerms.academicYearId), eq(academicYears.schoolId, context.schoolId))).where(and(eq(academicTerms.schoolId, context.schoolId), ...(selectedYear ? [eq(academicTerms.academicYearId, selectedYear.id)] : []))).orderBy(asc(academicTerms.startDate)),
    db.select({ id: transportFeeMasters.id, yearId: transportFeeMasters.academicYearId, termId: transportFeeMasters.academicTermId, routeId: transportFeeMasters.routeId, routeName: transportRoutes.name, termName: academicTerms.name, yearName: academicYears.name, amount: transportFeeMasters.amount, currency: transportFeeMasters.currency }).from(transportFeeMasters).innerJoin(transportRoutes, and(eq(transportRoutes.id, transportFeeMasters.routeId), eq(transportRoutes.schoolId, context.schoolId))).innerJoin(academicTerms, and(eq(academicTerms.id, transportFeeMasters.academicTermId), eq(academicTerms.schoolId, context.schoolId))).innerJoin(academicYears, and(eq(academicYears.id, transportFeeMasters.academicYearId), eq(academicYears.schoolId, context.schoolId))).where(and(eq(transportFeeMasters.schoolId, context.schoolId), ...(selectedYear ? [eq(transportFeeMasters.academicYearId, selectedYear.id)] : []))).orderBy(asc(academicTerms.startDate), asc(transportRoutes.name)),
    selectedYear ? db.select({ id: studentEnrollments.id, studentId: students.id, studentName: students.firstName, lastName: students.lastName, admissionNumber: students.admissionNumber, className: classLevels.name, sectionName: classSections.name }).from(studentEnrollments).innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId))).innerJoin(classSections, and(eq(classSections.id, studentEnrollments.classSectionId), eq(classSections.schoolId, context.schoolId))).innerJoin(classLevels, and(eq(classLevels.id, classSections.classLevelId), eq(classLevels.schoolId, context.schoolId))).where(and(eq(studentEnrollments.schoolId, context.schoolId), eq(studentEnrollments.academicYearId, selectedYear.id), eq(studentEnrollments.status, "enrolled"))).orderBy(asc(students.lastName), asc(students.firstName)) : Promise.resolve([]),
    db.select({ id: transportAssignments.id, studentId: students.id, studentName: students.firstName, lastName: students.lastName, admissionNumber: students.admissionNumber, routeId: transportRoutes.id, routeName: transportRoutes.name, branchId: transportRoutes.branchId, pointName: transportPickupPoints.name, termName: academicTerms.name, yearId: transportFeeMasters.academicYearId, yearName: academicYears.name, amount: transportAssignments.amount, currency: transportAssignments.currency, status: transportAssignments.status, className: classLevels.name, sectionName: classSections.name }).from(transportAssignments).innerJoin(students, and(eq(students.id, transportAssignments.studentId), eq(students.schoolId, context.schoolId))).innerJoin(transportRoutes, and(eq(transportRoutes.id, transportAssignments.routeId), eq(transportRoutes.schoolId, context.schoolId))).innerJoin(transportPickupPoints, and(eq(transportPickupPoints.id, transportAssignments.pickupPointId), eq(transportPickupPoints.schoolId, context.schoolId))).innerJoin(transportFeeMasters, and(eq(transportFeeMasters.id, transportAssignments.feeMasterId), eq(transportFeeMasters.schoolId, context.schoolId))).innerJoin(academicTerms, and(eq(academicTerms.id, transportFeeMasters.academicTermId), eq(academicTerms.schoolId, context.schoolId))).innerJoin(academicYears, and(eq(academicYears.id, transportFeeMasters.academicYearId), eq(academicYears.schoolId, context.schoolId))).innerJoin(studentEnrollments, and(eq(studentEnrollments.id, transportAssignments.enrollmentId), eq(studentEnrollments.schoolId, context.schoolId))).innerJoin(classSections, and(eq(classSections.id, studentEnrollments.classSectionId), eq(classSections.schoolId, context.schoolId))).innerJoin(classLevels, and(eq(classLevels.id, classSections.classLevelId), eq(classLevels.schoolId, context.schoolId))).where(and(eq(transportAssignments.schoolId, context.schoolId), ...(selectedYear ? [eq(transportFeeMasters.academicYearId, selectedYear.id)] : []))).orderBy(asc(students.lastName), asc(students.firstName), asc(academicTerms.startDate)),
  ]);
  const branchId = resolveBranchFilterId(branches, params.branchId !== undefined ? first(params.branchId) : undefined);
  const reportAssignments = section === "reports" ? assignments.filter((row) => branchId === null || row.branchId === branchId) : assignments;
  const branchOptions = branches.map((item) => ({ value: String(item.id), label: item.name }));
  const routeOptions = routes.filter((item) => item.status === "active").map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}` }));
  const driverOptions = drivers.filter((item) => item.status === "active").map((item) => ({ value: String(item.id), label: `${item.name} · ${item.licenseNumber}` }));
  const pointOptions = points.map((item) => ({ value: String(item.id), label: `${item.routeName} · ${item.name}` }));
  const termOptions = terms.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.yearName}` }));
  const feeOptions = feeMasters.map((item) => ({ value: String(item.id), label: `${item.routeName} · ${item.termName} · ${item.currency} ${money(item.amount)}` }));
  const enrollmentOptions = enrollments.map((item) => ({ value: String(item.id), label: `${item.lastName}, ${item.studentName}${item.admissionNumber ? ` · ${item.admissionNumber}` : ""} · ${item.className} ${item.sectionName}` }));
  const formBySection: Record<string, { title: string; kind: string; fields: TransportField[] }> = {
    routes: { title: "Add route", kind: "route", fields: [
      { name: "name", label: "Route name" }, { name: "code", label: "Route code" },
      { name: "branchId", label: "Branch (optional)", options: [{ value: "", label: "All branches" }, ...branchOptions], required: false },
      { name: "driverId", label: "Assigned driver (optional)", options: [{ value: "", label: "Unassigned" }, ...driverOptions], required: false },
      { name: "description", label: "Route notes", required: false },
    ] },
    points: { title: "Add pickup point", kind: "pickup-point", fields: [
      { name: "routeId", label: "Route", options: routeOptions }, { name: "name", label: "Pickup point" },
      { name: "sequence", label: "Stop order", type: "number" }, { name: "pickupTime", label: "Pickup time", type: "time", required: false }, { name: "dropoffTime", label: "Drop-off time", type: "time", required: false },
    ] },
    drivers: { title: "Add driver", kind: "driver", fields: [
      { name: "name", label: "Driver name" }, { name: "phone", label: "Phone number" }, { name: "licenseNumber", label: "License number" },
      { name: "staffId", label: "Linked staff record (optional)", options: [{ value: "", label: "No linked staff record" }, ...staffRecords.map((staff) => ({ value: String(staff.id), label: `${staff.firstName} ${staff.lastName}${staff.employeeCode ? ` · ${staff.employeeCode}` : ""}` }))], required: false },
    ] },
    fees: { title: "Set term transport fee", kind: "fee-master", fields: [
      { name: "routeId", label: "Route", options: routeOptions }, { name: "academicTermId", label: "Academic term", options: termOptions },
      { name: "amount", label: "Fee per student for this term", type: "number" }, { name: "currency", label: "Currency", placeholder: "Currency code", defaultValue: context.schoolCurrency },
    ] },
    assignments: { title: "Assign transport to student", kind: "assignment", fields: [
      { name: "enrollmentId", label: "Student and class", options: enrollmentOptions }, { name: "feeMasterId", label: "Term fee", options: feeOptions }, { name: "pickupPointId", label: "Pickup point", options: pointOptions },
    ] },
  };
  const currentForm = formBySection[section];
  const rowAssignments = reportAssignments.map((row) => ({
    id: row.id,
    values: { student: `${row.studentName} ${row.lastName}`, admission: row.admissionNumber ?? "—", class: `${row.className} ${row.sectionName}`, route: row.routeName, pickup: row.pointName, term: `${row.termName} · ${row.yearName}`, fee: `${row.currency} ${money(row.amount)}`, status: row.status },
    searchableText: `${row.studentName} ${row.lastName} ${row.admissionNumber ?? ""} ${row.routeName} ${row.pointName} ${row.termName} ${row.yearName}`,
  }));
  const totalsByCurrency = new Map<string, number>();
  for (const row of reportAssignments) totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + Number(row.amount));
  const assignedTotalLabel = [...totalsByCurrency].map(([currency, total]) => `${currency} ${money(String(total))}`).join(" · ") || "—";
  const printable = <div id="transport-report-output" className="rounded-2xl border border-slate-200 bg-white p-4 print:border-0 print:p-0"><h2 className="mb-3 text-lg font-semibold">Transport assignments · {selectedYear?.name ?? "All academic years"}</h2><AdminDataTable title="Transport fee assignments" columns={[{ key: "student", label: "Student" }, { key: "admission", label: "Admission no." }, { key: "class", label: "Class / section" }, { key: "route", label: "Route" }, { key: "pickup", label: "Pickup point" }, { key: "term", label: "Term" }, { key: "fee", label: "Fee assigned" }, { key: "status", label: "Status" }]} rows={rowAssignments} emptyMessage="No transport assignments match the selected filters." />
    <p className="mt-3 text-sm font-semibold">Total assigned transport fees: {selectedYear?.name ?? "All years"} · {assignedTotalLabel}</p></div>;
  const countResult = <T,>(rows: T[]) => rows.length;

  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-violet-700">School operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{section === "overview" ? "Transport overview" : sections.find((item) => item.id === section)?.label ?? "Transport reports"}</h1><p className="mt-2 text-sm text-slate-600">Manage routes, drivers, pickup points, and term fees assigned to students.</p></div>
      {section === "reports" && <div className="flex gap-2 print:hidden"><DownloadCsv fileName="transport-fee-assignments.csv" headers={["Student", "Admission no.", "Class / section", "Route", "Pickup point", "Term", "Fee assigned", "Status"]} rows={rowAssignments.map((row) => [row.values.student, row.values.admission, row.values.class, row.values.route, row.values.pickup, row.values.term, row.values.fee, row.values.status])} /><PrintButton label="Print transport report" targetId="transport-report-output" /></div>}
    </header>
    <nav aria-label="Transport sections" className="flex flex-wrap gap-2">{sections.map((item) => <Link key={item.id} href={item.href} className={`rounded-xl px-3 py-2 text-sm font-semibold ${section === item.id ? "bg-violet-100 text-violet-800" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{item.label}</Link>)}</nav>
    {section === "overview" && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><OverviewCard title="Routes" value={countResult(routes)} detail="Active and inactive routes" icon={<BusFront size={18} />} /><OverviewCard title="Drivers" value={countResult(drivers)} detail="Transport driver records" icon={<Users size={18} />} /><OverviewCard title="Pickup points" value={countResult(points)} detail="Ordered stops across routes" icon={<MapPin size={18} />} /><OverviewCard title="Students assigned" value={new Set(assignments.map((row) => row.studentId)).size} detail={`${selectedYear?.name ?? "All years"} · fee assigned ${assignedTotalLabel}`} icon={<Wallet size={18} />} /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{sections.slice(1).map((item) => <Link key={item.id} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-violet-200 hover:shadow-sm"><h2 className="font-semibold text-slate-900">{item.label}</h2><p className="mt-2 text-sm text-slate-500">{item.id === "fees" ? "Set a route fee for each academic term." : item.id === "assignments" ? "Assign a student, route, pickup point, and term fee." : item.id === "reports" ? "Filter and print student transport fee assignments." : `Manage transport ${item.label.toLocaleLowerCase()}.`}</p></Link>)}</div>
    </>}
    {section === "reports" && <><SmartFilterForm method="get" className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 print:hidden"><input type="hidden" name="section" value="reports"/><label className="space-y-1 text-sm font-medium text-slate-700">Academic year<select name="yearId" defaultValue={selectedYear ? String(selectedYear.id) : ""} className="h-10 rounded-lg border border-slate-200 bg-white px-3">{yearSelection.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label className="space-y-1 text-sm font-medium text-slate-700">Branch<select name="branchId" defaultValue={branchId ? String(branchId) : ""} className="h-10 rounded-lg border border-slate-200 bg-white px-3"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></SmartFilterForm>{printable}</>}
    {currentForm && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold text-slate-900">{currentForm.title}</h2><p className="mt-1 text-sm text-slate-500">{section === "fees" ? "The fee is assigned to each student using this route for the selected term." : section === "assignments" ? "The student's term fee amount is copied from the fee master when assigned." : "Add this transport record to the school register."}</p></div><TransportRecordForm kind={currentForm.kind} fields={currentForm.fields} /></section>}
    {section === "routes" && <AdminDataTable title="Transport routes" columns={[{key:"code",label:"Route code"},{key:"name",label:"Route"},{key:"branchName",label:"Branch"},{key:"driverName",label:"Driver"},{key:"status",label:"Status"},{key:"description",label:"Notes"}]} rows={routes.map((row)=>({id:row.id,values:{code:row.code,name:row.name,branchName:row.branchName??"All branches",driverName:row.driverName??"Unassigned",status:row.status,description:row.description??""},searchableText:`${row.code} ${row.name} ${row.branchName??""} ${row.driverName??""}`}))} emptyMessage="No routes have been created."/>}
    {section === "drivers" && <AdminDataTable title="Transport drivers" columns={[{key:"name",label:"Driver"},{key:"phone",label:"Phone"},{key:"license",label:"License no."},{key:"staff",label:"Staff record"},{key:"status",label:"Status"}]} rows={drivers.map((row)=>({id:row.id,values:{name:row.name,phone:row.phone,license:row.licenseNumber,staff:row.staffName?`${row.staffName} ${row.staffLastName??""}`:"Not linked",status:row.status},searchableText:`${row.name} ${row.phone} ${row.licenseNumber}`}))} emptyMessage="No drivers have been added."/>}
    {section === "points" && <AdminDataTable title="Route pickup points" columns={[{key:"route",label:"Route"},{key:"sequence",label:"Stop"},{key:"point",label:"Pickup point"},{key:"pickup",label:"Pickup time"},{key:"dropoff",label:"Drop-off time"}]} rows={points.map((row)=>({id:row.id,values:{route:row.routeName,sequence:String(row.sequence),point:row.name,pickup:row.pickupTime??"—",dropoff:row.dropoffTime??"—"},searchableText:`${row.routeName} ${row.name}`}))} emptyMessage="No pickup points have been added."/>}
    {section === "fees" && <AdminDataTable title="Transport fee master" columns={[{key:"year",label:"Academic year"},{key:"term",label:"Term"},{key:"route",label:"Route"},{key:"amount",label:"Fee per student"}]} rows={feeMasters.map((row)=>({id:row.id,values:{year:row.yearName,term:row.termName,route:row.routeName,amount:`${row.currency} ${money(row.amount)}`},searchableText:`${row.yearName} ${row.termName} ${row.routeName}`}))} emptyMessage="No transport term fees have been set."/>}
    {section === "assignments" && <AdminDataTable title="Student transport assignments" columns={[{key:"student",label:"Student"},{key:"admission",label:"Admission no."},{key:"route",label:"Route"},{key:"pickup",label:"Pickup point"},{key:"term",label:"Term"},{key:"fee",label:"Fee assigned"}]} rows={rowAssignments.map((row)=>({id:row.id,values:{student:row.values.student,admission:row.values.admission,route:row.values.route,pickup:row.values.pickup,term:row.values.term,fee:row.values.fee},searchableText:row.searchableText}))} emptyMessage="No students have been assigned transport for this academic year."/>}
  </main>;
}

function OverviewCard({ title, value, detail, icon }: { title: string; value: number; detail: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-slate-600">{title}</h2><span className="text-violet-700">{icon}</span></div><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
