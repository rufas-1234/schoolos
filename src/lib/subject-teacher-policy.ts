export type SectionSubjectTeacherScope = {
  classLevelId: number;
  sectionClassLevelId: number;
  classBranchId: number;
  teacherBranchId: number;
};

export function getSectionSubjectTeacherScopeError(scope: SectionSubjectTeacherScope) {
  if (scope.sectionClassLevelId !== scope.classLevelId) return "section-class-mismatch";
  if (scope.teacherBranchId !== scope.classBranchId) return "teacher-branch-mismatch";
  return null;
}
