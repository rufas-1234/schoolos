import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Award, CalendarDays, Hash, PenLine } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import { academicYears, studentCertificates, students, user } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";

export default async function PrintCertificatePage({
  params,
}: {
  params: Promise<{ certificatePublicId: string }>;
}) {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const { certificatePublicId } = await params;
  const [certificate] = await db
    .select({
      certificateNumber: studentCertificates.certificateNumber,
      category: studentCertificates.category,
      title: studentCertificates.title,
      achievement: studentCertificates.achievement,
      issuedAt: studentCertificates.issuedAt,
      academicYearName: academicYears.name,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      issuerName: user.name,
    })
    .from(studentCertificates)
    .innerJoin(students, and(
      eq(students.id, studentCertificates.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(academicYears.id, studentCertificates.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .innerJoin(user, eq(user.id, studentCertificates.issuedBy))
    .where(and(
      eq(studentCertificates.publicId, certificatePublicId),
      eq(studentCertificates.schoolId, context.schoolId),
    ))
    .limit(1);

  if (!certificate) notFound();

  const logo = schoolLogoSource(context.schoolLogoUrl);
  const issueDate = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${certificate.issuedAt}T00:00:00.000Z`));
  const studentName = `${certificate.firstName} ${certificate.lastName}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="text-sm text-slate-500">Certificate · {certificate.academicYearName}</p>
          <h1 className="text-xl font-bold text-slate-900">Print student certificate</h1>
        </div>
        <PrintButton
          label="Print certificate"
          targetId="certificate-sheet"
          pageOrientation="landscape"
          pageMargin="5mm"
        />
      </div>

      <article
        id="certificate-sheet"
        className="exam-report-document mx-auto aspect-[1.414/1] w-full max-w-[1100px] border-[10px] border-double border-violet-900 bg-white p-2 shadow-xl sm:p-4 print:aspect-auto print:h-[190mm] print:w-[277mm] print:max-w-none print:border-[10px] print:p-2 print:shadow-none"
        data-print-qr-document
      >
        <div className="relative flex h-full flex-col items-center justify-between overflow-hidden border border-orange-400 bg-gradient-to-br from-white via-violet-50 to-orange-50 px-5 py-5 text-center sm:px-10 sm:py-7 print:px-10 print:py-5">
          <span aria-hidden="true" className="absolute -left-12 -top-16 h-36 w-36 rounded-full border-[18px] border-violet-200/70" />
          <span aria-hidden="true" className="absolute -bottom-16 -right-10 h-40 w-40 rounded-full border-[18px] border-orange-200/70" />

          <header className="relative flex w-full flex-col items-center gap-2">
            {logo ? (
              <Image
                src={logo}
                alt={`${context.schoolName} logo`}
                width={72}
                height={72}
                unoptimized
                className="h-14 w-14 rounded-full border border-orange-200 bg-white object-contain p-1 print:h-16 print:w-16"
              />
            ) : (
              <div aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full border border-orange-200 bg-white text-lg font-bold text-violet-800 print:h-16 print:w-16">
                {context.schoolName.trim().charAt(0).toUpperCase() || "S"}
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-900 sm:text-sm">
              {context.schoolName}
            </p>
            {context.schoolAddress && <p className="text-[10px] text-slate-600 sm:text-xs">{context.schoolAddress}</p>}
          </header>

          <div className="relative my-3 max-w-3xl space-y-2 print:my-1">
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-800 sm:text-xs">
              <Award size={14} aria-hidden="true" />
              {certificate.category}
            </div>
            <h2 className="font-serif text-2xl font-bold leading-tight text-violet-950 sm:text-4xl print:text-4xl">
              {certificate.title}
            </h2>
            <p className="text-xs font-medium text-slate-600 sm:text-sm">This certificate is proudly presented to</p>
            <p className="break-words font-serif text-3xl font-semibold leading-tight text-orange-700 sm:text-5xl print:text-5xl">
              {studentName}
            </p>
            {certificate.admissionNumber && (
              <p className="text-[10px] text-slate-500 sm:text-xs">Admission No. {certificate.admissionNumber}</p>
            )}
            <p className="mx-auto max-w-2xl text-xs leading-5 text-slate-700 sm:text-sm sm:leading-6">
              {certificate.achievement}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-800 sm:text-xs">
              Academic year · {certificate.academicYearName}
            </p>
          </div>

          <footer className="relative flex w-full flex-col items-end justify-between gap-3 border-t border-orange-200 pt-2 text-left sm:flex-row sm:items-end sm:pt-3">
            <div className="space-y-1 text-[10px] text-slate-600 sm:text-xs">
              <p className="inline-flex items-center gap-1.5"><Hash size={12} aria-hidden="true" />{certificate.certificateNumber}</p>
              <p className="inline-flex items-center gap-1.5"><CalendarDays size={12} aria-hidden="true" />Issued {issueDate}</p>
            </div>
            <div className="min-w-36 border-t border-violet-400 pt-1 text-right text-[10px] text-slate-700 sm:min-w-48 sm:text-xs">
              <p className="inline-flex items-center gap-1"><PenLine size={12} aria-hidden="true" />{certificate.issuerName}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-500 sm:text-[10px]">Authorized by the school</p>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
