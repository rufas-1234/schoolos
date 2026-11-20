import { asc } from "drizzle-orm";
import Link from "next/link";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { getSchoolDisplayStatus } from "@/lib/school-lifecycle-policy";
import { CreateSchoolForm } from "./create-school-form";
import { SchoolManagementControls } from "./school-management-controls";
import { PlatformSignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function PlatformSchoolsPage() {
  await requirePlatformAdmin();
  const schoolList = await db.select({
    name: schools.name,
    email: schools.email,
    phone: schools.phone,
    address: schools.address,
    publicId: schools.publicId,
    createdAt: schools.createdAt,
    status: schools.status,
    archivedAt: schools.archivedAt,
  }).from(schools).orderBy(asc(schools.name), asc(schools.id));

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">School workspaces</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Public signups wait for approval here. Manage school details and disable access without deleting tenant data.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/platform/accounts" className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-800">
              Account recovery
            </Link>
            <PlatformSignOutButton />
          </div>
        </header>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]">
          <AdminDataTable
            title="Registered schools"
            columns={[
              { key: "name", label: "School" },
              { key: "contact", label: "Contact" },
              { key: "status", label: "Status" },
              { key: "publicId", label: "Workspace ID" },
              { key: "createdAt", label: "Created" },
            ]}
            filters={[{
              key: "status",
              label: "Status",
              options: [
                { value: "pending", label: "Pending review" },
                { value: "active", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "archived", label: "Archived" },
              ],
            }]}
            rows={schoolList.map((school) => ({
              id: school.publicId,
              searchableText: `${school.name} ${school.email ?? ""} ${school.phone ?? ""} ${school.publicId} ${getSchoolDisplayStatus(school.status, school.archivedAt)}`,
              values: {
                name: school.name,
                contact: school.email || school.phone || "No contact details",
                status: getSchoolDisplayStatus(school.status, school.archivedAt),
                publicId: school.publicId,
                createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(school.createdAt),
              },
              actions: (
                <SchoolManagementControls
                  schoolPublicId={school.publicId}
                  name={school.name}
                  email={school.email}
                  phone={school.phone}
                  address={school.address}
                  status={school.status}
                  archived={school.archivedAt !== null}
                />
              ),
            }))}
            emptyMessage="No school workspaces have been created yet."
            mobileCardView
            showRowNumber={false}
          />
          <CreateSchoolForm />
        </div>
      </div>
    </main>
  );
}
