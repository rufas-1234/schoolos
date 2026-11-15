export const studentSections = [
  {
    id: "category",
    label: "Student Category",
    href: "/admin/students/categories",
  },
  {
    id: "admission",
    label: "Add Student",
    href: "/admin/students?action=add",
    matchPath: "/admin/students",
    matchQuery: { key: "action", value: "add" },
    permission: "students.create",
  },
  {
    id: "list",
    label: "Student List",
    href: "/admin/students",
    matchQuery: { key: "action", value: null },
  },
  {
    id: "multi-class",
    label: "Multi Class Student",
    href: "/admin/students/multi-class",
  },
  {
    id: "unassigned",
    label: "Unassigned Student",
    href: "/admin/students/unassigned",
  },
  {
    id: "attendance",
    label: "Student Attendance",
    href: "/admin/academics?section=attendance",
    matchPath: "/admin/academics",
    matchQuery: { key: "section", value: "attendance" },
  },
  {
    id: "group",
    label: "Student Group",
    href: "/admin/students/groups",
  },
  {
    id: "promote",
    label: "Student Promote",
    href: "/admin/students/promote",
  },
  {
    id: "delete-records",
    label: "Delete Student Record",
    href: "/admin/students/delete-records",
    permission: "students.delete",
  },
  {
    id: "disabled",
    label: "Disabled Students",
    href: "/admin/students/disabled",
  },
  {
    id: "export",
    label: "Student Export",
    href: "/admin/students?action=export",
    matchPath: "/admin/students",
    matchQuery: { key: "action", value: "export" },
  },
  {
    id: "settings",
    label: "Student Settings",
    href: "/admin/students/settings",
    permission: "students.update",
    permissionAlternatives: ["school.settings.manage"],
  },
  {
    id: "student-attendance-report",
    label: "Student Attendance Report",
    href: "/admin/academics?section=attendance",
  },
  {
    id: "class-routine-report",
    label: "Class Routine",
    href: "/admin/academics?section=routines",
    permission: "school.settings.manage",
  },
  {
    id: "student-report",
    label: "Student Report",
    href: "/admin/students?action=export",
  },
] as const;
