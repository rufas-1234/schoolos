export const schoolWorkspaceStatuses = {
  pending: "pending",
  active: "active",
  rejected: "rejected",
} as const;

export type SchoolWorkspaceStatus = typeof schoolWorkspaceStatuses[keyof typeof schoolWorkspaceStatuses];

export function isSchoolAvailable(status: string, archivedAt: Date | null) {
  return status === schoolWorkspaceStatuses.active && archivedAt === null;
}

export function canApproveSchool(status: string) {
  return status === schoolWorkspaceStatuses.pending || status === schoolWorkspaceStatuses.rejected;
}

export function canRejectSchool(status: string) {
  return status === schoolWorkspaceStatuses.pending;
}

export function canReopenSchoolReview(status: string) {
  return status === schoolWorkspaceStatuses.active;
}

export function getSchoolDisplayStatus(status: string, archivedAt: Date | null) {
  return archivedAt ? "archived" : status;
}
