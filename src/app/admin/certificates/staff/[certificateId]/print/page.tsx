import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import { staffCertificates, staffMembers, user } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function PrintStaffCertificatePage({ params }: { params: Promise<{ certificateId: string }> }) {
  const context = await requireSchoolPermission(["staff.manage", "school.settings.manage"]);
  const { certificateId } = await params;
  const [certificate] = await db.select({ publicId: staffCertificates.publicId, number: staffCertificates.certificateNumber, category: staffCertificates.category, title: staffCertificates.title, achievement: staffCertificates.achievement, issuedAt: staffCertificates.issuedAt, staffName: staffMembers.firstName, lastName: staffMembers.lastName, employeeCode: staffMembers.employeeCode, issuer: user.name }).from(staffCertificates).innerJoin(staffMembers, and(eq(staffMembers.id, staffCertificates.staffId), eq(staffMembers.schoolId, context.schoolId))).innerJoin(user, eq(user.id, staffCertificates.issuedBy)).where(and(eq(staffCertificates.publicId, certificateId), eq(staffCertificates.schoolId, context.schoolId))).limit(1);
  if (!certificate) notFound();
  return <main className="space-y-5">
    <header className="flex items-center justify-between print:hidden"><div><p className="text-sm text-slate-500">Staff certificate</p><h1 className="text-xl font-bold text-slate-900">{certificate.number}</h1></div><PrintButton label="Print certificate" targetId="staff-certificate-sheet" /></header>
    <article id="staff-certificate-sheet" className="mx-auto flex min-h-[190mm] max-w-4xl flex-col items-center justify-center border-[8px] border-double border-violet-300 bg-white px-10 py-12 text-center text-slate-900 print:min-h-[190mm] print:border-violet-300">
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-violet-800">{certificate.category}</p>
      <h2 className="mt-8 font-serif text-4xl font-bold">Certificate of {certificate.title}</h2>
      <p className="mt-10 text-lg">This certificate is proudly presented to</p>
      <p className="mt-3 border-b border-slate-300 px-8 pb-2 font-serif text-4xl font-bold">{certificate.staffName} {certificate.lastName}</p>
      {certificate.employeeCode && <p className="mt-2 text-sm text-slate-500">Staff no. {certificate.employeeCode}</p>}
      <p className="mt-8 max-w-2xl text-lg leading-8">{certificate.achievement}</p>
      <div className="mt-14 grid w-full grid-cols-2 gap-12 text-left text-sm"><div className="border-t border-slate-400 pt-2">Issued by · {certificate.issuer}</div><div className="border-t border-slate-400 pt-2 text-right">Date · {certificate.issuedAt}</div></div>
      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">Certificate no. {certificate.number}</p>
    </article>
  </main>;
}
