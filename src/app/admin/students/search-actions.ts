"use server";

import { and, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const searchQuerySchema = z.string().trim().min(1).max(120);

export type StudentSearchResult = {
  publicId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
};

export async function searchStudents(query: string): Promise<StudentSearchResult[]> {
  const context = await requireSchoolPermission("students.view");
  const result = searchQuerySchema.safeParse(query);
  if (!result.success) return [];

  const normalizedQuery = result.data;
  const queryTokens = normalizedQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const numericId = /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
  const tokenMatches = queryTokens.map((token) => {
    const pattern = `%${token.replace(/[\\%_]/g, "\\$&")}%`;
    return or(
      like(sql`lower(${students.publicId})`, pattern),
      like(sql`lower(${students.admissionNumber})`, pattern),
      like(sql`lower(${students.firstName})`, pattern),
      like(sql`lower(${students.lastName})`, pattern),
      like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, pattern),
    );
  });
  const identityMatches = [and(...tokenMatches)];
  if (numericId !== null && Number.isSafeInteger(numericId) && numericId > 0) {
    identityMatches.push(eq(students.id, numericId));
  }

  return db
    .select({
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
    })
    .from(students)
    .where(and(eq(students.schoolId, context.schoolId), or(...identityMatches)))
    .orderBy(students.lastName, students.firstName)
    .limit(8);
}
