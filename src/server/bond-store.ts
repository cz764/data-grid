import type { BondField, BondRecord } from "@/data/bonds";
import type { GridFilters, GridSort } from "@/data/grid";

import { InMemoryBondStore } from "./in-memory-store";
import { getSubscriptionRegistry } from "./subscriptions";
import { isSupabaseConfigured } from "./supabase";
import { SupabaseBondStore } from "./supabase-store";

export interface SnapshotQuery {
  fields: readonly BondField[];
  filters: GridFilters;
  sort: GridSort;
  pageSize: number;
}

export interface SnapshotInfo {
  id: string;
  queryFingerprint: string;
  expiresAt: string;
  totalCount: number;
  query: SnapshotQuery;
}

// The data source behind the query service. Snapshot creation lives here because Supabase builds the
// ordered membership in SQL while the in-memory store sorts in process.
export interface BondStore {
  createSnapshot(query: SnapshotQuery, queryFingerprint: string, ttlMs: number): Promise<SnapshotInfo>;
  getSnapshot(snapshotId: string): Promise<SnapshotInfo | null>;
  readSnapshotRows(snapshotId: string, afterOrdinal: number, limit: number): Promise<BondRecord[]>;
  getByIds(ids: readonly string[]): Promise<BondRecord[]>;
}

const storeKey = Symbol.for("bond-data-grid.store");
const globalStore = globalThis as typeof globalThis & { [storeKey]?: unknown };

export function getBondStore(): BondStore {
  const existing = globalStore[storeKey];

  // Hot reload re-evaluates this module with new class identities; replace a stale instance.
  if (existing instanceof InMemoryBondStore || existing instanceof SupabaseBondStore) {
    return existing;
  }

  (existing as { stopProducer?: () => void } | undefined)?.stopProducer?.();

  if (isSupabaseConfigured()) {
    const store = new SupabaseBondStore();
    globalStore[storeKey] = store;

    return store;
  }

  const store = new InMemoryBondStore(getSubscriptionRegistry());
  store.startProducer();
  globalStore[storeKey] = store;

  return store;
}
