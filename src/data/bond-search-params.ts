import { isBondSector, isBondSortField, type BondSector } from "./bonds";
import { defaultGridSort, type GridFilters, type GridSort } from "./grid";

export interface BondGridQuery {
  search: string;
  sector: readonly BondSector[];
  creditRating: readonly string[];
  sort: GridSort;
}

export type SearchParamsInput = Record<string, string | string[] | undefined> | URLSearchParams;

function readAll(params: SearchParamsInput, key: string): string[] {
  if (params instanceof URLSearchParams) {
    return params.getAll(key);
  }

  const value = params[key];

  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function parseBondGridQuery(params: SearchParamsInput): BondGridQuery {
  const [sortValue] = readAll(params, "sort");
  const [field, direction] = sortValue?.split(":") ?? [];
  const sort: GridSort =
    field && isBondSortField(field)
      ? { field, direction: direction === "desc" ? "desc" : "asc" }
      : defaultGridSort;

  return {
    search: readAll(params, "q")[0]?.trim() ?? "",
    sector: unique(readAll(params, "sector").filter(isBondSector)),
    creditRating: unique(readAll(params, "rating").map((value) => value.trim()).filter(Boolean)),
    sort,
  };
}

export function serializeBondGridQuery(query: BondGridQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.search) {
    params.set("q", query.search);
  }

  query.sector.forEach((sector) => params.append("sector", sector));
  query.creditRating.forEach((rating) => params.append("rating", rating));

  if (query.sort.field !== defaultGridSort.field || query.sort.direction !== defaultGridSort.direction) {
    params.set("sort", `${query.sort.field}:${query.sort.direction}`);
  }

  return params;
}

export function toGridFilters(query: BondGridQuery): GridFilters {
  const filters: GridFilters = {};

  if (query.search) {
    filters.cusip = query.search;
    filters.ticker = query.search;
  }

  if (query.sector.length > 0) {
    filters.sector = query.sector;
  }

  if (query.creditRating.length > 0) {
    filters.creditRating = query.creditRating;
  }

  return filters;
}
