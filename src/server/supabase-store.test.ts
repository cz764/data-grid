import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseBondStore, toBondRecord } from "./supabase-store";

const bondRow = {
  id: "b0a00000-0000-4000-8000-000000000001",
  isin: "US0000000001",
  cusip: "000000001",
  ticker: "NSMA",
  issuer: "Northstar Municipal Authority",
  sector: "Muni",
  credit_rating: "AAA",
  maturity: "2029-02-02",
  bid: "95.1200",
  ask: 95.1575,
  version: 7,
  updated_at: "2026-10-21T14:00:00.000Z",
};

function createClient(responses: Record<string, unknown>) {
  const calls: Record<string, unknown[]> = {};
  const builder = (name: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "gt", "in", "order", "limit", "single", "maybeSingle", "upsert", "delete"];

    for (const method of methods) {
      chain[method] = (...args: unknown[]) => {
        (calls[name] ??= []).push([method, ...args]);

        return chain;
      };
    }

    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: responses[name] ?? null, error: null });

    return chain;
  };

  return {
    calls,
    client: {
      rpc: (name: string, args: unknown) => {
        (calls[name] ??= []).push(["rpc", args]);

        return builder(name);
      },
      from: (table: string) => builder(table),
    } as unknown as SupabaseClient,
  };
}

describe("SupabaseBondStore", () => {
  it("maps database rows to bond records with string versions and numeric quotes", () => {
    expect(toBondRecord(bondRow)).toEqual({
      id: bondRow.id,
      isin: "US0000000001",
      cusip: "000000001",
      ticker: "NSMA",
      issuer: "Northstar Municipal Authority",
      sector: "Muni",
      creditRating: "AAA",
      maturity: "2029-02-02",
      bid: 95.12,
      ask: 95.1575,
      version: "7",
      updatedAt: "2026-10-21T14:00:00.000Z",
    });
  });

  it("creates snapshots through the SQL function and reads pages by ordinal", async () => {
    const snapshotRow = {
      id: "snap-1",
      query_hash: "fp",
      sort_definition: { field: "bid", direction: "desc" },
      filter_definition: { sector: ["trea"] },
      fields: ["cusip", "bid"],
      page_size: 100,
      expires_at: "2099-01-01T00:00:00.000Z",
      total_count: "1250",
    };
    const { client, calls } = createClient({
      create_grid_snapshot: snapshotRow,
      grid_snapshot_entries: [{ ordinal: 0, bond: bondRow }, { ordinal: 1, bond: null }],
    });
    const store = new SupabaseBondStore(client);

    const snapshot = await store.createSnapshot(
      { sort: { field: "bid", direction: "desc" }, filters: { sector: ["trea"] }, fields: ["cusip", "bid"], pageSize: 100 },
      "fp",
      900_000,
    );
    expect(snapshot).toEqual({
      id: "snap-1",
      queryFingerprint: "fp",
      expiresAt: "2099-01-01T00:00:00.000Z",
      totalCount: 1250,
      query: { sort: { field: "bid", direction: "desc" }, filters: { sector: ["trea"] }, fields: ["cusip", "bid"], pageSize: 100 },
    });
    expect(calls.create_grid_snapshot[0]).toEqual([
      "rpc",
      expect.objectContaining({ p_query_hash: "fp", p_page_size: 100, p_ttl_seconds: 900 }),
    ]);

    const rows = await store.readSnapshotRows("snap-1", 99, 100);
    expect(rows).toHaveLength(1);
    expect(rows[0].cusip).toBe("000000001");
    expect(calls.grid_snapshot_entries).toEqual(
      expect.arrayContaining([["gt", "ordinal", 99], ["limit", 100], ["eq", "snapshot_id", "snap-1"]]),
    );
  });

  it("returns no rows for an empty id list without a request", async () => {
    const { client, calls } = createClient({});
    const store = new SupabaseBondStore(client);

    await expect(store.getByIds([])).resolves.toEqual([]);
    expect(calls.bonds).toBeUndefined();
    vi.restoreAllMocks();
  });
});
