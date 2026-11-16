"use client";

import { useEffect, useRef, type FormHTMLAttributes, type ReactNode, type ChangeEvent } from "react";

export function SmartFilterForm({
  children,
  onChange,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    onChange?.(event);
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.closest("[data-searchable-select-input]")) return;
    if (target.type === "hidden" || target.type === "submit" || target.type === "button") return;

    if (timer.current !== null) window.clearTimeout(timer.current);
    const delay = target instanceof HTMLInputElement && ["search", "text"].includes(target.type) ? 200 : 0;
    timer.current = window.setTimeout(() => formRef.current?.requestSubmit(), delay);
  }

  return (
    <form {...props} ref={formRef} data-smart-filter="" onChange={handleChange}>
      {children}
    </form>
  );
}
