export const studentStatuses = ["pending", "admitted", "rejected", "active", "inactive", "disabled"] as const;

export type StudentStatus = (typeof studentStatuses)[number];

const transitions: Record<StudentStatus, readonly StudentStatus[]> = {
  pending: ["admitted", "rejected"],
  admitted: ["active", "pending"],
  rejected: ["pending"],
  active: ["inactive", "disabled"],
  inactive: ["active", "disabled"],
  disabled: ["active"],
};

function isStudentStatus(status: string): status is StudentStatus {
  return studentStatuses.some((candidate) => candidate === status);
}

export function getStudentStatusTransitions(status: string): StudentStatus[] {
  if (!isStudentStatus(status)) return [];

  return studentStatuses.filter((nextStatus) =>
    transitions[status].includes(nextStatus),
  );
}

export function canTransitionStudentStatus(current: string, next: string): next is StudentStatus {
  return isStudentStatus(next) && getStudentStatusTransitions(current).includes(next);
}
