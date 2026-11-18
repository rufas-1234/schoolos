import { z } from "zod";

export const schoolAccountInputSchema = z.object({
  personType: z.enum(["staff", "student", "parent"]),
  recordId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()),
  parentLogin: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(["email", "phone"]).optional(),
  ),
  password: z.string().min(12).max(128),
  passwordConfirmation: z.string().max(128),
  roleIds: z.array(z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
}).refine((data) => data.password === data.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Passwords do not match.",
});

export function getStudentRoleId(roles: { id: number; name: string }[]): number | null {
  return roles.find((role) => role.name.trim().toLowerCase() === "student")?.id ?? null;
}
