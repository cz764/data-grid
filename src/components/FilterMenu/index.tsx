"use client";

import { useEffect, useId, useRef } from "react";

export interface FilterMenuOption {
  value: string;
  label: string;
}

export interface FilterMenuProps {
  label: string;
  options: readonly FilterMenuOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function FilterMenu({ label, options, selected, onChange }: FilterMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const legendId = useId();

  useEffect(() => {
    const details = detailsRef.current;

    if (!details) {
      return;
    }

    const closeOnOutsideInteraction = (event: Event) => {
      if (details.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("focusin", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("focusin", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const toggle = (value: string, checked: boolean) => {
    onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  };
  const hasSelection = selected.length > 0;

  return (
    <details className="group relative" ref={detailsRef}>
      <summary
        className={`inline-flex h-9.5 cursor-pointer list-none items-center gap-2 rounded-full border bg-surface px-3.5 text-sm font-medium text-ink select-none hover:border-accent-soft [&::-webkit-details-marker]:hidden after:size-1.5 after:-translate-y-0.5 after:rotate-45 after:border-r-[1.5px] after:border-b-[1.5px] after:border-current after:content-[''] group-open:after:translate-y-px group-open:after:rotate-[225deg] ${focusRing} ${hasSelection ? "border-accent-soft bg-row-hover" : "border-border"}`}
      >
        {label}
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emphasis px-1.5 text-[0.7rem] font-bold text-white ${hasSelection ? "" : "invisible"}`}
          aria-hidden={!hasSelection}
        >
          {selected.length}
        </span>
      </summary>
      <fieldset
        className="absolute top-[calc(100%+6px)] left-0 z-10 m-0 grid min-w-[220px] gap-0.5 rounded-xl border border-border bg-surface p-2.5 shadow-[0_16px_40px_rgb(18_27_58/14%)]"
        aria-labelledby={legendId}
      >
        <legend id={legendId} className="sr-only">
          {label}
        </legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.75 text-sm text-ink hover:bg-row-hover"
          >
            <input
              type="checkbox"
              className="m-0 accent-accent"
              checked={selected.includes(option.value)}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
        {hasSelection ? (
          <button
            type="button"
            className={`mt-1.5 cursor-pointer rounded-md border-t border-border-subtle px-2 py-1.75 text-left text-xs font-semibold text-accent hover:text-accent-strong ${focusRing}`}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        ) : null}
      </fieldset>
    </details>
  );
}
