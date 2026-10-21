"use client";

import { useCallback, useState } from "react";

import { BondToolbar } from "@/components/BondToolbar";
import { DataGrid, type DataGridSort } from "@/components/DataGrid";
import { isBondSortField, type BondRecord } from "@/data/bonds";
import { serializeBondGridQuery, type BondGridQuery } from "@/data/bond-search-params";
import type { GridPage } from "@/data/grid";

import { bondColumns } from "./columns";
import { useBondQuery } from "./use-bond-query";

export interface BondGridProps {
  initialQuery: BondGridQuery;
  initialPage?: GridPage;
  name?: string;
}

function syncUrl(query: BondGridQuery) {
  const params = serializeBondGridQuery(query).toString();
  const url = `${window.location.pathname}${params ? `?${params}` : ""}`;

  window.history.replaceState(window.history.state, "", url);
}

export function BondGrid({ initialQuery, initialPage, name = "Bond market watch" }: BondGridProps) {
  const [query, setQuery] = useState(initialQuery);
  const bonds = useBondQuery(query, initialPage);

  const updateQuery = useCallback((next: BondGridQuery) => {
    setQuery(next);
    syncUrl(next);
  }, []);

  const handleSortChange = useCallback(
    (sort: DataGridSort<BondRecord>) => {
      if (isBondSortField(sort.key)) {
        updateQuery({ ...query, sort: { field: sort.key, direction: sort.direction } });
      }
    },
    [query, updateQuery],
  );

  return (
    <DataGrid
      id="bond-grid"
      className="min-h-0 flex-1"
      name={name}
      eyebrow={bonds.transport === "stream" ? "Live bond inventory" : "Bond inventory · polling"}
      toolbar={<BondToolbar query={query} onQueryChange={updateQuery} />}
      data={bonds.rows}
      columns={bondColumns}
      getRowId={(bond) => bond.id}
      totalCount={bonds.totalCount}
      sort={{ key: query.sort.field, direction: query.sort.direction }}
      onSortChange={handleSortChange}
      isLoading={bonds.isLoading}
      isRefreshing={bonds.isRefreshing}
      error={bonds.error}
      hasMore={bonds.hasMore}
      autoLoadMore={bonds.autoLoadMore}
      onLoadMore={bonds.loadMore}
      onRetry={bonds.retry}
      onVisibleRowsChange={bonds.onVisibleRowsChange}
    />
  );
}
