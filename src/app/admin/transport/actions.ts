"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { academicTerms, schoolBranches, staffMembers, studentEnrollments, students, transportAssignments, transportDrivers, transportFeeMasters, transportPickupPoints, transportRoutes } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export type TransportActionState = { error?: string; success?: string };

const id = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const name = z.string().trim().min(2).max(160);
const read = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";

export async function assignTransportDriver(_previous: TransportActionState, formData: FormData): Promise<TransportActionState> {
  const context = await requireSchoolPermission(["transport.manage", "school.settings.manage"]);
  const parsed = z.object({ routeId: id, driverId: z.union([z.literal(""), id]) }).safeParse({
    routeId: read(formData, "routeId"),
    driverId: read(formData, "driverId"),
  });
  if (!parsed.success) return { error: "Choose a route and a driver." };

  const [route] = await db.select({ id: transportRoutes.id }).from(transportRoutes)
    .where(and(eq(transportRoutes.id, parsed.data.routeId), eq(transportRoutes.schoolId, context.schoolId))).limit(1);
  if (!route) return { error: "Choose a route belonging to this school." };

  if (parsed.data.driverId) {
    const [driver] = await db.select({ id: transportDrivers.id }).from(transportDrivers)
      .where(and(eq(transportDrivers.id, parsed.data.driverId), eq(transportDrivers.schoolId, context.schoolId), eq(transportDrivers.status, "active"))).limit(1);
    if (!driver) return { error: "Choose an active driver belonging to this school." };
  }

  await db.update(transportRoutes).set({ driverId: parsed.data.driverId || null })
    .where(and(eq(transportRoutes.id, route.id), eq(transportRoutes.schoolId, context.schoolId)));
  revalidatePath("/admin/transport");
  revalidatePath("/admin/dashboard");
  return { success: parsed.data.driverId ? "Driver assigned to route." : "Driver removed from route." };
}

