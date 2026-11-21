import Image from "next/image";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  schools,
  studentCategories,
  studentSettings,
} from "@/db/schema";
import { normalizeStudentFieldSettings, studentSettingFields } from "@/lib/student-settings";
import { schoolLogoSource } from "@/lib/school-logo";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { PublicPlatformShell } from "@/components/public-platform-shell";
import { PublicAdmissionForm } from "./public-admission-form";

export const dynamic = "force-dynamic";

export default async function PublicAdmissionPage({
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

  const [savedSettings, branches, years] = await Promise.all([
    db.select({ fields: studentSettings.fields }).from(studentSettings)
      .where(eq(studentSettings.schoolId, school.id)).limit(1).then((rows) => rows[0]),
    db.select({ id: schoolBranches.id, label: schoolBranches.name }).from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, school.id), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name)),
    db.select({ id: academicYears.id, label: academicYears.name }).from(academicYears)
      .where(and(eq(academicYears.schoolId, school.id), eq(academicYears.status, "active")))
      .orderBy(desc(academicYears.startDate)),
  ]);
  const fields = normalizeStudentFieldSettings(savedSettings?.fields);
  const branchIds = branches.map((branch) => branch.id);
  const [classes, sections, categories] = branchIds.length
    ? await Promise.all([
      db.select({
        id: classLevels.id,
        branchId: classLevels.branchId,
        label: classLevels.name,
      }).from(classLevels).where(and(
        eq(classLevels.schoolId, school.id),
        eq(classLevels.status, "active"),
        inArray(classLevels.branchId, branchIds),
      )).orderBy(asc(classLevels.name)),
      db.select({
        id: classSections.id,
        academicYearId: classSections.academicYearId,
        classLevelId: classSections.classLevelId,
        label: classSections.name,
      }).from(classSections)
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, school.id),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, school.id),
          eq(academicYears.status, "active"),
        ))
        .where(and(
          eq(classSections.schoolId, school.id),
          inArray(classLevels.branchId, branchIds),
        ))
        .orderBy(asc(classSections.name)),
      db.select({
        id: studentCategories.id,
        branchId: studentCategories.branchId,
        label: studentCategories.name,
      }).from(studentCategories).where(and(
        eq(studentCategories.schoolId, school.id),
        inArray(studentCategories.branchId, branchIds),
      )).orderBy(asc(studentCategories.name)),
    ])
    : [[], [], []];
  const schoolLogo = schoolLogoSource(school.logoUrl);

  return (
    <PublicPlatformShell
      title="Online student registration"
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
            {schoolLogo && <Image src={schoolLogo} unoptimized width={72} height={72} alt={`${school.name} logo`} className="h-16 w-16 shrink-0 object-contain" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">{school.name}</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">Online student registration</h1>
              <p className="mt-2 text-sm text-slate-600">
                {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </header>
        {branches.length && years.length && classes.length && sections.length ? (
          <PublicAdmissionForm
            schoolPublicId={school.publicId}
            fields={fields}
            fieldDefinitions={studentSettingFields}
            branches={branches}
            years={years}
            classes={classes}
            sections={sections}
            categories={categories}
          />
        ) : (
          <section className="border border-slate-300 bg-white p-6 text-sm text-slate-700">
            Online registration is not available yet. Please contact the school for help.
          </section>
        )}
      </div>
    </main>
    </PublicPlatformShell>
  );
}
