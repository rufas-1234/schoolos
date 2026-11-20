import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { schoolCurrencies, schools } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { SchoolCurrencySettings, SchoolSettingsForm } from "./school-settings-form";
import { SchoolLogoUpload } from "./school-logo-upload";

export default async function SchoolSettingsPage() {
  const context = await requireSchoolPermission("school.settings.manage");
  const [school] = await db.select().from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  if (!school) notFound();
  const currencies = await db.select({
    code: schoolCurrencies.code,
    name: schoolCurrencies.name,
    symbol: schoolCurrencies.symbol,
    isDefault: schoolCurrencies.isDefault,
  }).from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, context.schoolId));

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">School profile</h1>
        <p className="mt-2 text-sm text-slate-500">
          Keep your school&apos;s core information and regional settings up to date.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <SchoolLogoUpload logoUrl={school.logoUrl} />
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <SchoolSettingsForm school={school} currencies={currencies} />
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <SchoolCurrencySettings currencies={currencies} />
      </section>
    </div>
  );
}