export async function createTransportRecord(_previous: TransportActionState, formData: FormData): Promise<TransportActionState> {
  const context = await requireSchoolPermission(["transport.manage", "school.settings.manage"]);
  const kind = read(formData, "kind");
  const publicId = randomUUID();
  try {
    if (kind === "route") {
      const parsed = z.object({ name, code: z.string().trim().min(1).max(40), branchId: z.union([z.literal(""), id]), driverId: z.union([z.literal(""), id]), description: z.string().trim().max(500) }).safeParse(Object.fromEntries(["name", "code", "branchId", "driverId", "description"].map((key) => [key, read(formData, key)])));
      if (!parsed.success) return { error: "Enter a route name and code, and choose valid branch and driver details." };
      if (parsed.data.branchId) {
        const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(eq(schoolBranches.id, parsed.data.branchId), eq(schoolBranches.schoolId, context.schoolId))).limit(1);
        if (!branch) return { error: "Choose a branch belonging to this school." };
      }
      if (parsed.data.driverId) {
        const [driver] = await db.select({ id: transportDrivers.id }).from(transportDrivers).where(and(eq(transportDrivers.id, parsed.data.driverId), eq(transportDrivers.schoolId, context.schoolId))).limit(1);
        if (!driver) return { error: "Choose a driver belonging to this school." };
      }
      await db.insert(transportRoutes).values({ publicId, schoolId: context.schoolId, branchId: parsed.data.branchId || null, driverId: parsed.data.driverId || null, name: parsed.data.name, code: parsed.data.code, description: parsed.data.description || null });
    } else if (kind === "driver") {
      const parsed = z.object({ name, phone: z.string().trim().min(5).max(40), licenseNumber: z.string().trim().min(2).max(80), staffId: z.union([z.literal(""), id]) }).safeParse(Object.fromEntries(["name", "phone", "licenseNumber", "staffId"].map((key) => [key, read(formData, key)])));
      if (!parsed.success) return { error: "Enter the driver's name, phone number, and license number." };
      if (parsed.data.staffId) {
        const [staff] = await db.select({ id: staffMembers.id }).from(staffMembers).where(and(eq(staffMembers.id, parsed.data.staffId), eq(staffMembers.schoolId, context.schoolId))).limit(1);
        if (!staff) return { error: "Choose a staff member belonging to this school." };
      }
      await db.insert(transportDrivers).values({ publicId, schoolId: context.schoolId, staffId: parsed.data.staffId || null, name: parsed.data.name, phone: parsed.data.phone, licenseNumber: parsed.data.licenseNumber });
    } else if (kind === "pickup-point") {
      const parsed = z.object({ routeId: id, name, sequence: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()), pickupTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]), dropoffTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]) }).safeParse(Object.fromEntries(["routeId", "name", "sequence", "pickupTime", "dropoffTime"].map((key) => [key, read(formData, key)])));
      if (!parsed.success) return { error: "Choose a route and enter a pickup point name and valid times." };
      const [route] = await db.select({ id: transportRoutes.id }).from(transportRoutes).where(and(eq(transportRoutes.id, parsed.data.routeId), eq(transportRoutes.schoolId, context.schoolId))).limit(1);
      if (!route) return { error: "Choose a route belonging to this school." };
      await db.insert(transportPickupPoints).values({ publicId, schoolId: context.schoolId, routeId: route.id, name: parsed.data.name, sequence: parsed.data.sequence, pickupTime: parsed.data.pickupTime || null, dropoffTime: parsed.data.dropoffTime || null });
    } else if (kind === "fee-master") {
      const parsed = z.object({ routeId: id, academicTermId: id, amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/), currency: z.string().trim().regex(/^[A-Za-z]{3}$/) }).safeParse(Object.fromEntries(["routeId", "academicTermId", "amount", "currency"].map((key) => [key, read(formData, key)])));
      if (!parsed.success || Number(parsed.data?.amount ?? 0) <= 0) return { error: "Choose a route and term, then enter a positive term fee and three-letter currency." };
      const [route, term] = await Promise.all([
        db.select({ id: transportRoutes.id }).from(transportRoutes).where(and(eq(transportRoutes.id, parsed.data.routeId), eq(transportRoutes.schoolId, context.schoolId))).limit(1),
        db.select({ id: academicTerms.id, yearId: academicTerms.academicYearId }).from(academicTerms).where(and(eq(academicTerms.id, parsed.data.academicTermId), eq(academicTerms.schoolId, context.schoolId))).limit(1),
      ]);
      if (!route.length || !term.length) return { error: "Choose a route and term belonging to this school." };
      await db.insert(transportFeeMasters).values({ publicId, schoolId: context.schoolId, routeId: route[0].id, academicYearId: term[0].yearId, academicTermId: term[0].id, amount: parsed.data.amount, currency: parsed.data.currency.toUpperCase() });
    } else if (kind === "assignment") {
      const parsed = z.object({ enrollmentId: id, feeMasterId: id, pickupPointId: id }).safeParse(Object.fromEntries(["enrollmentId", "feeMasterId", "pickupPointId"].map((key) => [key, read(formData, key)])));
      if (!parsed.success) return { error: "Choose an enrolled student, a term fee, and a pickup point." };
      const [enrollment, fee, point] = await Promise.all([
        db.select({ id: studentEnrollments.id, studentId: studentEnrollments.studentId, yearId: studentEnrollments.academicYearId }).from(studentEnrollments).innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId))).where(and(eq(studentEnrollments.id, parsed.data.enrollmentId), eq(studentEnrollments.schoolId, context.schoolId), eq(studentEnrollments.status, "enrolled"))).limit(1),
        db.select({ id: transportFeeMasters.id, routeId: transportFeeMasters.routeId, yearId: transportFeeMasters.academicYearId, amount: transportFeeMasters.amount, currency: transportFeeMasters.currency }).from(transportFeeMasters).where(and(eq(transportFeeMasters.id, parsed.data.feeMasterId), eq(transportFeeMasters.schoolId, context.schoolId))).limit(1),
        db.select({ id: transportPickupPoints.id, routeId: transportPickupPoints.routeId }).from(transportPickupPoints).where(and(eq(transportPickupPoints.id, parsed.data.pickupPointId), eq(transportPickupPoints.schoolId, context.schoolId))).limit(1),
      ]);
      if (!enrollment.length || !fee.length || !point.length || enrollment[0].yearId !== fee[0].yearId || fee[0].routeId !== point[0].routeId) return { error: "Student, term fee, and pickup point must belong to the same school year and route." };
      await db.insert(transportAssignments).values({ publicId, schoolId: context.schoolId, studentId: enrollment[0].studentId, enrollmentId: enrollment[0].id, feeMasterId: fee[0].id, routeId: fee[0].routeId, pickupPointId: point[0].id, amount: fee[0].amount, currency: fee[0].currency, assignedBy: context.user.id });
    } else {
      return { error: "Choose a valid transport record type." };
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "ER_DUP_ENTRY" || error.code === "23505")) {
      return { error: "A matching transport record already exists. Check the route code, fee term, or student assignment." };
    }
    throw error;
  }
  revalidatePath("/admin/transport");
  revalidatePath("/admin/dashboard");
  return { success: "Saved successfully." };
}
