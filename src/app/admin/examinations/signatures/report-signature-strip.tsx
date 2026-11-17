import Image from "next/image";

export const reportSignatureRoles = [
  ["headteacher", "Headteacher"],
  ["class-teacher", "Class teacher"],
  ["subject-teacher", "Subject teacher"],
] as const;

export function ReportSignatureStrip({ roles }: { roles: string[] }) {
  return <footer className="grid grid-cols-3 gap-3 pt-4 text-center text-xs print:break-inside-avoid">
    {reportSignatureRoles.map(([role, label]) => (
      <div key={role} className="flex min-h-16 flex-col justify-end pt-1">
        {roles.includes(role) && <Image src={`/api/admin/examinations/signatures/${role}`} unoptimized width={180} height={56}
          alt={`${label} signature`} className="mx-auto mb-1 max-h-10 w-auto max-w-full object-contain" />}
        <div className="border-t border-slate-500 pt-1">{label} signature</div>
      </div>
    ))}
  </footer>;
}
