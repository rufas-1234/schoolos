import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { AdminDataTable, type AdminTableRow } from "@/components/admin-data-table";
import { db } from "@/db";
import { staffApplications } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { staffSettingFields } from "@/lib/staff-settings";
import { BulkStaffApplicationApprovalForm, StaffApplicationReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

export default async function StaffApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const { search } = await searchParams;
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const applications = await db.select({
    publicId: staffApplications.publicId,
    applicationData: staffApplications.applicationData,
    status: staffApplications.status,
    createdAt: staffApplications.createdAt,
    canResume: sql<boolean>`CASE WHEN ${staffApplications.reviewedAt} < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE) THEN TRUE ELSE FALSE END`,
  }).from(staffApplications).where(eq(staffApplications.schoolId, context.schoolId))
    .orderBy(desc(staffApplications.createdAt), asc(staffApplications.id));

  const publicFormPath = `/staff-registration/${context.schoolPublicId}`;
  const rows: AdminTableRow[] = applications.map((application) => {
    const data = application.applicationData;
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ");
    const displayData = staffSettingFields
      .filter((field) => field.name !== "linkedUserId")
      .map((field) => ({ label: field.label, value: data[field.name] }))
      .filter((field) => field.value);
    return {
      id: application.publicId,
      values: {
        name: fullName,
        email: data.email || "-",
        phone: data.phone || "-",
        role: data.jobTitle || data.personnelRole || "-",
        department: data.department || "-",
        status: application.status,
        submitted: application.createdAt.toLocaleString(),
      },
      searchableText: [
        fullName,
        data.email,
        data.phone,
        data.employeeCode,
        data.jobTitle,
        data.department,
        application.status,
      ].filter(Boolean).join(" "),
      actions: (
        <StaffApplicationReviewActions
          publicId={application.publicId}
          status={application.status}
          applicantName={fullName || "Applicant"}
          details={displayData}
          canResume={application.status === "processing" && application.canResume}
        />
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Human resources</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Staff applications</h1>
          <p className="mt-1 text-sm text-slate-600">Review public staff registrations before adding people to the staff directory.</p>
        </div>
        <Link href={publicFormPath} target="_blank" rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          Open public form <ExternalLink size={16} aria-hidden="true" />
        </Link>
      </header>
      <section className="border border-slate-200 bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-900">Staff registration link</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-600">{publicFormPath}</p>
      </section>
      <AdminDataTable
        title="Applications"
        columns={[
          { key: "name", label: "Applicant" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Mobile" },
          { key: "role", label: "Position" },
          { key: "department", label: "Department" },
          { key: "status", label: "Status" },
          { key: "submitted", label: "Submitted" },
        ]}
        rows={rows}
        toolbarActions={<BulkStaffApplicationApprovalForm pendingCount={applications.filter((application) => application.status === "pending").length} />}
        initialQuery={typeof search === "string" ? search.slice(0, 200) : ""}
        filters={[{
          key: "status",
          label: "Status",
          options: [
            { value: "pending", label: "Pending" },
            { value: "processing", label: "Processing" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ],
        }]}
        emptyMessage="No staff applications have been received."
      />
    </div>
  );
}
