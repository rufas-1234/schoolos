export const staffStatuses = ["active", "inactive"] as const;
export type StaffStatus = (typeof staffStatuses)[number];

export const employmentTypes = ["full_time", "part_time", "contract", "temporary"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const staffRoles = ["accountant", "admin", "driver", "librarian", "receptionist", "teacher"] as const;
export const staffGenders = ["female", "male", "other"] as const;
export const staffMaritalStatuses = ["married", "unmarried"] as const;
export const staffContractTypes = ["permanent", "contract"] as const;
export const staffLoginPasswordMinLength = 12;

export function getStaffLoginPasswordError(password: string, confirmation: string) {
  if (!password && !confirmation) return null;
  if (password.length < staffLoginPasswordMinLength) {
    return `Passwords must be at least ${staffLoginPasswordMinLength} characters.`;
  }
  if (password.length > 128) return "Passwords must be 128 characters or fewer.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

export function canTransitionStaffStatus(current: string, next: StaffStatus): boolean {
  return staffStatuses.includes(current as StaffStatus) && current !== next;
}
