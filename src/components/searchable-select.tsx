"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
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
  disabled = false,
  onValueChange,
  hidden = false,
}: {
  label: string;
  name: string;
  options: SearchableSelectOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  autoSubmit?: boolean;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  hidden?: boolean;
}) {
  const listId = useId();
  const initialValue = options.some((option) => option.value === defaultValue) ? defaultValue : "";
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const [query, setQuery] = useState(selectedValue ? selectedOption?.label ?? "" : "");
  const [open, setOpen] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterQuery = showAllOptions || (open && selectedValue && query === selectedOption?.label) ? "" : query;
  const filteredOptions = options
    .filter((option) => option.label.toLocaleLowerCase().includes(filterQuery.trim().toLocaleLowerCase()))
    .slice(0, 40);

  function choose(option: SearchableSelectOption) {
    setSelectedValue(option.value);
    setQuery("");
    setOpen(false);
    setShowAllOptions(false);
    setActiveIndex(-1);
    onValueChange?.(option.value);
    const form = inputRef.current?.form;
    if (autoSubmit || form?.hasAttribute("data-smart-filter")) {
      window.setTimeout(() => {
        if (form?.hasAttribute("data-smart-filter")) form.submit();
        else form?.requestSubmit();
      }, 0);
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
    <div hidden={hidden} className="relative block space-y-1.5 text-sm font-medium text-slate-700">
      <label htmlFor={`${listId}-input`}>
        {label} {required && <RequiredMark />}
      </label>
      <input type="hidden" name={name} value={selectedValue} disabled={disabled} />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        data-searchable-select-input=""
        type="text"
        role="combobox"
        autoComplete="off"
        value={!open && selectedOption ? selectedOption.label : query}
        required={required}
        disabled={disabled}
        pattern={required ? (selectedValue ? escapePattern(options.find((option) => option.value === selectedValue)?.label ?? "") : "(?!)") : undefined}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        placeholder={placeholder}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setShowAllOptions(!query);
          if (selectedValue) setQuery("");
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedValue("");
          setShowAllOptions(false);
          setActiveIndex(-1);
          setOpen(true);
          onValueChange?.("");
        }}
        className="cloudflare-search-input w-full rounded-md border border-[#d9d9d9] bg-white px-3 py-2 pr-10 text-[13px] text-[#202124] outline-none placeholder:text-[#777] focus:border-[#a6a6a6] focus:ring-2 focus:ring-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label} dropdown`}
        aria-expanded={open}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((value) => !value);
          setShowAllOptions(true);
          setActiveIndex(-1);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-8 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-[#dedede] bg-white p-1 shadow-lg"
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.value}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={selectedValue === option.value}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeIndex === index || selectedValue === option.value ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
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
