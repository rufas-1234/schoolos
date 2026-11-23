import { getPasswordStrengthError } from "./password-policy";

export const staffStatuses = ["active", "inactive"] as const;
export type StaffStatus = (typeof staffStatuses)[number];

export const employmentTypes = ["full_time", "part_time", "contract", "temporary"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const staffRoles = ["accountant", "admin", "driver", "librarian", "receptionist", "teacher"] as const;
export const staffRolePageSize = 8;
export const staffGenders = ["female", "male", "other"] as const;
export const staffMaritalStatuses = ["married", "unmarried"] as const;
export const staffContractTypes = ["permanent", "contract"] as const;
export const staffLoginPasswordMinLength = 6;

export function getStaffLoginPasswordError(password: string, confirmation: string) {
  if (!password && !confirmation) return null;
  const strengthError = getPasswordStrengthError(password);
  if (strengthError) return strengthError;
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

export function canTransitionStaffStatus(current: string, next: StaffStatus): boolean {
  return staffStatuses.includes(current as StaffStatus) && current !== next;
}

export function getStaffRolePagination(totalRoles: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(Math.max(0, totalRoles) / staffRolePageSize));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, pageCount)
    : 1;
  return { page, pageCount };
}
