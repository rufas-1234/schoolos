export const academicSections = [
  {
    id: "branches",
    label: "Branches",
    description: "Manage school locations and academic branch details.",
  },
  {
    id: "years",
    label: "Academic years",
    description: "Create school years and manage their status.",
  },
  {
    id: "terms",
    label: "Terms & exams",
    description: "Set term dates and exam periods.",
  },
  {
    id: "classes",
    label: "Classes",
    description: "Set up the school's grade or class levels.",
  },
  {
    id: "sections",
    label: "Class sections",
    description: "Create year-specific class streams, set capacity, and appoint one class teacher for every stream in a class.",
  },
  {
    id: "subjects",
    label: "Subjects",
    description: "Create theory-only, practical-only, or combined subjects and assign them to classes and teachers.",
  },
  {
    id: "optional-subjects",
    label: "Optional subjects",
    description: "Review and assign elective subjects for each class.",
  },
  {
    id: "classrooms",
    label: "Classrooms",
    description: "Manage rooms and seat capacities for each branch.",
  },
  {
    id: "routines",
    label: "Timetable",
    description: "Build a weekly timetable for each class section.",
  },
  {
    id: "teachers",
    label: "Teachers",
    description: "Review teachers' year-specific class, section, and subject assignments and teaching roles.",
  },
  {
    id: "holidays",
    label: "Holidays",
    description: "Record school holidays and breaks.",
  },
  {
    id: "enrollment",
    label: "Student enrollment",
    description: "Place students and record their progression or transfers.",
  },
  {
    id: "attendance",
    label: "Attendance",
    description: "Record and review daily attendance for enrolled class sections.",
  },
] as const;

export type AcademicSectionId = (typeof academicSections)[number]["id"];

export function isAcademicSectionId(value: string | undefined): value is AcademicSectionId {
  return academicSections.some((section) => section.id === value);
}
