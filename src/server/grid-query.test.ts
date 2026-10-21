import { describe, expect, it } from "vitest";

import { GridError } from "./errors";
import { createGridQuery, getCurrentRows, getGridPage } from "./grid-query";
import { InMemoryBondStore } from "./in-memory-store";
import type { SubscriptionRegistry } from "./subscriptions";

const emptyRegistry: SubscriptionRegistry = { add: () => () => {}, subscribedIds: () => new Set(), size: () => 0 };
const store = new InMemoryBondStore(emptyRegistry, 250);
const records = store.list();

describe("grid query service", () => {
  it("pages through a stable snapshot without skipping or repeating rows", async () => {
    const first = await createGridQuery({ sort: { field: "bid", direction: "desc" } }, store);
    expect(first.rows).toHaveLength(100);
    expect(first.totalCount).toBe(250);
    expect(first.hasMore).toBe(true);

    const second = await getGridPage(first.snapshotId, first.nextCursor, store);
    const third = await getGridPage(second.snapshotId, second.nextCursor, store);
    const ids = [...first.rows, ...second.rows, ...third.rows].map((row) => row.id);

    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(new Set(ids).size).toBe(250);
    expect(first.rows[0].bid).toBeGreaterThanOrEqual(first.rows[99].bid);
  });

  it("filters by identifier prefix, sector, and rating", async () => {
    const page = await createGridQuery(
      { filters: { cusip: "0000000", ticker: "0000000", sector: ["Muni", "corp"], creditRating: ["AAA"] } },
      store,
    );

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.cusip.startsWith("0000000"))).toBe(true);
    expect(page.rows.every((row) => row.creditRating === "AAA")).toBe(true);
    expect(page.filters).toEqual({ cusip: "0000000", ticker: "0000000", sector: ["Muni", "corp"], creditRating: ["AAA"] });
  });

  it("projects only the requested fields", async () => {
    const page = await createGridQuery({ fields: ["cusip", "bid"], pageSize: 1 }, store);

    expect(Object.keys(page.rows[0]).sort()).toEqual(["bid", "cusip", "id", "updatedAt", "version"]);
  });

  it("rejects invalid projections, sorts, and tampered cursors", async () => {
    await expect(createGridQuery({ fields: ["nope"] }, store)).rejects.toThrow(GridError);
    await expect(createGridQuery({ sort: { field: "creditRating", direction: "asc" } }, store)).rejects.toThrow(GridError);

    const page = await createGridQuery({ pageSize: 10 }, store);
    await expect(getGridPage(page.snapshotId, `${page.nextCursor}x`, store)).rejects.toThrow(/signature/);
    await expect(getGridPage("missing", page.nextCursor, store)).rejects.toThrow(/expired/);
  });

  it("returns current rows for up to 50 ids", async () => {
    const ids = records.slice(0, 3).map((record) => record.id);
    await expect(getCurrentRows({ rowIds: ids }, store)).resolves.toHaveLength(3);
    await expect(getCurrentRows({ rowIds: [] }, store)).rejects.toThrow(GridError);
    await expect(getCurrentRows({ rowIds: records.slice(0, 51).map((record) => record.id) }, store)).rejects.toThrow(GridError);
  });
});
