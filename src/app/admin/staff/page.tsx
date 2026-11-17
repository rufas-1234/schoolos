import { and, asc, count, eq } from "drizzle-orm";
import { BriefcaseBusiness } from "lucide-react";
import {
  AdminConfirmSubmitButton,
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
  staffSettings,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  defaultVisibleStaffFields,
  defaultRequiredStaffFields,
  normalizeVisibleStaffFields,
  normalizeRequiredStaffFields,
} from "@/lib/staff-settings";
import { transitionStaffStatus } from "./actions";
import { StaffForm } from "./staff-form";
const employmentTypeLabels: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
};

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string | string[] }>;
}) {
  const { profile } = await searchParams;
  const profilePublicId = typeof profile === "string" && profile.length <= 36 ? profile : "";
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);

  const [records, totals, accounts, branches, departments, designations, settings] = await Promise.all([
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
    db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      membershipStatus: schoolMemberships.status,
    })
      .from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
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
    db.select({
      requiredFields: staffSettings.requiredFields,
      visibleFields: staffSettings.visibleFields,
    })
      .from(staffSettings).where(eq(staffSettings.schoolId, context.schoolId)).limit(1),
  ]);
  const requiredFields = normalizeRequiredStaffFields(settings[0]?.requiredFields ?? defaultRequiredStaffFields);
  const visibleFields = normalizeVisibleStaffFields(settings[0]?.visibleFields ?? defaultVisibleStaffFields);
  const activeCount = totals.find((item) => item.status === "active")?.total ?? 0;
  const inactiveCount = totals.find((item) => item.status === "inactive")?.total ?? 0;
  const totalCount = totals.reduce((sum, item) => sum + item.total, 0);
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const loginAccessByUserId = new Map(accounts.map((account) => [
    account.id,
    account.membershipStatus === "active",
  ]));
  const filters: AdminTableFilter[] = [
    { key: "branch", label: "branch", options: uniqueOptions(branches.map((branch) => branch.name)) },
    { key: "department", label: "department", options: uniqueOptions(records.map((record) => record.department)) },
    {
      key: "employmentType",
      label: "employment type",
      options: uniqueOptions(records.map((record) => employmentTypeLabels[record.employmentType] ?? record.employmentType)),
    },
    { key: "status", label: "status", options: uniqueOptions(records.map((record) => record.status)) },
    {
      key: "personnelRole",
      label: "staff role",
      options: uniqueOptions(records.map((record) => record.personnelRole ?? "Unassigned")),
    },
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
                requiredFields={requiredFields}
                visibleFields={visibleFields}
              />
            </AdminActionDialog>
          }
          rows={records.map((record) => ({
            id: record.id,
            clickableColumns: ["name"],
            values: {
              employeeCode: record.employeeCode ?? "",
              name: `${record.firstName} ${record.lastName}`,
              jobTitle: record.jobTitle,
              department: record.department,
              branch: record.branchId ? branchNameById.get(record.branchId) ?? "" : "",
              email: record.email ?? "",
              phone: record.phone ?? "",
              account: record.linkedUserId
                ? loginAccessByUserId.get(record.linkedUserId) ? "Login enabled" : "Login disabled"
                : "No account",
              employmentType: employmentTypeLabels[record.employmentType] ?? record.employmentType,
              startDate: record.startDate ?? "",
              status: record.status,
              personnelRole: record.personnelRole ?? "Unassigned",
            },
            actions: (
              <div className="flex min-w-36 flex-wrap items-center gap-2">
                <AdminRecordDialog
                  mode="view"
                  wide
                  title={`${record.firstName} ${record.lastName}`}
                  initialOpen={profilePublicId === record.publicId}
                >
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {[
                      ["Employee ID", record.employeeCode],
                      ["Status", record.status],
                      ["Role", record.personnelRole],
                      ["Job title", record.jobTitle],
                      ["Department", record.department],
                      ["Branch", record.branchId ? branchNameById.get(record.branchId) : null],
                      ["Employment type", employmentTypeLabels[record.employmentType] ?? record.employmentType],
                      ["Start date", record.startDate],
                      ["Email", record.email],
                      ["Phone", record.phone],
                      ["Date of birth", record.dateOfBirth],
                      ["Gender", record.gender],
                      ["Marital status", record.maritalStatus],
                      ["Address", record.address],
                      ["Permanent address", record.permanentAddress],
                      ["Emergency contact", record.emergencyContactName],
                      ["Emergency contact phone", record.emergencyContactPhone],
                      ["Qualification", record.qualification],
                      ["Experience", record.experience],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 border-b border-slate-100 pb-3 last:border-0">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm text-slate-900">{value || "Not provided"}</dd>
                      </div>
                    ))}
                  </dl>
                </AdminRecordDialog>
                <AdminRecordDialog showLabel title={`Edit ${record.firstName} ${record.lastName}`}>
                  <StaffForm
                    record={{
                      ...record,
                      loginAccessEnabled: record.linkedUserId
                        ? loginAccessByUserId.get(record.linkedUserId) ?? false
                        : false,
                    }}
                    accounts={accounts}
                    branches={branches}
                    departments={departments}
                    designations={designations}
                    requiredFields={requiredFields}
                    visibleFields={visibleFields}
                  />
                </AdminRecordDialog>
                <form action={transitionStaffStatus}>
                  <input type="hidden" name="publicId" value={record.publicId} />
                  <input
                    type="hidden"
                    name="nextStatus"
                    value={record.status === "active" ? "inactive" : "active"}
                  />
                  <AdminConfirmSubmitButton
                    label={`${record.status === "active" ? "Deactivate" : "Reactivate"} ${record.firstName} ${record.lastName}`}
                    buttonText={record.status === "active" ? "Deactivate" : "Reactivate"}
                    confirmationTitle={record.status === "active" ? "Confirm staff deactivation" : "Confirm staff reactivation"}
                    confirmationMessage={record.status === "active"
                      ? `Deactivate ${record.firstName} ${record.lastName}? They will no longer be available for active school operations.`
                      : `Reactivate ${record.firstName} ${record.lastName}?`}
                    variant={record.status === "active" ? "danger" : "primary"}
                  />
                </form>
              </div>
            ),
          }))}
          emptyMessage="No staff records yet."
        />
        <div className="print:hidden flex gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
          <BriefcaseBusiness size={18} className="mt-0.5 shrink-0 text-violet-700" />
          <p className="text-sm leading-6 text-slate-600">
            Enable login access in a staff profile to reuse an account with the staff email or create a new password account. Assign the Teacher role and its permissions under User Roles before the teacher signs in.
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
