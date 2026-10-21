import { beforeEach, describe, expect, it } from "vitest";

import { createMockBondRecords } from "@/mocks/bonds";

import type { BondStore } from "./bond-store";
import { GridError } from "./errors";
import { clearSnapshotsForTesting, createGridQuery, getCurrentRows, getGridPage } from "./grid-query";

const records = createMockBondRecords(250);
const store: BondStore = {
  list: () => records,
  getByIds: (ids) => ids.flatMap((id) => records.filter((record) => record.id === id)),
};

describe("grid query service", () => {
  beforeEach(() => clearSnapshotsForTesting());

  it("pages through a stable snapshot without skipping or repeating rows", () => {
    const first = createGridQuery({ sort: { field: "bid", direction: "desc" } }, store);
    expect(first.rows).toHaveLength(100);
    expect(first.totalCount).toBe(250);
    expect(first.hasMore).toBe(true);

    const second = getGridPage(first.snapshotId, first.nextCursor, store);
    const third = getGridPage(second.snapshotId, second.nextCursor, store);
    const ids = [...first.rows, ...second.rows, ...third.rows].map((row) => row.id);

    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(new Set(ids).size).toBe(250);
    expect(first.rows[0].bid).toBeGreaterThanOrEqual(first.rows[99].bid);
  });

  it("filters by identifier prefix, sector, and rating", () => {
    const page = createGridQuery(
      { filters: { cusip: "0000000", ticker: "0000000", sector: ["Muni", "corp"], creditRating: ["AAA"] } },
      store,
    );

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.cusip.startsWith("0000000"))).toBe(true);
    expect(page.rows.every((row) => row.creditRating === "AAA")).toBe(true);
    expect(page.filters).toEqual({ cusip: "0000000", ticker: "0000000", sector: ["Muni", "corp"], creditRating: ["AAA"] });
  });

  it("rejects invalid projections, sorts, and tampered cursors", () => {
    expect(() => createGridQuery({ fields: ["nope"] }, store)).toThrow(GridError);
    expect(() => createGridQuery({ sort: { field: "creditRating", direction: "asc" } }, store)).toThrow(GridError);

    const page = createGridQuery({ pageSize: 10 }, store);
    expect(() => getGridPage(page.snapshotId, `${page.nextCursor}x`, store)).toThrow(/signature/);
    expect(() => getGridPage("missing", page.nextCursor, store)).toThrow(/expired/);
  });

  it("returns current rows for up to 50 ids", () => {
    const ids = records.slice(0, 3).map((record) => record.id);
    expect(getCurrentRows({ rowIds: ids }, store)).toHaveLength(3);
    expect(() => getCurrentRows({ rowIds: [] }, store)).toThrow(GridError);
    expect(() => getCurrentRows({ rowIds: records.slice(0, 51).map((record) => record.id) }, store)).toThrow(GridError);
  });
});
