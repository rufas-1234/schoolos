"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const studentSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  status: z.enum(["active", "admitted", "pending", "inactive"]).default("active"),
});

export type StudentActionState = {
  error?: string;
  success?: boolean;
};

export async function createStudent(
  _previousState: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const context = await requireSchoolPermission("students.create");

  const result = studentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    status: formData.get("status") ?? "active",
  });

  if (!result.success) {
    return { error: "Please review the student details and try again." };
  }

  const student = result.data;

  await db.insert(students).values({
    publicId: randomUUID(),
    schoolId: context.schoolId,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email || null,
    phone: student.phone || null,
    status: student.status,
  });

  revalidatePath("/admin/students");
  revalidatePath("/admin/dashboard");
  return { success: true };
}
