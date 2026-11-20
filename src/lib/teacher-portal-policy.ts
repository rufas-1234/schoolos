export type TeacherExamAssessment = {
  examId: number;
  examName: string;
  examTypeName: string | null;
  examStatus: string;
  yearName: string;
  classLevelId: number;
  className: string;
  sectionIds: number[];
  sectionNames: string[];
  subjectName: string;
  assessmentStatus: string;
};

export type TeacherExamAssessmentFilters = {
  examTitleId: string;
  status: "" | "open" | "published";
  sectionId: number | null;
  classLevelId: number | null;
  search: string;
};

export function matchesTeacherExamAssessment(
  assessment: TeacherExamAssessment,
  filters: TeacherExamAssessmentFilters,
): boolean {
  return (!filters.examTitleId || String(assessment.examId) === filters.examTitleId) &&
    (!filters.status || assessment.examStatus === filters.status) &&
    (filters.sectionId === null || assessment.sectionIds.includes(filters.sectionId)) &&
    (filters.classLevelId === null || assessment.classLevelId === filters.classLevelId) &&
    `${assessment.examName} ${assessment.examTypeName ?? ""} ${assessment.yearName} ${assessment.className} ${assessment.sectionNames.join(" ")} ${assessment.subjectName} ${assessment.assessmentStatus}`
      .toLocaleLowerCase()
      .includes(filters.search);
}
