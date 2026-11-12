"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { searchStudents, type StudentSearchResult } from "@/app/admin/students/search-actions";

export function StudentQuickSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultState, setResultState] = useState<{
    query: string;
    results: StudentSearchResult[];
  }>({ query: "", results: [] });
  const [status, setStatus] = useState<{
    query: string;
    value: "idle" | "searching" | "error";
  }>({ query: "", value: "idle" });
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentRequestId = ++requestId.current;
    if (normalizedQuery.length < 1) return;
    searchStudents(normalizedQuery)
      .then((students) => {
        if (requestId.current === currentRequestId) {
          setResultState({ query: normalizedQuery, results: students });
          setStatus({ query: normalizedQuery, value: "idle" });
        }
      })
      .catch(() => {
        if (requestId.current === currentRequestId) {
          setResultState({ query: normalizedQuery, results: [] });
          setStatus({ query: normalizedQuery, value: "error" });
        }
      });
  }, [query]);

  function openStudent(student: StudentSearchResult) {
    setFocused(false);
    router.push(`/admin/students?search=${encodeURIComponent(student.publicId)}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeIndex >= 0 && results[activeIndex]) {
      openStudent(results[activeIndex]);
      return;
    }
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setFocused(false);
    router.push(`/admin/students?search=${encodeURIComponent(normalizedQuery)}`);
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

  const normalizedQuery = query.trim();
  const results = resultState.query === normalizedQuery ? resultState.results : [];
  const searchStatus = status.query === normalizedQuery ? status.value : "idle";
  const showResults = focused && normalizedQuery.length >= 1;

  return (
    <form
      role="search"
      onSubmit={submitSearch}
      className="relative mx-2 min-w-0 flex-1 sm:mx-4 sm:max-w-xl"
    >
      <label className="sr-only" htmlFor="student-quick-search">
        Quick search students by name, student number, or ID
      </label>
      <Search
        aria-hidden="true"
        size={17}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        id="student-quick-search"
        role="combobox"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const normalizedNextQuery = nextQuery.trim();
          requestId.current += 1;
          setActiveIndex(-1);
          setQuery(nextQuery);
          setStatus({
            query: normalizedNextQuery,
            value: normalizedNextQuery.length >= 1 ? "searching" : "idle",
          });
          if (normalizedNextQuery.length < 2) {
            setResultState({ query: normalizedNextQuery, results: [] });
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={showResults ? "student-quick-search-results" : undefined}
        aria-expanded={showResults}
        aria-haspopup="listbox"
        aria-activedescendant={
          activeIndex >= 0 && results[activeIndex]
            ? `student-result-${results[activeIndex].publicId}`
            : undefined
        }
        placeholder="Search students by name, number, or ID..."
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
      />
      {searchStatus === "searching" && (
        <LoaderCircle
          aria-label="Searching students"
          size={16}
          className="absolute right-3 top-1/2 animate-spin text-violet-600"
        />
      )}
      {showResults && (
        <div
          id="student-quick-search-results"
          role="listbox"
          aria-label="Student search results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {searchStatus === "error" ? (
            <p role="alert" className="px-3 py-3 text-sm text-rose-700">
              Student search is temporarily unavailable. Please try again.
            </p>
          ) : searchStatus === "searching" && results.length === 0 ? (
            <p role="status" className="px-3 py-3 text-sm text-slate-500">Searching students...</p>
          ) : results.length > 0 ? (
            results.map((student, index) => (
              <button
                type="button"
                role="option"
                id={`student-result-${student.publicId}`}
                aria-selected={activeIndex === index}
                key={student.publicId}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openStudent(student)}
                className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition ${
                  activeIndex === index ? "bg-violet-50" : "hover:bg-violet-50"
                } focus-visible:bg-violet-50 focus-visible:outline-none`}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {student.firstName} {student.lastName}
                </span>
                <span className="text-xs text-slate-500">
                  {student.admissionNumber
                    ? `Student number: ${student.admissionNumber}`
                    : "No student number"}
                  {" · "}
                  ID: {student.publicId}
                </span>
              </button>
            ))
          ) : (
            <p role="status" className="px-3 py-3 text-sm text-slate-500">
              No students match “{normalizedQuery}”.
            </p>
          )}
          {results.length > 0 && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Use ↑/↓ to select, Enter to open, or keep typing to refine.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
