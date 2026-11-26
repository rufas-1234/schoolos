import { describe, expect, it } from "vitest";
import { getSectionSubjectTeacherScopeError } from "./subject-teacher-policy";

describe("section subject teacher policy", () => {
  const validScope = {
    classLevelId: 12,
    sectionClassLevelId: 12,
    classBranchId: 3,
    teacherBranchId: 3,
  };

  it("accepts a teacher assigned to a section in the selected class and branch", () => {
    expect(getSectionSubjectTeacherScopeError(validScope)).toBeNull();
  });

  it("rejects a section from another class", () => {
    expect(getSectionSubjectTeacherScopeError({ ...validScope, sectionClassLevelId: 15 }))
      .toBe("section-class-mismatch");
  });

  it("rejects a teacher from another branch", () => {
    expect(getSectionSubjectTeacherScopeError({ ...validScope, teacherBranchId: 4 }))
      .toBe("teacher-branch-mismatch");
  });
});
