import { describe, expect, it } from "vitest";
import {
  examRemarkVariantIndex,
  resolveExamReportRemark,
} from "./exam-report-remarks";
import type { GradeBand } from "./examination-policy";

const veryGood: GradeBand = {
  minPercent: 70,
  maxPercent: 80,
  grade: "B",
  description: "Very good",
  performanceRemark: "Very good work",
};

describe("exam report remarks", () => {
  it("distributes five distinct role-specific comments across learners with the same grade", () => {
    const indexes = [1, 2, 3, 4, 5].map(examRemarkVariantIndex);

    expect(new Set(indexes.map((index) =>
      resolveExamReportRemark(null, veryGood, "classTeacher", index),
    )).size).toBe(5);
    expect(new Set(indexes.map((index) =>
      resolveExamReportRemark(null, veryGood, "headteacher", index),
    )).size).toBe(5);
  });

  it("uses the grade's performance context and keeps each learner's wording stable", () => {
    const good: GradeBand = { ...veryGood, minPercent: 60, maxPercent: 70, grade: "C", description: "Good", performanceRemark: "Good effort" };
    const index = examRemarkVariantIndex(17);
    const first = resolveExamReportRemark(null, veryGood, "classTeacher", index);

    expect(index).toBe(2);
    expect(first?.toLowerCase()).toContain("very good");
    expect(resolveExamReportRemark(null, good, "classTeacher", 0)).toContain("Good");
    expect(resolveExamReportRemark(null, { ...good, performanceRemark: "Needs support" }, "classTeacher", 0))
      .toContain("practicing");
    expect(resolveExamReportRemark(null, { ...good, performanceRemark: "Excellent work" }, "headteacher", 0))
      .toContain("excellent");
    expect(resolveExamReportRemark(null, veryGood, "classTeacher", index)).toBe(first);
  });

  it("preserves custom remarks and avoids generating comments without a grade", () => {
    expect(resolveExamReportRemark("  Personal comment  ", veryGood, "headteacher", 0))
      .toBe("Personal comment");
    expect(resolveExamReportRemark("", null, "classTeacher", 0)).toBeNull();
  });
});
