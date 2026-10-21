import { createHash, randomUUID } from "node:crypto";

import {
  bondFields,
  isBondField,
  isBondSector,
  isBondSortField,
  type BondField,
  type BondRecord,
} from "@/data/bonds";
import {
  defaultGridSort,
  defaultPageSize,
  maxCurrentRowIds,
  maxPageSize,
  type GridFilters,
  type GridPage,
  type GridQueryRequest,
  type GridSort,
} from "@/data/grid";

import { getBondStore, type BondStore } from "./bond-store";
import { decodeCursor, encodeCursor } from "./cursor";
import { GridError } from "./errors";

interface NormalizedQuery {
  fields: readonly BondField[];
  filters: GridFilters;
  sort: GridSort;
  pageSize: number;
}

interface Snapshot extends NormalizedQuery {
  id: string;
  queryFingerprint: string;
  expiresAt: string;
  orderedIds: readonly string[];
}

const snapshotLifetimeMs = 15 * 60 * 1000;
const snapshotsKey = Symbol.for("bond-data-grid.snapshots");
const globalSnapshots = globalThis as typeof globalThis & { [snapshotsKey]?: Map<string, Snapshot> };

function getSnapshots() {
  globalSnapshots[snapshotsKey] ??= new Map();

  return globalSnapshots[snapshotsKey];
}

function purgeExpiredSnapshots(snapshots: Map<string, Snapshot>) {
  const now = Date.now();

  for (const [id, snapshot] of snapshots) {
    if (new Date(snapshot.expiresAt).getTime() < now) {
      snapshots.delete(id);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringList(value: unknown, name: string, validate?: (item: string) => boolean) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new GridError(400, "INVALID_FILTER", `${name} must be an array of strings.`);
  }

  const items = Array.from(new Set((value as string[]).map((item) => item.trim()).filter(Boolean)));

  if (validate && items.some((item) => !validate(item))) {
    throw new GridError(400, "INVALID_FILTER", `${name} contains an unsupported value.`);
  }

  return items.length > 0 ? items : undefined;
}

function normalizePrefix(value: unknown, name: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new GridError(400, "INVALID_FILTER", `${name} must be a string.`);
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

export function normalizeQuery(input: unknown): NormalizedQuery {
  if (!isRecord(input)) {
    throw new GridError(400, "INVALID_QUERY", "The query body must be an object.");
  }

  const request = input as GridQueryRequest;
  let fields: readonly BondField[] = bondFields;

  if (request.fields !== undefined) {
    if (!Array.isArray(request.fields) || request.fields.length === 0) {
      throw new GridError(400, "INVALID_PROJECTION", "fields must be a non-empty array.");
    }

    const unsupported = request.fields.find((field) => typeof field !== "string" || !isBondField(field));

    if (unsupported !== undefined) {
      throw new GridError(400, "INVALID_PROJECTION", `Unsupported field: ${String(unsupported)}.`);
    }

    fields = Array.from(new Set(request.fields));
  }

  const filters: GridFilters = {};

  if (request.filters !== undefined) {
    if (!isRecord(request.filters)) {
      throw new GridError(400, "INVALID_FILTER", "filters must be an object.");
    }

    const cusip = normalizePrefix(request.filters.cusip, "cusip");
    const ticker = normalizePrefix(request.filters.ticker, "ticker");
    const sector = normalizeStringList(request.filters.sector, "sector", isBondSector);
    const creditRating = normalizeStringList(request.filters.creditRating, "creditRating");

    if (cusip) filters.cusip = cusip;
    if (ticker) filters.ticker = ticker;
    if (sector) filters.sector = sector.filter(isBondSector);
    if (creditRating) filters.creditRating = creditRating;
  }

  let sort = defaultGridSort;

  if (request.sort !== undefined) {
    if (
      !isRecord(request.sort) ||
      typeof request.sort.field !== "string" ||
      !isBondSortField(request.sort.field) ||
      (request.sort.direction !== "asc" && request.sort.direction !== "desc")
    ) {
      throw new GridError(400, "INVALID_SORT", "sort must name a sortable field and a direction.");
    }

    sort = { field: request.sort.field, direction: request.sort.direction };
  }

  let pageSize = defaultPageSize;

  if (request.pageSize !== undefined) {
    if (!Number.isInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > maxPageSize) {
      throw new GridError(400, "INVALID_PAGE_SIZE", `pageSize must be between 1 and ${maxPageSize}.`);
    }

    pageSize = request.pageSize;
  }

  return { fields, filters, sort, pageSize };
}

function matchesFilters(record: BondRecord, filters: GridFilters) {
  const cusip = filters.cusip?.toUpperCase();
  const ticker = filters.ticker?.toUpperCase();

  if (cusip || ticker) {
    const identifierMatch =
      (cusip !== undefined && record.cusip.toUpperCase().startsWith(cusip)) ||
      (ticker !== undefined && record.ticker.toUpperCase().startsWith(ticker));

    if (!identifierMatch) {
      return false;
    }
  }

  if (filters.sector && !filters.sector.includes(record.sector)) {
    return false;
  }

  if (filters.creditRating && !filters.creditRating.includes(record.creditRating)) {
    return false;
  }

  return true;
}

function compareRecords(sort: GridSort) {
  const direction = sort.direction === "asc" ? 1 : -1;

  return (left: BondRecord, right: BondRecord) => {
    const a = left[sort.field];
    const b = right[sort.field];
    const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));

    return order !== 0 ? order * direction : left.id.localeCompare(right.id);
  };
}

