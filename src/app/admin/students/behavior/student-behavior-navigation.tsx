import Link from "next/link";

type StudentBehaviorSection = "records" | "incidents" | "reports" | "categories";

const sections: { id: StudentBehaviorSection; label: string; href: string }[] = [
  { id: "records", label: "Records", href: "/admin/students/behavior" },
  { id: "incidents", label: "Student incident reports", href: "/admin/students/behavior?view=incidents" },
  { id: "reports", label: "Behavior reports & rankings", href: "/admin/students/behavior/reports" },
  { id: "categories", label: "Categories & actions", href: "/admin/students/behavior/settings" },
];

export function StudentBehaviorNavigation({ active }: { active: StudentBehaviorSection }) {
  return (
    <nav aria-label="Student behaviour sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {sections.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          aria-current={active === section.id ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            active === section.id
              ? "bg-violet-100 text-violet-800"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
