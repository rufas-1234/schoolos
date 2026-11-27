import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { staffCertificates, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { StaffCertificateForm } from "../staff-form";

export default async function StaffCertificatesPage() {
  const context = await requireSchoolPermission(["staff.manage", "school.settings.manage"]);
  const [staff, certificates] = await Promise.all([
    db.select({ id: staffMembers.id, firstName: staffMembers.firstName, lastName: staffMembers.lastName, employeeCode: staffMembers.employeeCode }).from(staffMembers).where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.status, "active"))).orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({ id: staffCertificates.id, publicId: staffCertificates.publicId, certificateNumber: staffCertificates.certificateNumber, category: staffCertificates.category, title: staffCertificates.title, issuedAt: staffCertificates.issuedAt, firstName: staffMembers.firstName, lastName: staffMembers.lastName, employeeCode: staffMembers.employeeCode }).from(staffCertificates).innerJoin(staffMembers, and(eq(staffMembers.id, staffCertificates.staffId), eq(staffMembers.schoolId, context.schoolId))).where(eq(staffCertificates.schoolId, context.schoolId)).orderBy(desc(staffCertificates.issuedAt), desc(staffCertificates.id)),
  ]);
  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-violet-700">Certificates</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Staff certificates</h1><p className="mt-2 text-sm text-slate-600">Issue, review, and print service, training, and other staff certificates.</p></div><Link href="/admin/certificates" className="text-sm font-semibold text-violet-700 hover:underline">Certificates overview</Link></header>
    <AdminDataTable title="Staff certificate register" mobileCardView columns={[{key:"number",label:"Certificate no."},{key:"staff",label:"Staff member"},{key:"employeeCode",label:"Staff no."},{key:"category",label:"Category"},{key:"title",label:"Certificate title"},{key:"issuedAt",label:"Issue date"}]} rows={certificates.map((certificate)=>({id:certificate.id,values:{number:certificate.certificateNumber,staff:`${certificate.firstName} ${certificate.lastName}`,employeeCode:certificate.employeeCode??"—",category:certificate.category,title:certificate.title,issuedAt:certificate.issuedAt},searchableText:`${certificate.certificateNumber} ${certificate.firstName} ${certificate.lastName} ${certificate.employeeCode??""} ${certificate.category} ${certificate.title}`,actions:<Link href={`/admin/certificates/staff/${certificate.publicId}/print`} className="text-sm font-semibold text-violet-700 hover:underline">Print</Link>}))} toolbarActions={<AdminActionDialog label="Issue staff certificate" title="Issue staff certificate"><StaffCertificateForm staff={staff.map((member)=>({id:member.id,label:`${member.firstName} ${member.lastName}${member.employeeCode?` · ${member.employeeCode}`:""}`}))}/></AdminActionDialog>} emptyMessage="No staff certificates have been issued." />
  </main>;
}
