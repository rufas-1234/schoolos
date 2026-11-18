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

export function WorkspaceQuickSearch({ scope = "workspace" }: { scope?: "workspace" | "teaching" }) {
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
  }, [query]);

  const normalizedQuery = query.trim();
  const results = resultState.query === normalizedQuery ? resultState.results : [];
  const suggestions = scope === "teaching"
    ? teachingSuggestions.filter((suggestion) =>
      !normalizedQuery ||
      `${suggestion.title} ${suggestion.description} ${suggestion.searchTerms?.join(" ") ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery.toLocaleLowerCase()),
    )
    : [];
  const navigationOptions = normalizedQuery.length >= 2 ? results : suggestions;
  const showResults = focused &&
    (normalizedQuery.length >= 2 || (scope === "teaching" && normalizedQuery.length < 2));

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
      className="relative mx-2 min-w-0 flex-1 sm:mx-4 sm:max-w-xl"
    >
      <label className="sr-only" htmlFor="workspace-quick-search">
        {scope === "teaching"
          ? "Search your classes, exam titles, subjects, and teaching pages"
          : "Search students, staff, classes, exams, library books and members, inventory, fees, accounts, and reports"}
      </label>
      <Search
        aria-hidden="true"
        size={17}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        id="workspace-quick-search"
        role="combobox"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          requestId.current += 1;
          setActiveIndex(-1);
          setQuery(event.target.value);
          setStatus(event.target.value.trim().length >= 2 ? "searching" : "idle");
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={showResults ? "workspace-quick-search-results" : undefined}
        aria-expanded={showResults}
        aria-haspopup="listbox"
        aria-activedescendant={
          activeIndex >= 0 && navigationOptions[activeIndex]
            ? `workspace-result-${navigationOptions[activeIndex].id}`
            : undefined
        }
        placeholder={scope === "teaching"
          ? "Search your classes, exams, subjects..."
          : "Search students, staff, library, inventory, fees..."}
        className="admin-quick-search-input h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
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
          id="workspace-quick-search-results"
          role="listbox"
          aria-label="Workspace search results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70vh,32rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {normalizedQuery.length < 2 && suggestions.length > 0 ? (
            <>
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {normalizedQuery ? "Suggested destinations" : "Quick access"}
              </p>
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  id={`workspace-result-${suggestion.id}`}
                  aria-selected={activeIndex === index}
                  key={suggestion.id}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(suggestion)}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition ${
                    activeIndex === index ? "bg-violet-50" : "hover:bg-violet-50"
                  } focus-visible:bg-violet-50 focus-visible:outline-none`}
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
                id={`workspace-result-${result.id}`}
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
              {scope === "teaching"
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
