import type { ReactNode } from "react";

type RoleManagementSection = {
  id: string;
  label: string;
  description: string;
  content: ReactNode;
};

export function RoleManagementSections({
  sections,
  activeSectionId,
}: {
  sections: RoleManagementSection[];
  activeSectionId: string;
}) {
  const activeSection = sections.find((section) => section.id === activeSectionId);

  return (
    activeSection ? (
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{activeSection.label}</h2>
          <p className="mt-1 text-sm text-slate-500">{activeSection.description}</p>
        </div>
        {activeSection.content}
      </section>
    ) : null
  );
}
