import { describe, expect, it } from "vitest";
import {
  analyzeSubjectLearners,
  analyticsRank,
  gradeDistribution,
  resolveExamAnalyticsReportView,
  summarizeExamAttendance,
  summarizeExamScores,
} from "./exam-analytics-policy";
import type { GradeBand } from "./examination-policy";

const bands: GradeBand[] = [
  { minPercent: 0, maxPercent: 40, grade: "F", description: "Needs improvement", performanceRemark: "Practice" },
  { minPercent: 40, maxPercent: 70, grade: "C", description: "Satisfactory", performanceRemark: "Good" },
  { minPercent: 70, maxPercent: 100, grade: "A", description: "Excellent", performanceRemark: "Excellent" },
];

describe("exam analytics policy", () => {
  it("summarizes class scores with mean, median and range", () => {
    expect(summarizeExamScores([90, 50, 70, 30])).toEqual({
      count: 4,
      mean: 60,
      median: 60,
      highest: 90,
      lowest: 30,
    });
    expect(summarizeExamScores([])).toEqual({
      count: 0,
      mean: null,
      median: null,
      highest: null,
      lowest: null,
    });
  });

  it("rejects invalid scores rather than silently including them in analytics", () => {
    expect(() => summarizeExamScores([50, 101])).toThrow("percentages between 0 and 100");
  });

  it("counts students against the selected grading scale", () => {
    expect(gradeDistribution([90, 70, 55, 39], bands)).toEqual([
      { grade: "F", description: "Needs improvement", count: 1 },
      { grade: "C", description: "Satisfactory", count: 1 },
      { grade: "A", description: "Excellent", count: 2 },
    ]);
  });

  it("uses competition ranking for tied student scores", () => {
    expect([...analyticsRank([
      { id: 2, score: 90 },
      { id: 1, score: 90 },
      { id: 3, score: 80 },
    ]).entries()]).toEqual([[1, 1], [2, 1], [3, 3]]);
  });

  it("calculates subject grades and class positions only when ranking is enabled", () => {
    const scores = [
      { id: 11, percentage: 90 },
      { id: 12, percentage: 90 },
      { id: 13, percentage: 55 },
    ];
    expect([...analyzeSubjectLearners(scores, bands, true)]).toEqual([
      [11, { grade: "A", rank: 1 }],
      [12, { grade: "A", rank: 1 }],
      [13, { grade: "C", rank: 3 }],
    ]);
    expect([...analyzeSubjectLearners(scores, bands, false).values()])
      .toEqual([{ grade: "A", rank: null }, { grade: "A", rank: null }, { grade: "C", rank: null }]);
  });

  it("resolves report dropdown selections and falls back to the overview", () => {
    expect(resolveExamAnalyticsReportView("sections")).toBe("sections");
    expect(resolveExamAnalyticsReportView("unknown")).toBe("overview");
  });

  it("reports attendance coverage without counting not-applicable sessions as missing or treating X/Y as present", () => {
    expect(summarizeExamAttendance(5, ["present", "late", "x", "not_applicable"])).toEqual({
      assignedSessions: 5,
      expectedSessions: 4,
      recordedSessions: 3,
      pendingSessions: 1,
      coveragePercent: 75,
      statuses: {
        present: 1,
        absent: 0,
        late: 1,
        excused: 0,
        not_applicable: 1,
        x: 1,
        y: 0,
      },
    });
  });

  it("rejects unknown attendance statuses and records beyond the assigned cohort", () => {
    expect(() => summarizeExamAttendance(1, ["unknown"])).toThrow("Unknown exam attendance status");
    expect(() => summarizeExamAttendance(0, ["present"])).toThrow("exceed the assigned analytics cohort");
  });
});
