import { describe, expect, it } from "vitest";
import {
  canPreviewDraftTestReport,
  canPublishExamClass,
  canEnterExamMarks,
  canEditExamAttendance,
  canReviewExamSubject,
  canViewExamSubject,
  buildExamProgressPeriods,
  calculateComponentTotal,
  calculateAnnualProgress,
  calculateWeightedAverage,
  completeSubmittedMarkIds,
  examMarkEntryInputPattern,
  examAssessmentResultState,
  hasCompleteExamResult,
  gradeForPercentage,
  missingExamMarkEnrollmentIds,
  missingExamRosterEnrollmentIds,
  parseExamComponents,
  parseExamMarkEntry,
  rankScores,
  sortExamResultsByRank,
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
  it("only lets platform admins edit attendance on approved assessments while the exam is open", () => {
    expect(canEditExamAttendance({
      examStatus: "open",
      assessmentStatus: "draft",
      isPlatformAdmin: false,
    })).toBe(true);
    expect(canEditExamAttendance({
      examStatus: "open",
      assessmentStatus: "approved",
      isPlatformAdmin: false,
    })).toBe(false);
    expect(canEditExamAttendance({
      examStatus: "open",
      assessmentStatus: "approved",
      isPlatformAdmin: true,
    })).toBe(true);
    expect(canEditExamAttendance({
      examStatus: "closed",
      assessmentStatus: "approved",
      isPlatformAdmin: true,
    })).toBe(false);
  });

  it("limits subject-result visibility to assigned teachers unless examination oversight is granted", () => {
    expect(canViewExamSubject(["results.enter"], true)).toBe(true);
    expect(canViewExamSubject(["results.enter"], false)).toBe(false);
    expect(canViewExamSubject(["examinations.create"], false)).toBe(true);
    expect(canViewExamSubject(["results.publish"], false)).toBe(true);
  });

  it("allows results managers to enter and submit marks for unassigned subjects", () => {
    expect(canEnterExamMarks(["results.enter"], true)).toBe(true);
    expect(canEnterExamMarks(["results.enter"], false)).toBe(false);
    expect(canEnterExamMarks(["results.enter", "examinations.create"], false)).toBe(true);
    expect(canEnterExamMarks(["results.enter", "results.publish"], false)).toBe(true);
    expect(canEnterExamMarks(["results.publish"], false)).toBe(false);
  });

  it("allows class teachers to review their class but reserves publishing for results publishers", () => {
    expect(canReviewExamSubject(["results.enter"], true)).toBe(true);
    expect(canReviewExamSubject(["results.enter"], false)).toBe(false);
    expect(canReviewExamSubject(["results.publish"], false)).toBe(true);
    expect(canReviewExamSubject([], true)).toBe(false);
    expect(canPublishExamClass(["results.enter"])).toBe(false);
    expect(canPublishExamClass(["results.publish"])).toBe(true);
  });

  it("rejects grade scales with gaps or overlaps", () => {
    expect(validateGradeBands(scale)).toBeNull();
    expect(validateGradeBands([scale[0], { ...scale[1], minPercent: 41 }, scale[2]])).toContain("gaps");
    expect(validateGradeBands([scale[0], { ...scale[1], minPercent: 39 }, scale[2]])).toContain("overlap");
  });

  it("provides complete editable starter bands for the supported grading systems", () => {
    expect(GRADING_SCALE_PRESETS.map((preset) => preset.id)).toEqual(["south-sudan", "kenya-844", "cambridge-igcse"]);
    for (const preset of GRADING_SCALE_PRESETS) {
      expect(validateGradeBands(preset.bands)).toBeNull();
    }
    expect(GRADING_SCALE_PRESETS.find((preset) => preset.id === "kenya-844")?.bands).toHaveLength(12);
    expect(GRADING_SCALE_PRESETS.find((preset) => preset.id === "cambridge-igcse")?.bands.map((band) => band.grade))
      .toEqual(["U", "G", "F", "E", "D", "C", "B", "A", "A*"]);
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

  it("distinguishes optional subjects, coded outcomes, and missing marks", () => {
    expect(examAssessmentResultState({
      attendanceStatus: "not_applicable",
      isCompulsory: false,
      hasMark: false,
    })).toBe("not-applicable");
    expect(examAssessmentResultState({
      attendanceStatus: "not_applicable",
      isCompulsory: true,
      hasMark: false,
    })).toBe("missing");
    expect(examAssessmentResultState({
      attendanceStatus: "x",
      isCompulsory: true,
      hasMark: false,
    })).toBe("no-result");
    expect(examAssessmentResultState({
      attendanceStatus: "present",
      isCompulsory: true,
      hasMark: false,
    })).toBe("missing");
    expect(examAssessmentResultState({
      attendanceStatus: "late",
      isCompulsory: false,
      hasMark: true,
    })).toBe("scored");
    expect(examAssessmentResultState({
      attendanceStatus: "invalid",
      isCompulsory: true,
      hasMark: true,
    })).toBe("missing");
  });

  it("only calculates an overall result when every applicable assessment has a score", () => {
    expect(hasCompleteExamResult(["scored", "not-applicable"])).toBe(true);
    expect(hasCompleteExamResult(["scored", "no-result"])).toBe(false);
    expect(hasCompleteExamResult(["scored", "missing"])).toBe(false);
  });

  it("calculates annual averages from available periods and compares the first and last results", () => {
    expect(calculateAnnualProgress([80, null, 90])).toEqual({ average: 85, change: 10 });
    expect(calculateAnnualProgress([70, 80, 90])).toEqual({ average: 80, change: 20 });
    expect(calculateAnnualProgress([null, 75, null])).toEqual({ average: 75, change: null });
    expect(calculateAnnualProgress([null, null])).toEqual({ average: null, change: null });
    expect(calculateAnnualProgress([80, 105])).toEqual({ average: null, change: null });
  });

  it("keeps every exam as a separate progress period even when exams share a term", () => {
    expect(buildExamProgressPeriods([
      { examId: 1, examName: "Opening Exam", termName: "Term 1", startDate: "2026-01-10" },
      { examId: 2, examName: "Midterm Exam", termName: "Term 1", startDate: "2026-02-10" },
      { examId: 3, examName: "End-Term Exam", termName: "Term 1", startDate: "2026-03-10" },
      { examId: 2, examName: "Midterm Exam", termName: "Term 1", startDate: "2026-02-10" },
    ])).toEqual([
      { key: "exam:1", label: "Opening Exam · Term 1", order: "2026-01-10" },
      { key: "exam:2", label: "Midterm Exam · Term 1", order: "2026-02-10" },
      { key: "exam:3", label: "End-Term Exam · Term 1", order: "2026-03-10" },
    ]);
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

  it("accepts X/Y result codes in mark cells without treating them as numeric marks", () => {
    expect(parseExamMarkEntry("")).toEqual({ kind: "score", marks: null });
    expect(parseExamMarkEntry("72.5")).toEqual({ kind: "score", marks: 72.5 });
    expect(parseExamMarkEntry(" x ")).toEqual({ kind: "status", status: "x" });
    expect(parseExamMarkEntry("Y")).toEqual({ kind: "status", status: "y" });
    expect(parseExamMarkEntry("-1")).toBeNull();
    expect(parseExamMarkEntry("absent")).toBeNull();
  });

  it("allows valid numeric marks through the browser input pattern", () => {
    const pattern = new RegExp(`^(?:${examMarkEntryInputPattern})$`, "v");
    expect(pattern.test("87")).toBe(true);
    expect(pattern.test("87.5")).toBe(true);
    expect(pattern.test(" x ")).toBe(true);
    expect(pattern.test("87a")).toBe(false);
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

  it("checks missing marks independently from attendance and exempts explicit no-result entries", () => {
    expect(missingExamMarkEnrollmentIds(
      [1, 2, 3],
      [{ enrollmentId: 1, marks: "82.00" }, { enrollmentId: 2, marks: null }],
      [2],
    )).toEqual([3]);
    expect(examAssessmentResultState({
      attendanceStatus: null,
      isCompulsory: true,
      hasMark: true,
    })).toBe("scored");
    expect(examAssessmentResultState({
      attendanceStatus: "absent",
      isCompulsory: true,
      hasMark: true,
    })).toBe("scored");
    expect(examAssessmentResultState({
      attendanceStatus: "absent",
      isCompulsory: true,
      hasMark: false,
    })).toBe("missing");
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

  it("orders ranked results first, keeps tied ranks stable, and puts unranked results last", () => {
    const results = [
      { enrollmentId: 30, student: "Unranked" },
      { enrollmentId: 20, student: "Tied second" },
      { enrollmentId: 10, student: "First" },
      { enrollmentId: 21, student: "Tied third" },
    ];
    expect(sortExamResultsByRank(results, new Map([
      [10, 1],
      [20, 2],
      [21, 2],
    ])).map((result) => result.enrollmentId)).toEqual([10, 20, 21, 30]);
  });
});
