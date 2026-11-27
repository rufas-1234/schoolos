import { and, count, countDistinct, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schoolSubscriptions, studentEnrollments, students, subscriptionPlans } from "@/db/schema";

export async function getStudentCapacityError(schoolId: number, academicYearId: number, studentPublicId?: string) {
  const [plan] = await db.select({ limit: subscriptionPlans.studentLimit }).from(schoolSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId))
    .where(eq(schoolSubscriptions.schoolId, schoolId)).limit(1);
  if (!plan?.limit) return null;
  if (studentPublicId) {
    const [[student], [existingEnrollment]] = await Promise.all([
      db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, schoolId), eq(students.publicId, studentPublicId))).limit(1),
      db.select({ id: studentEnrollments.id }).from(studentEnrollments).innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.academicYearId, academicYearId), inArray(studentEnrollments.status, ["enrolled", "pending"]), eq(students.publicId, studentPublicId))).limit(1),
    ]);
    if (!student) return "Choose a student belonging to this school.";
    if (existingEnrollment) return null;
  }
  const [result] = await db.select({ total: countDistinct(studentEnrollments.studentId) }).from(studentEnrollments)
    .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.academicYearId, academicYearId), inArray(studentEnrollments.status, ["enrolled", "pending"])));
  if (Number(result.total) >= plan.limit) return `This plan allows ${plan.limit} active students for an academic year. Contact the SchoolOS platform administrator to increase the limit.`;
  return null;
}

export async function getBranchCapacityError(schoolId: number) {
  const [plan] = await db.select({ limit: subscriptionPlans.branchLimit }).from(schoolSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId))
    .where(eq(schoolSubscriptions.schoolId, schoolId)).limit(1);
  if (!plan?.limit) return null;
  const [result] = await db.select({ total: count() }).from(schoolBranches)
    .where(and(eq(schoolBranches.schoolId, schoolId), eq(schoolBranches.status, "active")));
  if (Number(result.total) >= plan.limit) return `This plan allows ${plan.limit} active branches. Contact the SchoolOS platform administrator to increase the limit.`;
  return null;
}
