"use client";

import { useState, type ReactNode } from "react";

type RoleManagementSection = {
  id: string;
  label: string;
  description: string;
  content: ReactNode;
};

export function RoleManagementSections({
  sections,
}: {
  sections: RoleManagementSection[];
}) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const activeSection = sections.find((section) => section.id === activeSectionId);

  return (
    <section className="space-y-4">
      <label className="block max-w-xl space-y-1.5 text-sm font-medium text-slate-700">
        User roles section
        <select
          value={activeSectionId}
          onChange={(event) => setActiveSectionId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.label}</option>
          ))}
        </select>
      </label>
      {activeSection && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{activeSection.label}</h2>
            <p className="mt-1 text-sm text-slate-500">{activeSection.description}</p>
          </div>
          {activeSection.content}
        </div>
      )}
    </section>
  );
}
