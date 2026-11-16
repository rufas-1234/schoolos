import { describe, expect, it } from "vitest";
import {
  canPreviewDraftTestReport,
  calculateComponentTotal,
  calculateWeightedAverage,
  completeSubmittedMarkIds,
  gradeForPercentage,
  missingExamRosterEnrollmentIds,
  parseExamComponents,
  rankScores,
  validateGradeBands,
  type GradeBand,
} from "./examination-policy";
import { GRADING_SCALE_PRESETS } from "./grading-scale-presets";

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

  it("provides complete editable starter bands for the supported grading systems", () => {
    expect(GRADING_SCALE_PRESETS.map((preset) => preset.id)).toEqual(["south-sudan", "kenya-844"]);
    for (const preset of GRADING_SCALE_PRESETS) {
      expect(validateGradeBands(preset.bands)).toBeNull();
    }
    expect(GRADING_SCALE_PRESETS.find((preset) => preset.id === "kenya-844")?.bands).toHaveLength(12);
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

  it("validates single and multi-exam mark distributions and sums complete component marks", () => {
    expect(parseExamComponents("Exam | 100", "single")).toEqual([{ title: "Exam", maxMarks: 100 }]);
    expect(parseExamComponents("Paper 1 | 50\nPaper 2 | 50", "multi")).toEqual([
      { title: "Paper 1", maxMarks: 50 },
      { title: "Paper 2", maxMarks: 50 },
    ]);
    expect(parseExamComponents("Paper 1 | 50", "multi")).toBeNull();
    expect(parseExamComponents("Paper | 50\npaper | 50", "multi")).toBeNull();
    expect(calculateComponentTotal([
      { marks: 35, maxMarks: 50 },
      { marks: 42, maxMarks: 50 },
    ])).toEqual({ marks: 77, maxMarks: 100 });
    expect(calculateComponentTotal([
      { marks: 35, maxMarks: 50 },
      { marks: null, maxMarks: 50 },
    ])).toBeNull();
    expect(calculateComponentTotal([{ marks: 51, maxMarks: 50 }])).toBeNull();
  });

  it("accepts complete component marks for only the submitted students", () => {
    expect(completeSubmittedMarkIds(
      ["12:3", "12:4", "14:3", "14:4"],
      [12, 13, 14],
      [3, 4],
    )).toEqual([12, 14]);
    expect(completeSubmittedMarkIds(
      ["12:3", "14:3", "14:4"],
      [12, 13, 14],
      [3, 4],
    )).toBeNull();
    expect(completeSubmittedMarkIds(
      ["99:3"],
      [12, 13, 14],
      [3, 4],
    )).toBeNull();
  });

  it("finds missing eligible enrollments without removing existing mark rows", () => {
    expect(missingExamRosterEnrollmentIds([1, 2, 3, 4], [1, 3])).toEqual([2, 4]);
    expect(missingExamRosterEnrollmentIds([1, 2, 3, 4], [1, 2, 3, 4])).toEqual([]);
  });

  it("allows draft report previews only for managed, open test examinations", () => {
    expect(canPreviewDraftTestReport({
      requested: true,
      examName: "TEST DATA - Multi Exam 2026",
      examStatus: "open",
      canManage: true,
    })).toBe(true);
    expect(canPreviewDraftTestReport({
      requested: true,
      examName: "Term 1 examination",
      examStatus: "open",
      canManage: true,
    })).toBe(false);
    expect(canPreviewDraftTestReport({
      requested: true,
      examName: "TEST DATA - Multi Exam 2026",
      examStatus: "open",
      canManage: false,
    })).toBe(false);
    expect(canPreviewDraftTestReport({
      requested: true,
      examName: "TEST DATA - Multi Exam 2026",
      examStatus: "published",
      canManage: true,
    })).toBe(false);
  });

  it("uses competition ranking for tied scores", () => {
    expect([...rankScores([{ id: 2, score: 90 }, { id: 1, score: 90 }, { id: 3, score: 80 }]).values()])
      .toEqual([1, 1, 3]);
  });
});
