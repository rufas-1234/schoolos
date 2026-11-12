"use client";

import Image from "next/image";
import { Printer } from "lucide-react";
import { useEffect, useId, useState } from "react";

type ProfileTab = "personal" | "parents" | "documents" | "previous" | "other" | "custom";
type ProfileField = {
  label: string;
  value: string | null;
  tab: ProfileTab;
  href?: string;
};

const tabs: { id: ProfileTab; label: string; emptyMessage?: string }[] = [
  { id: "personal", label: "Personal Info" },
  { id: "parents", label: "Parents & Guardian Info" },
  { id: "documents", label: "Document Info", emptyMessage: "No student documents have been added." },
  {
    id: "previous",
    label: "Previous School Information",
    emptyMessage: "No previous school information has been added.",
  },
  { id: "other", label: "Other Info", emptyMessage: "No additional student information has been added." },
  { id: "custom", label: "Custom Field", emptyMessage: "No custom student fields are configured." },
];

export function StudentProfileDetails({
  fields,
  studentName,
  admissionNumber,
  photoUrl,
}: {
  fields: ProfileField[];
  studentName: string;
  admissionNumber: string | null;
  photoUrl: string | null;
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("personal");
  const [printing, setPrinting] = useState(false);
  const id = useId();
  const activeTabDetails = tabs.find((tab) => tab.id === activeTab);
  const visibleFields = fields.filter((field) => field.tab === activeTab);

  useEffect(() => {
    if (!printing) return;
    const resetPrinting = () => setPrinting(false);
    window.addEventListener("afterprint", resetPrinting);
    const timer = window.setTimeout(() => window.print(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", resetPrinting);
    };
  }, [printing]);

  return (
    <div className={`student-profile-printable space-y-5${printing ? " student-profile-printing" : ""}`}>
      <header className="flex items-center gap-4">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`${studentName} profile photo`}
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
          />
        ) : (
          <div
            aria-label="No profile photo"
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl font-semibold text-slate-400"
          >
            {studentName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-slate-900">{studentName}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {admissionNumber ? `Admission no. ${admissionNumber}` : "Student profile"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          className="student-profile-print-ui inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Printer size={16} aria-hidden="true" />
          Print / Save as PDF
        </button>
      </header>
      <div className="student-profile-print-only">
        {tabs.map((tab) => {
          const tabFields = fields.filter((field) => field.tab === tab.id && field.value);
          if (tabFields.length === 0) return null;
          return (
            <section key={tab.id} className="student-profile-print-section">
              <h4>{tab.label}</h4>
              <dl>
                {tabFields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
      <div
        role="tablist"
        aria-label="Student information sections"
        className="student-profile-print-ui flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${id}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${id}-${tab.id}-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-violet-100 text-violet-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        id={`${id}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${activeTab}-tab`}
        className="student-profile-print-ui min-h-44"
      >
        {visibleFields.length > 0 ? (
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <div key={field.label} className="min-w-0 border-b border-slate-100 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {field.label}
                </p>
                <p className="mt-1 break-words text-sm text-slate-900">
                  {field.href && field.value ? (
                    <a href={field.href} className="font-medium text-violet-800 underline">
                      {field.value}
                    </a>
                  ) : (
                    field.value || "Not provided"
                  )}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {activeTabDetails?.emptyMessage}
          </p>
        )}
      </section>
    </div>
  );
}
