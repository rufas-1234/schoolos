import { z } from "zod";
import { normalizeAdmissionIdentifier } from "./login-identifier-policy";
import { getPasswordStrengthError, minimumPasswordLength } from "./password-policy";

export const schoolAccountInputSchema = z.object({
  personType: z.enum(["staff", "student", "parent"]),
  recordId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
  parentLogin: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(["email", "phone"]).optional(),
  ),
  password: z.string().max(128).optional(),
  passwordConfirmation: z.string().max(128).optional(),
  roleIds: z.array(z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
}).refine((data) => {
  if (data.personType !== "parent") {
    return !data.password && !data.passwordConfirmation;
  }
  return Boolean(
    data.password &&
    data.password.length >= minimumPasswordLength &&
    getPasswordStrengthError(data.password) === null &&
    data.password === data.passwordConfirmation,
  );
}, {
  path: ["password"],
  message: "Parent accounts require matching passwords with uppercase, lowercase, a number, and a symbol.",
});

export function getStudentRoleId(roles: { id: number; name: string }[]): number | null {
  return roles.find((role) => role.name.trim().toLowerCase() === "student")?.id ?? null;
}

export function getStudentsEligibleForAccount<T extends { admissionNumber: string | null }>(
  students: T[],
  assignedIdentifiers: string[],
): T[] {
  const assigned = new Set(assignedIdentifiers.map(normalizeAdmissionIdentifier).filter(Boolean));
  return students.filter((student) => {
    const identifier = normalizeAdmissionIdentifier(student.admissionNumber ?? "");
    return identifier !== "" && !assigned.has(identifier);
  });
}
