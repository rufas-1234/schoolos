import { asc } from "drizzle-orm";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { CreateSchoolForm } from "./create-school-form";
import { PlatformSignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function PlatformSchoolsPage() {
  await requirePlatformAdmin();
  const schoolList = await db.select({
    name: schools.name,
    email: schools.email,
    phone: schools.phone,
    publicId: schools.publicId,
    createdAt: schools.createdAt,
  }).from(schools).orderBy(asc(schools.name), asc(schools.id));

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">School workspaces</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Provisioning is restricted to configured platform administrators. Each school has separate membership, roles, and tenant-scoped records.
            </p>
          </div>
          <PlatformSignOutButton />
        </header>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]">
          <AdminDataTable
            title="Registered schools"
            columns={[
              { key: "name", label: "School" },
              { key: "contact", label: "Contact" },
              { key: "publicId", label: "Workspace ID" },
              { key: "createdAt", label: "Created" },
            ]}
            rows={schoolList.map((school) => ({
              id: school.publicId,
              searchableText: `${school.name} ${school.email ?? ""} ${school.phone ?? ""} ${school.publicId}`,
              values: {
                name: school.name,
                contact: school.email || school.phone || "No contact details",
                publicId: school.publicId,
                createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(school.createdAt),
              },
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