function fingerprint(query: NormalizedQuery) {
  return createHash("sha256").update(JSON.stringify(query)).digest("base64url").slice(0, 24);
}

function project(record: BondRecord, fields: readonly BondField[]): BondRecord {
  const projected = { id: record.id, version: record.version, updatedAt: record.updatedAt } as BondRecord;

  for (const field of fields) {
    Object.assign(projected, { [field]: record[field] });
  }

  return projected;
}

function buildPage(snapshot: Snapshot, afterOrdinal: number, store: BondStore): GridPage {
  const start = afterOrdinal + 1;
  const ids = snapshot.orderedIds.slice(start, start + snapshot.pageSize);
  const lastOrdinal = start + ids.length - 1;
  const hasMore = lastOrdinal < snapshot.orderedIds.length - 1;

  return {
    snapshotId: snapshot.id,
    queryFingerprint: snapshot.queryFingerprint,
    expiresAt: snapshot.expiresAt,
    sort: snapshot.sort,
    filters: snapshot.filters,
    fields: snapshot.fields,
    pageSize: snapshot.pageSize,
    totalCount: snapshot.orderedIds.length,
    rows: store.getByIds(ids).map((record) => project(record, snapshot.fields)),
    nextCursor: hasMore
      ? encodeCursor({
          snapshotId: snapshot.id,
          queryFingerprint: snapshot.queryFingerprint,
          ordinal: lastOrdinal,
          expiresAt: snapshot.expiresAt,
        })
      : null,
    hasMore,
  };
}

export function createGridQuery(input: unknown, store: BondStore = getBondStore()): GridPage {
  const query = normalizeQuery(input);
  const orderedIds = store
    .list()
    .filter((record) => matchesFilters(record, query.filters))
    .sort(compareRecords(query.sort))
    .map((record) => record.id);
  const snapshot: Snapshot = {
    ...query,
    id: randomUUID(),
    queryFingerprint: fingerprint(query),
    expiresAt: new Date(Date.now() + snapshotLifetimeMs).toISOString(),
    orderedIds,
  };

  const snapshots = getSnapshots();
  purgeExpiredSnapshots(snapshots);
  snapshots.set(snapshot.id, snapshot);

  return buildPage(snapshot, -1, store);
}

export function getGridPage(snapshotId: string, cursor: string | null, store: BondStore = getBondStore()): GridPage {
  if (!cursor) {
    throw new GridError(400, "INVALID_CURSOR", "The after cursor is required.");
  }

  const payload = decodeCursor(cursor);
  const snapshot = getSnapshots().get(snapshotId);

  if (!snapshot || new Date(snapshot.expiresAt).getTime() < Date.now()) {
    throw new GridError(410, "SNAPSHOT_EXPIRED", "The query snapshot has expired.");
  }

  if (payload.snapshotId !== snapshot.id || payload.queryFingerprint !== snapshot.queryFingerprint) {
    throw new GridError(400, "INVALID_CURSOR", "The cursor does not belong to this query.");
  }

  return buildPage(snapshot, payload.ordinal, store);
}

export function getCurrentRows(input: unknown, store: BondStore = getBondStore()): BondRecord[] {
  if (!isRecord(input) || !Array.isArray(input.rowIds)) {
    throw new GridError(400, "INVALID_ROW_IDS", "rowIds must be an array of record IDs.");
  }

  const rowIds = Array.from(new Set(input.rowIds));

  if (rowIds.length === 0 || rowIds.length > maxCurrentRowIds || rowIds.some((id) => typeof id !== "string")) {
    throw new GridError(400, "INVALID_ROW_IDS", `rowIds must contain 1 to ${maxCurrentRowIds} record IDs.`);
  }

  return store.getByIds(rowIds as string[]);
}

export function clearSnapshotsForTesting() {
  getSnapshots().clear();
}
