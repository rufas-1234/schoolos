export const electiveSelectionStatuses = ["pending", "selected", "not_selected"] as const;

export type ElectiveSelectionStatus = typeof electiveSelectionStatuses[number];

export function isElectiveSelectionStatus(value: string): value is ElectiveSelectionStatus {
  return value === "pending" || value === "selected" || value === "not_selected";
}

export function resolveElectiveRoster(
  roster: Array<{ enrollmentId: number; selectionStatus: string | null }>,
  isCompulsory: boolean,
): { pendingEnrollmentIds: number[]; participantEnrollmentIds: number[] } {
  for (const student of roster) {
    if (student.selectionStatus !== null && !isElectiveSelectionStatus(student.selectionStatus)) {
      throw new Error(`Unknown elective selection status: ${student.selectionStatus}`);
    }
  }
  return {
    pendingEnrollmentIds: isCompulsory
      ? []
      : roster.filter((student) => student.selectionStatus === "pending")
        .map((student) => student.enrollmentId),
    participantEnrollmentIds: roster.filter((student) =>
      isCompulsory || student.selectionStatus === "selected",
    ).map((student) => student.enrollmentId),
  };
}

export function getElectiveAttendanceDefault(
  selectionStatus: ElectiveSelectionStatus | null,
  savedAttendanceStatus: string | null,
): string | null {
  if (selectionStatus === null || selectionStatus === "not_selected") return "not_applicable";
  if (selectionStatus !== "selected" || savedAttendanceStatus === "not_applicable") return null;
  return savedAttendanceStatus;
}
