import {
  gradeForPercentage,
  isExamAttendanceStatus,
  type ExamAttendanceStatus,
  type GradeBand,
} from "./examination-policy";

export const examAnalyticsReportViews = [
  "overview",
  "classes",
  "sections",
  "subjects",
  "students",
  "attendance",
  "trends",
] as const;

export type ExamAnalyticsReportView = (typeof examAnalyticsReportViews)[number];

export function resolveExamAnalyticsReportView(value: string | undefined): ExamAnalyticsReportView {
  return examAnalyticsReportViews.find((view) => view === value) ?? "overview";
}

export type ExamAttendanceSummary = {
  assignedSessions: number;
  expectedSessions: number;
  recordedSessions: number;
  pendingSessions: number;
  coveragePercent: number | null;
  statuses: Record<ExamAttendanceStatus, number>;
};

export function summarizeExamAttendance(
  assignedSessions: number,
  recordedStatuses: string[],
): ExamAttendanceSummary {
  if (!Number.isInteger(assignedSessions) || assignedSessions < 0) {
    throw new Error("Assigned exam attendance sessions must be a non-negative integer.");
  }
  const statuses: Record<ExamAttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    not_applicable: 0,
    x: 0,
    y: 0,
  };
  for (const status of recordedStatuses) {
    if (!isExamAttendanceStatus(status)) throw new Error("Unknown exam attendance status in analytics.");
    statuses[status] += 1;
  }
  const exemptSessions = statuses.not_applicable;
  const expectedSessions = assignedSessions - exemptSessions;
  const recordedSessions = recordedStatuses.length - exemptSessions;
  if (expectedSessions < 0 || recordedSessions > expectedSessions) {
    throw new Error("Exam attendance records exceed the assigned analytics cohort.");
  }
  const pendingSessions = expectedSessions - recordedSessions;
  return {
    assignedSessions,
    expectedSessions,
    recordedSessions,
    pendingSessions,
    coveragePercent: expectedSessions ? recordedSessions / expectedSessions * 100 : null,
    statuses,
  };
}

export type ExamAnalyticsSummary = {
  count: number;
  mean: number | null;
  median: number | null;
  highest: number | null;
  lowest: number | null;
};

export function summarizeExamScores(scores: number[]): ExamAnalyticsSummary {
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error("Exam analytics scores must be percentages between 0 and 100.");
  }
  if (!scores.length) return { count: 0, mean: null, median: null, highest: null, lowest: null };
  const sorted = [...scores].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return {
    count: scores.length,
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    median,
    highest: sorted[sorted.length - 1],
    lowest: sorted[0],
  };
}

export function gradeDistribution(
  scores: number[],
  bands: GradeBand[],
): Array<{ grade: string; description: string; count: number }> {
  const distribution = bands.map((band) => ({
    grade: band.grade,
    description: band.description,
    count: 0,
  }));
  for (const score of scores) {
    const band = gradeForPercentage(score, bands);
    if (!band) continue;
    const entry = distribution.find((item) => item.grade === band.grade);
    if (!entry) throw new Error("A grade band could not be matched to the selected scale.");
    entry.count += 1;
  }
  return distribution;
}

export function analyticsRank(scores: Array<{ id: number; score: number }>): Map<number, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.id - b.id);
  const ranks = new Map<number, number>();
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (index === 0 || entry.score !== sorted[index - 1].score) rank = index + 1;
    ranks.set(entry.id, rank);
  });
  return ranks;
}

export function analyzeSubjectLearners(
  scores: Array<{ id: number; percentage: number }>,
  bands: GradeBand[],
  allowRanking: boolean,
): Map<number, { grade: string | null; rank: number | null }> {
  const ranks = allowRanking
    ? analyticsRank(scores.map((entry) => ({ id: entry.id, score: entry.percentage })))
    : new Map<number, number>();
  return new Map(scores.map((entry) => [
    entry.id,
    {
      grade: gradeForPercentage(entry.percentage, bands)?.grade ?? null,
      rank: ranks.get(entry.id) ?? null,
    },
  ]));
}
