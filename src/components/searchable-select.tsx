"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
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
  const [menuPlacement, setMenuPlacement] = useState<"above" | "below">("below");
  const [menuMaxHeight, setMenuMaxHeight] = useState(240);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const [dialogPortal, setDialogPortal] = useState<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterQuery = showAllOptions || (open && selectedValue && query === selectedOption?.label) ? "" : query;
  const filteredOptions = options
    .filter((option) => option.label.toLocaleLowerCase().includes(filterQuery.trim().toLocaleLowerCase()))
    .slice(0, 40);

  const updateMenuPlacement = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const inputBounds = input.getBoundingClientRect();
    const dialog = input.closest<HTMLDialogElement>("dialog[open]");
    const dialogBounds = dialog?.getBoundingClientRect();
    const dialogContent = input.closest<HTMLElement>(".admin-dialog-content");
    const contentBounds = dialogContent?.getBoundingClientRect();
    const topBoundary = Math.max(contentBounds?.top ?? 0, 8);
    let bottomBoundary = Math.min(contentBounds?.bottom ?? window.innerHeight, window.innerHeight) - 8;

    const stickyActions = dialogContent?.querySelector<HTMLElement>(".admin-dialog-form-actions");
    const actionsBounds = stickyActions?.getBoundingClientRect();
    if (
      actionsBounds &&
      actionsBounds.top > inputBounds.bottom &&
      actionsBounds.top < (contentBounds?.bottom ?? window.innerHeight)
    ) {
      bottomBoundary = Math.min(bottomBoundary, actionsBounds.top - 8);
    }

    const spaceAbove = Math.max(0, inputBounds.top - topBoundary - 8);
    const spaceBelow = Math.max(0, bottomBoundary - inputBounds.bottom - 8);
    const placement = spaceBelow < 180 && spaceAbove > spaceBelow ? "above" : "below";
    const maxHeight = Math.min(240, placement === "above" ? spaceAbove : spaceBelow);
    const top = placement === "above"
      ? inputBounds.top - maxHeight - 4
      : inputBounds.bottom + 4;
    setMenuPlacement(placement);
    setMenuMaxHeight(maxHeight);
    setDialogPortal(dialog);
    setMenuPosition({
      top: dialogBounds ? top - dialogBounds.top : top,
      left: dialogBounds ? inputBounds.left - dialogBounds.left : inputBounds.left,
      width: inputBounds.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPlacement();
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);
    return () => {
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [open, updateMenuPlacement]);

  useEffect(() => {
    if (!dialogPortal) return;
    const closeMenu = () => {
      setOpen(false);
      setDialogPortal(null);
    };
    dialogPortal.addEventListener("close", closeMenu);
    return () => dialogPortal.removeEventListener("close", closeMenu);
  }, [dialogPortal]);

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
      updateMenuPlacement();
      setActiveIndex((index) => (index + 1) % filteredOptions.length);
    } else if (event.key === "ArrowUp" && filteredOptions.length > 0) {
      event.preventDefault();
      setOpen(true);
      updateMenuPlacement();
      setActiveIndex((index) => index <= 0 ? filteredOptions.length - 1 : index - 1);
    } else if (event.key === "Enter" && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    }
  }

  const optionList = open ? (
    <div
      id={listId}
      role="listbox"
      aria-label={`${label} options`}
      className={`absolute z-[60] overflow-y-auto rounded-md border border-[#dedede] bg-white p-1 shadow-lg ${
        dialogPortal
          ? ""
          : `left-0 right-0 ${menuPlacement === "above" ? "bottom-full mb-1" : "top-full mt-1"}`
      }`}
      style={dialogPortal
        ? {
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuMaxHeight,
            right: "auto",
            bottom: "auto",
          }
        : { maxHeight: menuMaxHeight }}
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
  ) : null;

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
          updateMenuPlacement();
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
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) updateMenuPlacement();
          setShowAllOptions(true);
          setActiveIndex(-1);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-8 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {optionList && (dialogPortal ? createPortal(optionList, dialogPortal) : optionList)}
    </div>
  );
}
