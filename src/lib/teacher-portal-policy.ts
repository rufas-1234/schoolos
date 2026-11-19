export type TeacherExamAssessment = {
  examId: number;
  examName: string;
  examTypeName: string | null;
  examStatus: string;
  yearName: string;
  branchId: number;
  branchName: string;
  classLevelId: number;
  className: string;
  subjectName: string;
  assessmentStatus: string;
};

export type TeacherExamAssessmentFilters = {
  examTitleId: string;
  status: "" | "open" | "published";
  branchId: number | null;
  classLevelId: number | null;
  search: string;
};

export function matchesTeacherExamAssessment(
  assessment: TeacherExamAssessment,
  filters: TeacherExamAssessmentFilters,
): boolean {
  return (!filters.examTitleId || String(assessment.examId) === filters.examTitleId) &&
    (!filters.status || assessment.examStatus === filters.status) &&
    (filters.branchId === null || assessment.branchId === filters.branchId) &&
    (filters.classLevelId === null || assessment.classLevelId === filters.classLevelId) &&
    `${assessment.examName} ${assessment.examTypeName ?? ""} ${assessment.yearName} ${assessment.branchName} ${assessment.className} ${assessment.subjectName} ${assessment.assessmentStatus}`
      .toLocaleLowerCase()
      .includes(filters.search);
}
