import { describe, expect, it } from "vitest";
import {
  analyticsRank,
  gradeDistribution,
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
});
