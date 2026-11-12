export const staffStatuses = ["active", "inactive"] as const;
export type StaffStatus = (typeof staffStatuses)[number];

export const employmentTypes = ["full_time", "part_time", "contract", "temporary"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export function canTransitionStaffStatus(current: string, next: StaffStatus): boolean {
  return staffStatuses.includes(current as StaffStatus) && current !== next;
}
