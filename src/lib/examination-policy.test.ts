import { describe, expect, it } from "vitest";
import {
  calculateWeightedAverage,
  gradeForPercentage,
  rankScores,
  validateGradeBands,
  type GradeBand,
} from "./examination-policy";

const scale: GradeBand[] = [
  { minPercent: 0, maxPercent: 40, grade: "F", description: "Fail", performanceRemark: "Needs support" },
  { minPercent: 40, maxPercent: 70, grade: "C", description: "Pass", performanceRemark: "Satisfactory" },
  { minPercent: 70, maxPercent: 100, grade: "A", description: "Excellent", performanceRemark: "Excellent" },
];

describe("examination policy", () => {
  it("rejects grade scales with gaps or overlaps", () => {
    expect(validateGradeBands(scale)).toBeNull();
    expect(validateGradeBands([scale[0], { ...scale[1], minPercent: 41 }, scale[2]])).toContain("gaps");
    expect(validateGradeBands([scale[0], { ...scale[1], minPercent: 39 }, scale[2]])).toContain("overlap");
  });

  it("assigns inclusive lower bounds and the uppermost grade at 100%", () => {
    expect(gradeForPercentage(40, scale)?.grade).toBe("C");
    expect(gradeForPercentage(100, scale)?.grade).toBe("A");
    expect(gradeForPercentage(101, scale)).toBeNull();
  });

  it("calculates weighted percentages and rejects invalid marks", () => {
    expect(calculateWeightedAverage([
      { marks: 40, maxMarks: 50, weight: 1 },
      { marks: 20, maxMarks: 100, weight: 3 },
    ])).toEqual({ totalMarks: 60, maxMarks: 150, percentage: 35 });
    expect(calculateWeightedAverage([{ marks: 51, maxMarks: 50, weight: 1 }])).toBeNull();
  });

  it("uses competition ranking for tied scores", () => {
    expect([...rankScores([{ id: 2, score: 90 }, { id: 1, score: 90 }, { id: 3, score: 80 }]).values()])
      .toEqual([1, 1, 3]);
  });
});
