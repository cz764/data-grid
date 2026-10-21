"use client";

import { useEffect, useState } from "react";

import { FilterMenu } from "@/components/FilterMenu";
import { bondCreditRatings, bondSectorLabels, bondSectors, isBondSector } from "@/data/bonds";
import type { BondGridQuery } from "@/data/bond-search-params";

export interface BondToolbarProps {
  query: BondGridQuery;
  onQueryChange: (query: BondGridQuery) => void;
}

const sectorOptions = bondSectors.map((sector) => ({ value: sector, label: bondSectorLabels[sector] }));
const ratingOptions = bondCreditRatings.map((rating) => ({ value: rating, label: rating }));
const searchDebounceMs = 250;

export function BondToolbar({ query, onQueryChange }: BondToolbarProps) {
  const [search, setSearch] = useState(query.search);
  const [syncedSearch, setSyncedSearch] = useState(query.search);

  if (query.search !== syncedSearch) {
    setSyncedSearch(query.search);

    if (query.search !== search.trim()) {
      setSearch(query.search);
    }
  }

  useEffect(() => {
    if (search.trim() === query.search) {
      return;
    }

    const timeout = setTimeout(() => onQueryChange({ ...query, search: search.trim() }), searchDebounceMs);

    return () => clearTimeout(timeout);
  }, [search, query, onQueryChange]);

  const hasFilters = query.search || query.sector.length > 0 || query.creditRating.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2.5" role="search" aria-label="Filter bonds">
      <input
        type="search"
        className="h-9.5 min-w-0 flex-[1_1_240px] rounded-full border border-border bg-surface px-3.5 text-[0.9rem] text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-[480px]:basis-full"
        placeholder="search CUSIP or ticker"
        aria-label="Search CUSIP or ticker"
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu
          label="Sector"
          options={sectorOptions}
          selected={query.sector}
          onChange={(sector) => onQueryChange({ ...query, sector: sector.filter(isBondSector) })}
        />
        <FilterMenu
          label="Rating"
          options={ratingOptions}
          selected={query.creditRating}
          onChange={(creditRating) => onQueryChange({ ...query, creditRating })}
        />
        <button
          type="button"
          className={`h-9.5 cursor-pointer rounded-full px-3 text-sm font-semibold text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${hasFilters ? "" : "invisible"}`}
          aria-hidden={!hasFilters}
          tabIndex={hasFilters ? 0 : -1}
          onClick={() => {
            setSearch("");
            onQueryChange({ ...query, search: "", sector: [], creditRating: [] });
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
