"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type AcademicSearchOption = {
  id: string;
  type: "Branch" | "Class" | "Class section";
  label: string;
  searchText: string;
  section: "branches" | "classes" | "sections";
};

export function AcademicQuickSearch({ options }: { options: AcademicSearchOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const terms = normalizedQuery.split(/\s+/);
    return options
      .filter((option) => {
        const searchableText = `${option.type} ${option.label}`.toLocaleLowerCase();
        return terms.every((term) => searchableText.includes(term));
      })
      .slice(0, 10);
  }, [normalizedQuery, options]);
  const showResults = focused && normalizedQuery.length > 0;

  function openResult(option: AcademicSearchOption) {
    setFocused(false);
    setQuery("");
    router.push(`/admin/academics?section=${option.section}&search=${encodeURIComponent(option.searchText)}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = activeIndex >= 0 ? results[activeIndex] : results[0];
    if (selected) openResult(selected);
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
      className="relative max-w-2xl"
    >
      <label className="sr-only" htmlFor="academic-quick-search">
        Quick search branches, classes, and class sections
      </label>
      <Search
        aria-hidden="true"
        size={17}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        id="academic-quick-search"
        role="combobox"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={showResults ? "academic-quick-search-results" : undefined}
        aria-expanded={showResults}
        aria-haspopup="listbox"
        aria-activedescendant={
          activeIndex >= 0 && results[activeIndex]
            ? `academic-result-${results[activeIndex].id}`
            : undefined
        }
        placeholder="Quick search branches, classes, or sections..."
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
      {showResults && (
        <div
          id="academic-quick-search-results"
          role="listbox"
          aria-label="Academic search results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {results.length > 0 ? (
            results.map((option, index) => (
              <button
                type="button"
                role="option"
                id={`academic-result-${option.id}`}
                aria-selected={activeIndex === index}
                key={option.id}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openResult(option)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  activeIndex === index ? "bg-violet-50" : "hover:bg-violet-50"
                } focus-visible:bg-violet-50 focus-visible:outline-none`}
              >
                <span className="mt-0.5 shrink-0 rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                  {option.type}
                </span>
                <span className="min-w-0 text-sm font-medium text-slate-800">{option.label}</span>
              </button>
            ))
          ) : (
            <p role="status" className="px-3 py-3 text-sm text-slate-500">
              No branches, classes, or sections match “{query.trim()}”.
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
