import { describe, expect, it } from "vitest";
import { matchesTeacherExamAssessment } from "./teacher-portal-policy";

const assessment = {
  examId: 7,
  examName: "Term 2 Examination",
  examTypeName: "Cambridge",
  examStatus: "open",
  yearName: "2026",
  classLevelId: 12,
  className: "Year 8",
  sectionIds: [28],
  sectionNames: ["Section A"],
  subjectName: "Biology",
  assessmentStatus: "draft",
};

describe("teacher examination filters", () => {
  it("combines exam title, status, section, and class filters", () => {
    const filters = {
      examTitleId: "7",
      status: "open" as const,
      sectionId: 28,
      classLevelId: 12,
      search: "",
    };

    expect(matchesTeacherExamAssessment(assessment, filters)).toBe(true);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, sectionId: 29 })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, classLevelId: 13 })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, status: "published" })).toBe(false);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, examTitleId: "8" })).toBe(false);
  });

  it("includes the section and class in case-insensitive text search", () => {
    const filters = {
      examTitleId: "",
      status: "" as const,
      sectionId: null,
      classLevelId: null,
      search: "year 8 section a",
    };

    expect(matchesTeacherExamAssessment(assessment, filters)).toBe(true);
    expect(matchesTeacherExamAssessment(assessment, { ...filters, search: "section b" })).toBe(false);
  });
});
