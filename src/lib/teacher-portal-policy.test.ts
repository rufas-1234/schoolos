import { describe, expect, it } from "vitest";
import { matchesTeacherExamAssessment } from "./teacher-portal-policy";

const assessment = {
  examId: 7,
  examName: "Term 2 Examination",
  examTypeName: "Cambridge",
  examStatus: "open",
  yearName: "2026",
  branchId: 3,
  branchName: "North Campus",
  classLevelId: 12,
  className: "Year 8",
  subjectName: "Biology",
  assessmentStatus: "draft",
};

describe("teacher examination filters", () => {
  it("combines exam title, status, branch, and class filters", () => {
    const filters = {
      examTitleId: "7",
      status: "open" as const,
      branchId: 3,
      classLevelId: 12,
      search: "",
    };

    expect(matchesTeacherExamAssessment(assessment, filters)).toBe(true);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, branchId: 4 })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, classLevelId: 13 })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, status: "published" })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, examTitleId: "8" })).toBe(false);
  });

  it("includes the branch and class in case-insensitive text search", () => {
    const filters = {
      examTitleId: "",
      status: "" as const,
      branchId: null,
      classLevelId: null,
      search: "north campus year 8",
    };

    expect(matchesTeacherExamAssessment(assessment, filters)).toBe(true);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, search: "west campus" })).toBe(false);
  });
});
