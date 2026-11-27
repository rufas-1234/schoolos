"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, staffCertificates, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";

export type StaffCertificateState = { error?: string; success?: boolean; publicId?: string };
const certificateSchema = z.object({
  staffId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
  category: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(160),
  achievement: z.string().trim().min(2).max(2000),
  issuedAt: z.string().refine(isCalendarDate),
});

export async function issueStaffCertificate(_previous: StaffCertificateState, formData: FormData): Promise<StaffCertificateState> {
  const context = await requireSchoolPermission(["staff.manage", "school.settings.manage"]);
  const parsed = certificateSchema.safeParse(Object.fromEntries(["staffId", "category", "title", "achievement", "issuedAt"].map((key) => [key, formData.get(key)])));
  if (!parsed.success) return { error: "Choose staff, complete the certificate details, and enter a valid issue date." };
  const [staff] = await db.select({ id: staffMembers.id }).from(staffMembers).where(and(
    eq(staffMembers.id, parsed.data.staffId),
    eq(staffMembers.schoolId, context.schoolId),
    eq(staffMembers.status, "active"),
  )).limit(1);
  if (!staff) return { error: "Choose an active staff member in this school." };
  const publicId = randomUUID();
  const certificateNumber = `STAFF-${parsed.data.issuedAt.slice(0, 4)}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await db.transaction(async (tx) => {
    await tx.insert(staffCertificates).values({
      publicId,
      schoolId: context.schoolId,
      staffId: staff.id,
      certificateNumber,
      category: parsed.data.category,
      title: parsed.data.title,
      achievement: parsed.data.achievement,
      issuedAt: parsed.data.issuedAt,
      issuedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "staff.certificate.issued",
      resourceType: "staff_certificate",
      resourcePublicId: publicId,
      changedFields: ["staffId", "certificateNumber", "category", "title", "achievement", "issuedAt"],
    });
  });
  revalidatePath("/admin/certificates");
  revalidatePath("/admin/certificates/staff");
  return { success: true, publicId };
}
