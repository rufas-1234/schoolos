"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { searchWorkspace, type WorkspaceSearchResult } from "@/app/admin/workspace-search-actions";

const teachingSuggestions: WorkspaceSearchResult[] = [
  {
    id: "teaching-classes",
    title: "My classes",
    description: "Open classes, subjects, sections, and current-year assignments.",
    href: "/portal/teacher?section=classes",
    category: "Academics",
    searchTerms: ["class", "subject", "section", "assignment"],
  },
  {
    id: "teaching-register",
    title: "Class register & attendance",
    description: "Find your class registers and take attendance.",
    href: "/portal/teacher?section=register",
    category: "Academics",
    searchTerms: ["register", "attendance", "student", "roll"],
  },
  {
    id: "teaching-assessments",
    title: "Examination work",
    description: "Open assessments and enter marks for assigned subjects.",
    href: "/portal/teacher?section=assessments",
    category: "Examinations",
    searchTerms: ["exam", "assessment", "marks", "results"],
  },
  {
    id: "teaching-timetable",
    title: "My timetable",
    description: "View your assigned lessons and teaching schedule.",
    href: "/portal/teacher?section=timetable",
    category: "Academics",
    searchTerms: ["timetable", "schedule", "lesson"],
  },
];

const studentSuggestions: WorkspaceSearchResult[] = [
  {
    id: "student-overview",
    title: "Overview",
    description: "See your class placement, learning summary, and fee balance.",
    href: "/portal/student?section=overview",
    category: "Pages",
    searchTerms: ["home", "dashboard", "summary"],
  },
  {
    id: "student-learning",
    title: "My learning",
    description: "View your current class placement.",
    href: "/portal/student?section=learning",
    category: "Academics",
    searchTerms: ["class", "learning", "placement"],
  },
  {
    id: "student-timetable",
    title: "Class timetable",
    description: "Open your weekly lesson schedule.",
    href: "/portal/student?section=timetable",
    category: "Academics",
    searchTerms: ["schedule", "lessons", "subjects"],
  },
  {
    id: "student-results",
    title: "Exam results",
    description: "View and print your published report cards.",
    href: "/portal/student?section=results",
    category: "Examinations",
    searchTerms: ["exam", "marks", "reports", "grades"],
  },
  {
    id: "student-fees",
    title: "Invoices and fees",
    description: "Review fee invoices, balances, and payment status.",
    href: "/portal/student?section=fees",
    category: "Fees",
    searchTerms: ["invoice", "balance", "payment", "finance"],
  },
  {
    id: "student-receipts",
    title: "Payment receipts",
    description: "View and print payment receipts.",
    href: "/portal/student?section=receipts",
    category: "Fees",
    searchTerms: ["receipt", "paid", "transaction"],
  },
  {
    id: "student-profile",
    title: "My profile",
    description: "View your read-only student details.",
    href: "/portal/student?section=profile",
    category: "Pages",
    searchTerms: ["personal", "details", "student"],
  },
  {
    id: "student-library",
    title: "Library",
    description: "Search the catalogue and check your loans.",
    href: "/portal/student?section=library",
    category: "Library",
    searchTerms: ["books", "loans", "borrowed"],
  },
  {
    id: "student-attendance",
    title: "Attendance",
    description: "Review attendance recorded by your school.",
    href: "/portal/student?section=attendance",
    category: "Pages",
    searchTerms: ["present", "absent", "register"],
  },
];

