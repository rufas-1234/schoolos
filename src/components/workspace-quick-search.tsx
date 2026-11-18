"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { searchWorkspace, type WorkspaceSearchResult } from "@/app/admin/workspace-search-actions";

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
  const showResults = focused && normalizedQuery.length >= 2;

  function openResult(result: WorkspaceSearchResult) {
    setFocused(false);
    setQuery("");
    router.push(result.href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedResult = results[activeIndex] ?? results[0];
    if (selectedResult) openResult(selectedResult);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setFocused(false);
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
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
          activeIndex >= 0 && results[activeIndex]
            ? `workspace-result-${results[activeIndex].id}`
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
          {status === "error" ? (
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
          {results.length > 0 && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Use ↑/↓ to select and Enter to open.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
