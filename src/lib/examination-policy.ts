export type GradeBand = {
  minPercent: number;
  maxPercent: number;
  grade: string;
  description: string;
  performanceRemark: string;
};

export type ExamAttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "excused"
  | "not_applicable"
  | "x"
  | "y";

export type ExamAssessmentResultState = "scored" | "not-applicable" | "no-result" | "missing";

export type ExamMarkEntry =
  | { kind: "score"; marks: number | null }
  | { kind: "status"; status: "x" | "y" };

export const examMarkEntryInputPattern = String.raw`\s*(?:[0-9]{1,6}(?:\.[0-9]{1,2})?|[xXyY])\s*`;

export function canEditExamAttendance(input: {
  examStatus: string;
  assessmentStatus: string;
  isSuperAdmin: boolean;
}): boolean {
  return input.examStatus === "open" &&
    (input.assessmentStatus === "draft" ||
      input.assessmentStatus === "approved" && input.isSuperAdmin);
}

export function parseExamMarkEntry(value: string): ExamMarkEntry | null {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "") return { kind: "score", marks: null };
  if (normalized === "x" || normalized === "y") return { kind: "status", status: normalized };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return null;
  const marks = Number(normalized);
  return Number.isFinite(marks) ? { kind: "score", marks } : null;
}

export function canViewExamSubject(
  grantedPermissions: readonly string[],
  isAssignedToSubject: boolean,
): boolean {
  return isAssignedToSubject ||
    grantedPermissions.includes("examinations.create") ||
    grantedPermissions.includes("results.publish");
}

export function canEnterExamMarks(
  grantedPermissions: readonly string[],
  isAssignedToSubject: boolean,
): boolean {
  return grantedPermissions.includes("results.enter") &&
    (isAssignedToSubject ||
      grantedPermissions.includes("examinations.create") ||
      grantedPermissions.includes("results.publish"));
}

export function canReviewExamSubject(
  grantedPermissions: readonly string[],
  isAssignedClassTeacher: boolean,
): boolean {
  return grantedPermissions.includes("results.publish") ||
    grantedPermissions.includes("results.enter") && isAssignedClassTeacher;
}

export function canPublishExamClass(grantedPermissions: readonly string[]): boolean {
  return grantedPermissions.includes("results.publish");
}

export function examAssessmentResultState(input: {
  attendanceStatus: string | null;
  isCompulsory: boolean;
  hasMark: boolean;
}): ExamAssessmentResultState {
  if (
    input.attendanceStatus !== null &&
    !["present", "absent", "late", "excused", "not_applicable", "x", "y"].includes(input.attendanceStatus)
  ) return "missing";
  if (input.attendanceStatus === "not_applicable" && !input.isCompulsory) return "not-applicable";
  if (input.attendanceStatus === "x" || input.attendanceStatus === "y") return "no-result";
  return input.hasMark ? "scored" : "missing";
}

export function hasCompleteExamResult(states: Iterable<ExamAssessmentResultState>): boolean {
  for (const state of states) {
    if (state !== "scored" && state !== "not-applicable") return false;
  }
  return true;
}

export type ExamComponent = { title: string; maxMarks: number };

export function missingExamRosterEnrollmentIds(
  eligibleEnrollmentIds: number[],
  existingEnrollmentIds: number[],
): number[] {
  const existing = new Set(existingEnrollmentIds);
  return eligibleEnrollmentIds.filter((enrollmentId) => !existing.has(enrollmentId));
}

export function missingExamMarkEnrollmentIds(
  rosterEnrollmentIds: number[],
  marks: Array<{ enrollmentId: number; marks: number | string | null }>,
  allowedUnmarkedEnrollmentIds: number[] = [],
): number[] {
  const marksByEnrollment = new Map(marks.map((mark) => [mark.enrollmentId, mark.marks]));
  const allowedUnmarked = new Set(allowedUnmarkedEnrollmentIds);
  return rosterEnrollmentIds.filter((enrollmentId) =>
    !allowedUnmarked.has(enrollmentId) &&
    (marksByEnrollment.get(enrollmentId) === null || !marksByEnrollment.has(enrollmentId)),
  );
}

export function canPreviewDraftTestReport(input: {
  requested: boolean;
  examName: string;
  examStatus: string;
  canManage: boolean;
}): boolean {
  return input.requested &&
    input.examName.startsWith("TEST DATA - ") &&
    input.examStatus === "open" &&
    input.canManage;
}

export function parseExamComponents(
  value: string,
  system: "single" | "multi",
): ExamComponent[] | null {
  const rows = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if ((system === "single" && rows.length !== 1) || (system === "multi" && rows.length < 2)) {
    return null;
  }
  const components: ExamComponent[] = [];
  for (const row of rows) {
    const [title, rawMaxMarks, ...extra] = row.split("|").map((part) => part.trim());
    const maxMarks = Number(rawMaxMarks);
    if (
      extra.length > 0 ||
      !title ||
      title.length > 120 ||
      !/^\d{1,6}(\.\d{1,2})?$/.test(rawMaxMarks ?? "") ||
      !Number.isFinite(maxMarks) ||
      maxMarks <= 0
    ) return null;
    components.push({ title, maxMarks });
  }
  if (new Set(components.map((component) => component.title.toLocaleLowerCase())).size !== components.length) {
    return null;
  }
  return components;
}

