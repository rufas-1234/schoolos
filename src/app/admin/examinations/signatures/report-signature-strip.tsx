import Image from "next/image";
import type { ExamTeacherSignature } from "@/lib/exam-report-signatures";

export function ReportSignatureStrip({
  signatures,
  teacherSignatures = [],
}: {
  signatures: { role: string; updatedAt: Date }[];
  teacherSignatures?: ExamTeacherSignature[];
}) {
  const headteacher = signatures.find((signature) => signature.role === "headteacher");
  const onlyDeputyHeadteachers = teacherSignatures.every((signature) => signature.role === "Deputy headteacher");

  return <footer className={`report-signature-strip grid grid-cols-2 gap-3 pt-4 text-center text-xs print:break-inside-avoid ${onlyDeputyHeadteachers ? "report-signature-strip-compact sm:grid-cols-2" : "sm:grid-cols-3"}`}>
    <div className="flex min-h-16 flex-col justify-end pt-1">
      {headteacher && <Image src={`/api/admin/examinations/signatures/headteacher?v=${headteacher.updatedAt.getTime()}`} unoptimized width={180} height={56}
        alt="Headteacher signature" className="mx-auto mb-1 max-h-10 w-auto max-w-full object-contain" />}
      <div className="border-t border-slate-500 pt-1">Headteacher</div>
    </div>
    {teacherSignatures.map((signature) => (
      <div key={`${signature.role}:${signature.teacherId}`} className="flex min-h-16 flex-col justify-end pt-1">
        {signature.signatureId !== null && <Image
          src={`/api/admin/examinations/teacher-signatures/${signature.teacherId}?signatureId=${signature.signatureId}`}
          unoptimized width={180} height={56}
          alt={`${signature.role} ${signature.teacherName} signature`}
          className="mx-auto mb-1 max-h-10 w-auto max-w-full object-contain"
        />}
        <div className="border-t border-slate-500 pt-1">
          {signature.role}: {signature.teacherName}
          {signature.jobTitle ? <span className="block text-[10px] text-slate-500">{signature.jobTitle}</span> : null}
        </div>
      </div>
    ))}
  </footer>;
}
