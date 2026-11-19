import { z } from "zod";
import { getPasswordStrengthError } from "./password-policy";

const emptyToUndefined = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional());

export const schoolSignupInputSchema = z.object({
  schoolName: z.string().trim().min(2).max(255),
  schoolEmail: emptyToUndefined.pipe(z.string().email().max(320).optional()),
  schoolPhone: z.string().trim().max(40),
  schoolAddress: z.string().trim().max(1000),
  adminName: z.string().trim().min(2).max(255),
  adminEmail: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
  passwordConfirmation: z.string().min(1).max(128),
}).refine((data) => data.password === data.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Passwords do not match.",
});

export function getNewSchoolAdminPasswordError(password: string) {
  if (password.length < 12) return "Use at least 12 characters for a new administrator account.";
  return getPasswordStrengthError(password);
}
