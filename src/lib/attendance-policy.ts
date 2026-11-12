export const attendanceStatuses = ["present", "absent", "late", "excused"] as const;

export type AttendanceStatus = (typeof attendanceStatuses)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return attendanceStatuses.some((status) => status === value);
}
