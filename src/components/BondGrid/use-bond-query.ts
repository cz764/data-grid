"use client";

import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { createBondQuery, fetchBondPage } from "@/api/bonds";
import type { BondRecord } from "@/data/bonds";
import { toGridFilters, type BondGridQuery } from "@/data/bond-search-params";
import { autoLoadPageLimit, type GridPage } from "@/data/grid";

import { useQuoteStream } from "./use-quote-stream";

interface PageCursor {
  snapshotId: string;
  cursor: string;
}

function isNewer(candidate: BondRecord, current: BondRecord) {
  return BigInt(candidate.version) > BigInt(current.version);
}

export function bondQueryKey(query: BondGridQuery) {
  return ["bonds", toGridFilters(query), query.sort] as const;
}

export function useBondQuery(query: BondGridQuery, initialPage?: GridPage) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => bondQueryKey(query), [query]);
  const queryKeyString = JSON.stringify(queryKey);
  const [initialSnapshot] = useState(() =>
    initialPage
      ? { key: queryKeyString, data: { pages: [initialPage], pageParams: [null] } as InfiniteData<GridPage, PageCursor | null> }
      : undefined,
  );
  const initialData = initialSnapshot?.key === queryKeyString ? initialSnapshot.data : undefined;

  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      pageParam
        ? fetchBondPage(pageParam.snapshotId, pageParam.cursor, signal)
        : createBondQuery({ filters: toGridFilters(query), sort: query.sort }, signal),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor
        ? { snapshotId: lastPage.snapshotId, cursor: lastPage.nextCursor }
        : undefined,
    initialData,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const [autoLoad, setAutoLoad] = useState({ key: queryKeyString, count: 0 });
  const autoLoadedPages = autoLoad.key === queryKeyString ? autoLoad.count : 0;
  const autoLoadMore = autoLoadedPages < autoLoadPageLimit;
  const { fetchNextPage, isFetchingNextPage, isPlaceholderData, refetch } = result;
  const hasNextPage = result.hasNextPage && !isPlaceholderData;

  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    if (autoLoadMore) {
      setAutoLoad({ key: queryKeyString, count: autoLoadedPages + 1 });
    }

    void fetchNextPage();
  }, [autoLoadMore, autoLoadedPages, queryKeyString, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const retry = useCallback(() => {
    if (result.data && result.isFetchNextPageError) {
      void fetchNextPage();
    } else {
      void refetch();
    }
  }, [result.data, result.isFetchNextPageError, fetchNextPage, refetch]);

  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  const onVisibleRowsChange = useCallback((ids: Array<string | number>) => setVisibleIds(ids.map(String)), []);

  const applyRows = useCallback(
    (rows: BondRecord[]) => {
      const latest = new Map(rows.map((row) => [row.id, row]));

      queryClient.setQueryData<InfiniteData<GridPage, PageCursor | null>>(queryKey, (data) => {
        if (!data) {
          return data;
        }

        let changed = false;
        const pages = data.pages.map((page) => {
          let pageChanged = false;
          const nextRows = page.rows.map((row) => {
            const candidate = latest.get(row.id);

            if (candidate && isNewer(candidate, row)) {
              pageChanged = true;

              return { ...row, ...candidate };
            }

            return row;
          });

          changed ||= pageChanged;

          return pageChanged ? { ...page, rows: nextRows } : page;
        });

        return changed ? { ...data, pages } : data;
      });
    },
    [queryClient, queryKey],
  );

  const transport = useQuoteStream(visibleIds, applyRows);

  const rows = useMemo(() => result.data?.pages.flatMap((page) => page.rows) ?? [], [result.data]);
  const totalCount = result.data?.pages[0]?.totalCount;

  return {
    rows,
    totalCount,
    hasMore: hasNextPage,
    autoLoadMore,
    isLoading: result.isPending || isFetchingNextPage,
    isRefreshing: isPlaceholderData || (result.isFetching && !result.isPending && !isFetchingNextPage),
    error: isPlaceholderData ? null : result.error,
    loadMore,
    retry,
    onVisibleRowsChange,
    transport,
  };
}