export function WorkspaceQuickSearch({
  scope = "workspace",
  instanceId = "workspace-quick-search",
  variant = "default",
  compactOnMobile = false,
}: {
  scope?: "workspace" | "teaching" | "student";
  instanceId?: string;
  variant?: "default" | "hero";
  compactOnMobile?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultState, setResultState] = useState<{
    query: string;
    results: WorkspaceSearchResult[];
  }>({ query: "", results: [] });
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);

  useEffect(() => {
    if (scope === "student") return;
    const normalizedQuery = query.trim();
    const currentRequestId = ++requestId.current;
    if (normalizedQuery.length < 2) return;
    const timer = window.setTimeout(() => {
      searchWorkspace(normalizedQuery)
        .then((results) => {
          if (requestId.current === currentRequestId) {
            setResultState({ query: normalizedQuery, results });
            setStatus("idle");
          }
        })
        .catch(() => {
          if (requestId.current === currentRequestId) {
            setResultState({ query: normalizedQuery, results: [] });
            setStatus("error");
          }
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query, scope]);

  const normalizedQuery = query.trim();
  const results = resultState.query === normalizedQuery ? resultState.results : [];
  const suggestions = scope === "student"
    ? studentSuggestions.filter((suggestion) =>
      !normalizedQuery ||
      `${suggestion.title} ${suggestion.description} ${suggestion.searchTerms?.join(" ") ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery.toLocaleLowerCase()),
    )
    : scope === "teaching"
      ? teachingSuggestions.filter((suggestion) =>
      !normalizedQuery ||
      `${suggestion.title} ${suggestion.description} ${suggestion.searchTerms?.join(" ") ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery.toLocaleLowerCase()),
    )
      : [];
  const navigationOptions = scope === "student"
    ? suggestions
    : normalizedQuery.length >= 2 ? results : suggestions;
  const showResults = focused &&
    (normalizedQuery.length >= 2 || (scope !== "workspace" && normalizedQuery.length < 2));

  function openResult(result: WorkspaceSearchResult) {
    setFocused(false);
    setQuery("");
    router.push(result.href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedResult = navigationOptions[activeIndex] ?? navigationOptions[0];
    if (selectedResult) openResult(selectedResult);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setFocused(false);
    if (event.key === "ArrowDown" && navigationOptions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % navigationOptions.length);
    }
    if (event.key === "ArrowUp" && navigationOptions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? navigationOptions.length - 1 : index - 1));
    }
  }

  return (
    <form
      role="search"
      onSubmit={submitSearch}
      className={variant === "hero"
        ? "relative w-full min-w-0"
        : compactOnMobile
          ? "relative order-last mx-0 basis-full min-w-0 sm:order-none sm:mx-4 sm:basis-auto sm:flex-1 sm:max-w-xl"
          : "relative mx-2 min-w-0 flex-1 sm:mx-4 sm:max-w-xl"}
    >
      <label className="sr-only" htmlFor={instanceId}>
        {scope === "student"
          ? "Search student portal pages and services"
          : scope === "teaching"
          ? "Search your classes, exam titles, subjects, and teaching pages"
          : "Search students, staff, classes, exams, library books and members, inventory, fees, accounts, and reports"}
      </label>
      <Search
        aria-hidden="true"
        size={variant === "hero" ? 18 : 17}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${variant === "hero" ? "left-4" : "left-3"}`}
      />
      <input
        id={instanceId}
        role="combobox"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          requestId.current += 1;
          setActiveIndex(-1);
          setQuery(event.target.value);
          setStatus(scope !== "student" && event.target.value.trim().length >= 2 ? "searching" : "idle");
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={showResults ? `${instanceId}-results` : undefined}
        aria-expanded={showResults}
        aria-haspopup="listbox"
        aria-activedescendant={
          activeIndex >= 0 && navigationOptions[activeIndex]
            ? `${instanceId}-result-${navigationOptions[activeIndex].id}`
            : undefined
        }
        placeholder={scope === "student"
          ? "Search your portal..."
          : scope === "teaching"
            ? "Search your classes, exams, subjects..."
            : "Search students, staff, library, inventory, fees..."}
        className={`admin-quick-search-input cloudflare-search-input ${compactOnMobile || variant === "hero" ? "admin-quick-search-input-wide " : ""}w-full rounded-md border border-[#d9d9d9] bg-white pr-10 text-[13px] text-[#202124] outline-none transition placeholder:text-[#777] focus:border-[#a6a6a6] focus:ring-2 focus:ring-[#f3f3f3] ${variant === "hero" ? "h-12 pl-11 text-sm" : "h-10 pl-10 text-[13px]"}`}
      />
      {status === "searching" && normalizedQuery.length >= 2 && (
        <LoaderCircle
          aria-label="Searching workspace"
          size={16}
          className="absolute right-3 top-1/2 animate-spin text-violet-600"
        />
      )}
      {showResults && (
        <div
          id={`${instanceId}-results`}
          role="listbox"
          aria-label="Workspace search results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70vh,32rem)] overflow-y-auto rounded-md border border-[#dedede] bg-white p-1.5 shadow-xl"
        >
          {(scope === "student" || normalizedQuery.length < 2) && suggestions.length > 0 ? (
            <>
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {normalizedQuery ? "Suggested destinations" : "Quick access"}
              </p>
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${instanceId}-result-${suggestion.id}`}
                  aria-selected={activeIndex === index}
                  key={suggestion.id}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(suggestion)}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition ${
                    activeIndex === index ? "bg-blue-50" : "hover:bg-blue-50"
                  } focus-visible:bg-blue-50 focus-visible:outline-none`}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{suggestion.title}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {suggestion.category}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">{suggestion.description}</span>
                </button>
              ))}
            </>
          ) : status === "error" ? (
            <p role="alert" className="px-3 py-3 text-sm text-rose-700">
              Search is temporarily unavailable. Please try again.
            </p>
          ) : status === "searching" ? (
            <p role="status" className="px-3 py-3 text-sm text-slate-500">Searching the workspace...</p>
          ) : results.length > 0 ? (
            results.map((result, index) => (
              <button
                type="button"
                role="option"
                id={`${instanceId}-result-${result.id}`}
                aria-selected={activeIndex === index}
                key={result.id}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openResult(result)}
                className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition ${
                  activeIndex === index ? "bg-violet-50" : "hover:bg-violet-50"
                } focus-visible:bg-violet-50 focus-visible:outline-none`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{result.title}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {result.category}
                  </span>
                </span>
                <span className="text-xs text-slate-500">{result.description}</span>
              </button>
            ))
          ) : (
            <p role="status" className="px-3 py-3 text-sm text-slate-500">
              {scope === "student"
                ? "No matching student portal pages or services."
                : scope === "teaching"
                  ? "No matching teaching records or pages."
                  : "No matching students, staff, library records, or workspace pages."}
            </p>
          )}
          {navigationOptions.length > 0 && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Use ↑/↓ to select and Enter to open.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
