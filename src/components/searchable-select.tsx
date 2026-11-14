"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RequiredMark } from "@/components/required-mark";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function SearchableSelect({
  label,
  name,
  options,
  defaultValue = "",
  placeholder = "Search options...",
  emptyLabel = "No matching options.",
  required = false,
  autoSubmit = false,
}: {
  label: string;
  name: string;
  options: SearchableSelectOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  autoSubmit?: boolean;
}) {
  const listId = useId();
  const selectedOption = options.find((option) => option.value === defaultValue);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const filteredOptions = options
    .filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .slice(0, 40);

  function choose(option: SearchableSelectOption) {
    setSelectedValue(option.value);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
    if (autoSubmit) {
      window.setTimeout(() => inputRef.current?.form?.requestSubmit(), 0);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "ArrowDown" && filteredOptions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % filteredOptions.length);
    } else if (event.key === "ArrowUp" && filteredOptions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => index <= 0 ? filteredOptions.length - 1 : index - 1);
    } else if (event.key === "Enter" && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    }
  }

  return (
    <div className="relative block space-y-1.5 text-sm font-medium text-slate-700">
      <label htmlFor={`${listId}-input`}>
        {label} {required && <RequiredMark />}
      </label>
      <input type="hidden" name={name} value={selectedValue} />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        value={query}
        required={required}
        pattern={required ? (selectedValue ? escapePattern(options.find((option) => option.value === selectedValue)?.label ?? "") : "(?!)") : undefined}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedValue("");
          setActiveIndex(-1);
          setOpen(true);
        }}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.value}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={selectedValue === option.value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeIndex === index || selectedValue === option.value ? "bg-violet-50 text-violet-900" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
