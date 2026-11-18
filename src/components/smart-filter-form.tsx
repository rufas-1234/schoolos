"use client";

import { useEffect, useRef, type FormHTMLAttributes, type ReactNode, type ChangeEvent, type SubmitEvent } from "react";

export function SmartFilterForm({
  children,
  onChange,
  onSubmit,
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
    const delay = target instanceof HTMLInputElement && ["search", "text"].includes(target.type) ? 350 : 0;
    timer.current = window.setTimeout(() => formRef.current?.requestSubmit(), delay);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    onSubmit?.(event);
  }

  return (
    <form {...props} ref={formRef} data-smart-filter="" onChange={handleChange} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
