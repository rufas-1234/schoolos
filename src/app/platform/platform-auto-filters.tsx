"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";

export type PlatformFilterSelect = { name: string; label: string; value: string; options: Array<{ value: string; label: string }> };

export function PlatformAutoFilters({
  action,
  search,
  searchPlaceholder,
  selects,
  suggestions = [],
}: {
  action: string;
  search: string;
  searchPlaceholder: string;
  selects: PlatformFilterSelect[];
  suggestions?: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionListId = useId();
  const [searchText, setSearchText] = useState(search);

  useEffect(() => setSearchText(search), [search]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function submitSoon() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => formRef.current?.requestSubmit(), 350);
  }

  return <form ref={formRef} action={action} method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_repeat(auto-fit,minmax(160px,190px))] sm:items-end">
    <label className="block min-w-0 space-y-1.5 text-xs font-semibold text-slate-600"><span>Search</span><span className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="search" type="search" list={suggestions.length ? suggestionListId : undefined} maxLength={100} value={searchText} onChange={(event) => { setSearchText(event.currentTarget.value); submitSoon(); }} placeholder={searchPlaceholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"/>{suggestions.length > 0 && <datalist id={suggestionListId}>{suggestions.slice(0, 100).map((suggestion) => <option key={suggestion} value={suggestion}/>)}</datalist>}</span></label>
    {selects.map((select) => <label key={select.name} className="block min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">{select.label}<select name={select.name} defaultValue={select.value} onChange={() => formRef.current?.requestSubmit()} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">{select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    <p className="text-xs text-slate-400 sm:col-span-full">Filters update automatically.</p>
  </form>;
}
