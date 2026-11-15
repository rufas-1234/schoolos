import { and, asc, count, eq } from "drizzle-orm";
import { BriefcaseBusiness } from "lucide-react";
import {
  AdminActionDialog,
  AdminDataTable,
  AdminRecordDialog,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { db } from "@/db";
import {
  schoolMemberships,
  schoolBranches,
  staffDepartments,
  staffDesignations,
  staffMembers,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { transitionStaffStatus } from "./actions";
import { StaffForm } from "./staff-form";

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
};

export default async function StaffDirectoryPage() {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);

  const [records, totals, accounts, branches, departments, designations] = await Promise.all([
    db
      .select({
        id: staffMembers.id,
        publicId: staffMembers.publicId,
        firstName: staffMembers.firstName,
        lastName: staffMembers.lastName,
        employeeCode: staffMembers.employeeCode,
        branchId: staffMembers.branchId,
        personnelRole: staffMembers.personnelRole,
        jobTitle: staffMembers.jobTitle,
        department: staffMembers.department,
        email: staffMembers.email,
        phone: staffMembers.phone,
        dateOfBirth: staffMembers.dateOfBirth,
        fatherName: staffMembers.fatherName,
        motherName: staffMembers.motherName,
        gender: staffMembers.gender,
        maritalStatus: staffMembers.maritalStatus,
        address: staffMembers.address,
        permanentAddress: staffMembers.permanentAddress,
        emergencyContactName: staffMembers.emergencyContactName,
        emergencyContactPhone: staffMembers.emergencyContactPhone,
        drivingLicense: staffMembers.drivingLicense,
        showAsExpert: staffMembers.showAsExpert,
        qualification: staffMembers.qualification,
        experience: staffMembers.experience,
        epfNumber: staffMembers.epfNumber,
        basicSalary: staffMembers.basicSalary,
        contractType: staffMembers.contractType,
        location: staffMembers.location,
        bankAccountName: staffMembers.bankAccountName,
        bankAccountNumber: staffMembers.bankAccountNumber,
        bankName: staffMembers.bankName,
        bankBranch: staffMembers.bankBranch,
        facebookUrl: staffMembers.facebookUrl,
        twitterUrl: staffMembers.twitterUrl,
        linkedinUrl: staffMembers.linkedinUrl,
        instagramUrl: staffMembers.instagramUrl,
        documents: staffMembers.documents,
        customFields: staffMembers.customFields,
        linkedUserId: staffMembers.linkedUserId,
        employmentType: staffMembers.employmentType,
        status: staffMembers.status,
        startDate: staffMembers.startDate,
      })
      .from(staffMembers)
      .where(eq(staffMembers.schoolId, context.schoolId))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db
      .select({ status: staffMembers.status, total: count() })
      .from(staffMembers)
      .where(eq(staffMembers.schoolId, context.schoolId))
      .groupBy(staffMembers.status),
    db.select({ id: user.id, name: user.name, email: user.email })
      .from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(schoolMemberships.status, "active"),
        eq(user.isActive, true),
      ))
      .orderBy(asc(user.name)),
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
    db.select({
      id: staffDepartments.id,
      name: staffDepartments.name,
      branchId: staffDepartments.branchId,
    }).from(staffDepartments)
      .where(eq(staffDepartments.schoolId, context.schoolId))
      .orderBy(asc(staffDepartments.name)),
    db.select({
      id: staffDesignations.id,
      name: staffDesignations.name,
      branchId: staffDesignations.branchId,
    }).from(staffDesignations)
      .where(eq(staffDesignations.schoolId, context.schoolId))
      .orderBy(asc(staffDesignations.name)),
  ]);
  const activeCount = totals.find((item) => item.status === "active")?.total ?? 0;
  const inactiveCount = totals.find((item) => item.status === "inactive")?.total ?? 0;
  const totalCount = totals.reduce((sum, item) => sum + item.total, 0);
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const filters: AdminTableFilter[] = [
    { key: "branch", label: "branch", options: uniqueOptions(branches.map((branch) => branch.name)) },
    { key: "department", label: "department", options: uniqueOptions(records.map((record) => record.department)) },
    {
      key: "employmentType",
      label: "employment type",
      options: uniqueOptions(records.map((record) => employmentTypeLabels[record.employmentType] ?? record.employmentType)),
    },
    { key: "status", label: "status", options: uniqueOptions(records.map((record) => record.status)) },
  ];

  return (
    <div className="space-y-8">
      <div className="print:hidden">
        <p className="text-sm font-medium text-violet-700">People</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Staff directory
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Manage teaching and non-teaching staff for {context.schoolName}. Staff records are private to this school.
        </p>
      </div>

      <section className="print:hidden grid gap-3 sm:grid-cols-3">
        <SummaryCard label="All staff" value={totalCount} />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard label="Inactive" value={inactiveCount} />
      </section>

      <div className="space-y-4 print:block">
        <AdminDataTable
          title="Staff directory"
          columns={[
            { key: "employeeCode", label: "Employee ID" },
            { key: "name", label: "Staff member" },
            { key: "jobTitle", label: "Job title" },
            { key: "department", label: "Department" },
            { key: "branch", label: "Branch" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "account", label: "Account" },
            { key: "employmentType", label: "Employment type" },
            { key: "startDate", label: "Start date" },
            { key: "status", label: "Status" },
          ]}
          filters={filters}
          requireSearchCriteria
          showActionLabels
          toolbarActions={
            <AdminActionDialog label="Add staff member" title="Add staff member">
              <StaffForm
                accounts={accounts}
                branches={branches}
                departments={departments}
                designations={designations}
              />
            </AdminActionDialog>
          }
          rows={records.map((record) => ({
            id: record.id,
            values: {
              employeeCode: record.employeeCode ?? "",
              name: `${record.firstName} ${record.lastName}`,
              jobTitle: record.jobTitle,
              department: record.department,
              branch: record.branchId ? branchNameById.get(record.branchId) ?? "" : "",
              email: record.email ?? "",
              phone: record.phone ?? "",
              account: record.linkedUserId ? "Linked" : "Not linked",
              employmentType: employmentTypeLabels[record.employmentType] ?? record.employmentType,
              startDate: record.startDate ?? "",
              status: record.status,
            },
            actions: (
              <div className="flex min-w-36 flex-wrap items-center gap-2">
                <AdminRecordDialog showLabel title={`Edit ${record.firstName} ${record.lastName}`}>
                  <StaffForm
                    record={record}
                    accounts={accounts}
                    branches={branches}
                    departments={departments}
                    designations={designations}
                  />
                </AdminRecordDialog>
                <form action={transitionStaffStatus}>
                  <input type="hidden" name="publicId" value={record.publicId} />
                  <input
                    type="hidden"
                    name="nextStatus"
                    value={record.status === "active" ? "inactive" : "active"}
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {record.status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            ),
          }))}
          emptyMessage="No staff records yet."
        />
        <div className="print:hidden flex gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
          <BriefcaseBusiness size={18} className="mt-0.5 shrink-0 text-violet-700" />
          <p className="text-sm leading-6 text-slate-600">
            Staff may be linked to an existing school account, but this directory does not create accounts or assign permissions. Staff with the Teacher role are available for academic assignments.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

function uniqueOptions(labels: string[]) {
  return [...new Set(labels)].map((label) => ({ value: label, label }));
}
