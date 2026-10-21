import type { BondField, BondRecord, BondSector, BondSortField } from "./bonds";

export type SortDirection = "asc" | "desc";

export interface GridSort {
  field: BondSortField;
  direction: SortDirection;
}

export interface GridFilters {
  cusip?: string;
  ticker?: string;
  sector?: readonly BondSector[];
  creditRating?: readonly string[];
}

export interface GridQueryRequest {
  fields?: readonly BondField[];
  filters?: GridFilters;
  sort?: GridSort;
  pageSize?: number;
}

export interface GridPage {
  snapshotId: string;
  queryFingerprint: string;
  expiresAt: string;
  sort: GridSort;
  filters: GridFilters;
  fields: readonly BondField[];
  pageSize: number;
  totalCount: number;
  rows: BondRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GridCurrentRowsResponse {
  rows: BondRecord[];
}

export interface GridErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  requestId: string;
}

export const defaultGridSort: GridSort = { field: "ticker", direction: "asc" };
export const defaultPageSize = 100;
export const maxPageSize = 500;
export const maxCurrentRowIds = 50;
export const autoLoadPageLimit = 6;