export function calculateComponentTotal(
  components: Array<{ marks: number | null; maxMarks: number }>,
): { marks: number; maxMarks: number } | null {
  if (
    components.length === 0 ||
    components.some((component) =>
      component.marks === null ||
      !Number.isFinite(component.marks) ||
      !Number.isFinite(component.maxMarks) ||
      component.marks < 0 ||
      component.maxMarks <= 0 ||
      component.marks > component.maxMarks,
    )
  ) return null;
  return {
    marks: Math.round(components.reduce((total, component) => total + component.marks!, 0) * 100) / 100,
    maxMarks: Math.round(components.reduce((total, component) => total + component.maxMarks, 0) * 100) / 100,
  };
}

export function completeSubmittedMarkIds(
  componentKeys: Iterable<string>,
  rosterMarkIds: number[],
  componentIds: number[],
): number[] | null {
  const rosterIds = new Set(rosterMarkIds);
  const validComponentIds = new Set(componentIds);
  const submittedIds = new Set<number>();
  const submittedKeys = new Set(componentKeys);

  for (const key of submittedKeys) {
    const match = /^(\d+):(\d+)$/.exec(key);
    if (!match) return null;
    const markId = Number(match[1]);
    const componentId = Number(match[2]);
    if (!rosterIds.has(markId) || !validComponentIds.has(componentId)) return null;
    submittedIds.add(markId);
  }

  for (const markId of submittedIds) {
    if (componentIds.some((componentId) => !submittedKeys.has(`${markId}:${componentId}`))) return null;
  }
  return [...submittedIds];
}

export function validateGradeBands(bands: GradeBand[]): string | null {
  if (bands.length === 0) return "Add at least one grade band.";
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0 || sorted[sorted.length - 1].maxPercent !== 100) {
    return "Grade bands must cover the full range from 0% to 100%.";
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index];
    if (
      !Number.isFinite(band.minPercent) ||
      !Number.isFinite(band.maxPercent) ||
      band.minPercent < 0 ||
      band.maxPercent > 100 ||
      band.minPercent >= band.maxPercent
    ) {
      return "Grade bands must use valid, increasing percentages between 0 and 100.";
    }
    if (index > 0 && sorted[index - 1].maxPercent !== band.minPercent) {
      return "Grade bands cannot overlap or leave gaps.";
    }
  }
  if (new Set(sorted.map((band) => band.grade.trim().toLocaleLowerCase())).size !== sorted.length) {
    return "Each grade letter must be unique.";
  }
  return null;
}

export function gradeForPercentage(percent: number, bands: GradeBand[]): GradeBand | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return bands.find((band) =>
    percent >= band.minPercent &&
    (percent < band.maxPercent || band.maxPercent === 100),
  ) ?? null;
}

export function calculateWeightedAverage(
  results: Array<{ marks: number; maxMarks: number; weight: number }>,
): { totalMarks: number; maxMarks: number; percentage: number } | null {
  if (
    results.length === 0 ||
    results.some((result) =>
      !Number.isFinite(result.marks) ||
      !Number.isFinite(result.maxMarks) ||
      !Number.isFinite(result.weight) ||
      result.marks < 0 ||
      result.maxMarks <= 0 ||
      result.marks > result.maxMarks ||
      result.weight <= 0,
    )
  ) {
    return null;
  }
  const weightTotal = results.reduce((sum, result) => sum + result.weight, 0);
  const percentage = results.reduce(
    (sum, result) => sum + (result.marks / result.maxMarks) * 100 * result.weight,
    0,
  ) / weightTotal;
  const maxMarks = results.reduce((sum, result) => sum + result.maxMarks, 0);
  const totalMarks = results.reduce((sum, result) => sum + result.marks, 0);
  return {
    totalMarks,
    maxMarks,
    percentage: Math.round(percentage * 100) / 100,
  };
}

export function calculateAnnualProgress(
  periodPercentages: Array<number | null>,
): { average: number | null; change: number | null } {
  const available = periodPercentages.filter((value): value is number => value !== null);
  if (available.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return { average: null, change: null };
  }
  if (available.length === 0) return { average: null, change: null };
  return {
    average: Math.round(available.reduce((total, value) => total + value, 0) / available.length * 100) / 100,
    change: available.length > 1
      ? Math.round((available[available.length - 1] - available[0]) * 100) / 100
      : null,
  };
}

export function buildExamProgressPeriods(
  exams: Array<{
    examId: number;
    examName: string;
    termName: string | null;
    startDate: string;
  }>,
): Array<{ key: string; label: string; order: string }> {
  const uniqueExams = new Map<number, { key: string; label: string; order: string }>();
  for (const exam of exams) {
    if (!uniqueExams.has(exam.examId)) {
      uniqueExams.set(exam.examId, {
        key: `exam:${exam.examId}`,
        label: exam.termName ? `${exam.examName} · ${exam.termName}` : exam.examName,
        order: exam.startDate,
      });
    }
  }
  return [...uniqueExams.values()].sort((first, second) =>
    first.order.localeCompare(second.order) || first.key.localeCompare(second.key),
  );
}

export function rankScores(scores: Array<{ id: number; score: number }>): Map<number, number> {
  const ordered = [...scores].sort((a, b) => b.score - a.score || a.id - b.id);
  const ranks = new Map<number, number>();
  let rank = 0;
  ordered.forEach((entry, index) => {
    if (index === 0 || entry.score !== ordered[index - 1].score) rank = index + 1;
    ranks.set(entry.id, rank);
  });
  return ranks;
}

export function sortExamResultsByRank<T extends { enrollmentId: number }>(
  results: T[],
  ranks: ReadonlyMap<number, number>,
): T[] {
  return [...results].sort((first, second) => {
    const firstRank = ranks.get(first.enrollmentId);
    const secondRank = ranks.get(second.enrollmentId);
    if (firstRank === undefined) return secondRank === undefined ? 0 : 1;
    if (secondRank === undefined) return -1;
    return firstRank - secondRank;
  });
}
