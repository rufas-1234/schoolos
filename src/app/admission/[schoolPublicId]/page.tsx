import Image from "next/image";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  }).from(schools).where(eq(schools.publicId, schoolPublicId)).limit(1);
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-4">
            {schoolLogo && <Image src={schoolLogo} unoptimized width={72} height={72} alt={`${school.name} logo`} className="h-16 w-16 shrink-0 object-contain" />}
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-wide text-rose-900">{school.name}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Online student registration</h1>
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
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
            Online registration is not available yet. Please contact the school for help.
          </section>
        )}
      </div>
    </main>
  );
}
