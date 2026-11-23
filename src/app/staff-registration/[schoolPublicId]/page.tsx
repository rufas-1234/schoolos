import Image from "next/image";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  schoolBranches,
  schools,
  staffDepartments,
  staffDesignations,
  staffSettings,
} from "@/db/schema";
import { schoolLogoSource } from "@/lib/school-logo";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { getDefaultBranchId } from "@/lib/branch-selection-policy";
import { PublicPlatformShell } from "@/components/public-platform-shell";
import {
  defaultRequiredStaffFields,
  normalizePublicStaffVisibleFields,
  normalizeRequiredStaffFields,
  staffSettingFields,
} from "@/lib/staff-settings";
import { PublicStaffRegistrationForm } from "./public-staff-registration-form";

export const dynamic = "force-dynamic";

export default async function PublicStaffRegistrationPage({
  params,
}: {
  params: Promise<{ schoolPublicId: string }>;
}) {
  const { schoolPublicId } = await params;
  const [school] = await db.select({
    id: schools.id,
    publicId: schools.publicId,
    name: schools.name,
    logoUrl: schools.logoUrl,
    address: schools.address,
    phone: schools.phone,
    email: schools.email,
  }).from(schools).where(and(
    eq(schools.publicId, schoolPublicId),
    eq(schools.status, schoolWorkspaceStatuses.active),
    isNull(schools.archivedAt),
  )).limit(1);
  if (!school) notFound();

  const [savedSettings, branches, departments, designations] = await Promise.all([
    db.select({
      requiredFields: staffSettings.requiredFields,
      visibleFields: staffSettings.visibleFields,
    }).from(staffSettings).where(eq(staffSettings.schoolId, school.id)).limit(1)
      .then((rows) => rows[0]),
    db.select({
      id: schoolBranches.id,
      label: schoolBranches.name,
      code: schoolBranches.code,
    })
      .from(schoolBranches).where(and(
        eq(schoolBranches.schoolId, school.id),
        eq(schoolBranches.status, "active"),
      )).orderBy(asc(schoolBranches.name)),
    db.select({
      id: staffDepartments.id,
      label: staffDepartments.name,
      branchId: staffDepartments.branchId,
    }).from(staffDepartments).where(eq(staffDepartments.schoolId, school.id))
      .orderBy(asc(staffDepartments.name)),
    db.select({
      id: staffDesignations.id,
      label: staffDesignations.name,
      branchId: staffDesignations.branchId,
    }).from(staffDesignations).where(eq(staffDesignations.schoolId, school.id))
      .orderBy(asc(staffDesignations.name)),
  ]);
  const requiredFields = normalizeRequiredStaffFields(
    savedSettings?.requiredFields ?? defaultRequiredStaffFields,
  ).filter((field) => field !== "linkedUserId");
  const visibleFields = normalizePublicStaffVisibleFields(
    savedSettings?.visibleFields,
    savedSettings?.requiredFields ?? defaultRequiredStaffFields,
  );
  const availableBranches = branches.filter((branch) =>
    departments.some((department) => department.branchId === null || department.branchId === branch.id) &&
    designations.some((designation) => designation.branchId === null || designation.branchId === branch.id),
  );
  const defaultBranchId = getDefaultBranchId(availableBranches);
  const schoolLogo = schoolLogoSource(school.logoUrl);

  return (
    <PublicPlatformShell
      title="Staff registration"
      schoolName={school.name}
      navigation={[
        { href: `/admission/${school.publicId}`, label: "Student admission" },
        { href: `/staff-registration/${school.publicId}`, label: "Staff registration" },
        { href: "/guide", label: "User guide" },
      ]}
    >
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="border border-slate-300 bg-white p-5 sm:p-7">
          <div className="flex items-center gap-4">
            {schoolLogo && (
              <Image src={schoolLogo} unoptimized width={64} height={64} alt={`${school.name} logo`}
                className="h-14 w-14 shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">{school.name}</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">Staff registration</h1>
              <p className="mt-2 text-sm text-slate-600">
                {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </header>
        {availableBranches.length ? (
          <PublicStaffRegistrationForm
            schoolPublicId={school.publicId}
            defaultBranchId={defaultBranchId}
            visibleFields={visibleFields}
            requiredFields={requiredFields}
            fieldDefinitions={staffSettingFields}
            branches={availableBranches}
            departments={departments}
            designations={designations}
          />
        ) : (
          <section className="border border-slate-300 bg-white p-6 text-sm text-slate-700">
            Staff registration is not available yet. Please contact the school for help.
          </section>
        )}
      </div>
    </main>
    </PublicPlatformShell>
  );
}
