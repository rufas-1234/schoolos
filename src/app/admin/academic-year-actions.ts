"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { academicYears } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { selectedAcademicYearCookieName } from "@/lib/academic-year-policy";

const academicYearIdSchema = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().positive().safe());

export async function setSelectedAcademicYear(formData: FormData) {
  const context = await requireSchoolPermission([
    "academics.manage",
    "school.settings.manage",
    "students.view",
    "students.update",
    "examinations.create",
    "results.enter",
    "results.publish",
    "fees.manage",
    "payments.record",
    "accounts.manage",
  ]);
  const result = academicYearIdSchema.safeParse(formData.get("academicYearId"));
  if (!result.success) throw new Error("Choose a valid academic year.");

  const [year] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(and(
      eq(academicYears.id, result.data),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!year) throw new Error("The selected academic year does not belong to this school.");

  const cookieStore = await cookies();
  cookieStore.set(selectedAcademicYearCookieName, String(year.id), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
