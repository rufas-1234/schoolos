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

  return <footer className="report-signature-strip flex max-w-full flex-nowrap items-end gap-3 overflow-x-auto overscroll-x-contain pt-4 text-center text-xs print:break-inside-avoid print:overflow-visible">
    <div className="report-signature-strip__slot flex min-h-24 min-w-[9rem] flex-1 basis-0 flex-col justify-end pt-1 print:min-w-0">
      <div className="report-signature-strip__image mb-1 flex h-10 shrink-0 items-end justify-center">
        {headteacher && <Image src={`/api/admin/examinations/signatures/headteacher?v=${headteacher.updatedAt.getTime()}`} unoptimized width={180} height={56}
          alt="Headteacher signature" className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="report-signature-strip__label h-12 overflow-hidden border-t border-slate-500 pt-1 leading-4">Headteacher</div>
    </div>
    {teacherSignatures.map((signature) => (
      <div key={`${signature.role}:${signature.teacherId}`} className="report-signature-strip__slot flex min-h-24 min-w-[9rem] flex-1 basis-0 flex-col justify-end pt-1 print:min-w-0">
        <div className="report-signature-strip__image mb-1 flex h-10 shrink-0 items-end justify-center">
          {signature.signatureId !== null && <Image
            src={`/api/admin/examinations/teacher-signatures/${signature.teacherId}?signatureId=${signature.signatureId}`}
            unoptimized width={180} height={56}
            alt={`${signature.role} ${signature.teacherName} signature`}
            className="max-h-full max-w-full object-contain"
          />}
        </div>
        <div className="report-signature-strip__label h-12 overflow-hidden border-t border-slate-500 pt-1 leading-4">
          <span className="line-clamp-2">{signature.role}: {signature.teacherName}</span>
          {signature.jobTitle ? <span className="block truncate text-[10px] leading-3 text-slate-500">{signature.jobTitle}</span> : null}
        </div>
      </div>
    ))}
  </footer>;
}
