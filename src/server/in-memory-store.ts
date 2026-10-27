import { randomUUID } from "node:crypto";

import type { BondRecord } from "@/data/bonds";
import type { GridFilters, GridSort } from "@/data/grid";
import { createMockBonds } from "@/mocks/bonds";

import type { BondStore, SnapshotInfo, SnapshotQuery } from "./bond-store";
import { nextQuote } from "./quotes";
import type { SubscriptionRegistry } from "./subscriptions";

export type QuoteListener = (rows: readonly BondRecord[]) => void;

const datasetSize = 50_000;
const backgroundUpdatesPerTick = 10;
const tickIntervalMs = 1000;

interface StoredSnapshot extends SnapshotInfo {
  orderedIds: readonly string[];
}

function matchesFilters(record: BondRecord, filters: GridFilters) {
  const cusip = filters.cusip?.toUpperCase();
  const ticker = filters.ticker?.toUpperCase();

  if (cusip || ticker) {
    const identifierMatch =
      (cusip !== undefined && record.cusip.toUpperCase().includes(cusip)) ||
      (ticker !== undefined && record.ticker.toUpperCase().includes(ticker));

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

// Stands in for Supabase and also hosts the mock producer, which becomes a separate process once the
// database is wired up.
export class InMemoryBondStore implements BondStore {
  private readonly records = new Map<string, BondRecord>();
  private readonly ids: string[];
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly listeners = new Set<QuoteListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly registry: SubscriptionRegistry,
    size = datasetSize,
  ) {
    const updatedAt = new Date().toISOString();

    for (const bond of createMockBonds(size)) {
      this.records.set(bond.id, { ...bond, version: "1", updatedAt });
    }

    this.ids = Array.from(this.records.keys());
  }

  list() {
    return Array.from(this.records.values());
  }

  async createSnapshot(query: SnapshotQuery, queryFingerprint: string, ttlMs: number): Promise<SnapshotInfo> {
    this.purgeExpiredSnapshots();

    const orderedIds = this.list()
      .filter((record) => matchesFilters(record, query.filters))
      .sort(compareRecords(query.sort))
      .map((record) => record.id);
    const snapshot: StoredSnapshot = {
      id: randomUUID(),
      queryFingerprint,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      totalCount: orderedIds.length,
      query,
      orderedIds,
    };

    this.snapshots.set(snapshot.id, snapshot);

    return this.describe(snapshot);
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotInfo | null> {
    const snapshot = this.snapshots.get(snapshotId);

    return snapshot && new Date(snapshot.expiresAt).getTime() >= Date.now() ? this.describe(snapshot) : null;
  }

  async readSnapshotRows(snapshotId: string, afterOrdinal: number, limit: number): Promise<BondRecord[]> {
    const snapshot = this.snapshots.get(snapshotId);

    if (!snapshot) {
      return [];
    }

    return this.getByIds(snapshot.orderedIds.slice(afterOrdinal + 1, afterOrdinal + 1 + limit));
  }

  async getByIds(ids: readonly string[]): Promise<BondRecord[]> {
    return ids.flatMap((id) => this.records.get(id) ?? []);
  }

  onQuotes(listener: QuoteListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  // Updates every subscribed bond plus a small background sample so unsubscribed rows still drift.
  tick() {
    const updatedAt = new Date().toISOString();
    const targets = this.registry.subscribedIds();

    for (let index = 0; index < backgroundUpdatesPerTick; index += 1) {
      targets.add(this.ids[Math.floor(Math.random() * this.ids.length)]);
    }

    const updated: BondRecord[] = [];

    for (const id of targets) {
      const record = this.records.get(id);

      if (record) {
        const next: BondRecord = {
          ...record,
          ...nextQuote(record),
          version: String(BigInt(record.version) + BigInt(1)),
          updatedAt,
        };
        this.records.set(id, next);
        updated.push(next);
      }
    }

    this.listeners.forEach((listener) => listener(updated));

    return updated;
  }

  startProducer() {
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), tickIntervalMs);
      this.timer.unref?.();
    }
  }

  stopProducer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private describe({ id, queryFingerprint, expiresAt, totalCount, query }: StoredSnapshot): SnapshotInfo {
    return { id, queryFingerprint, expiresAt, totalCount, query };
  }

  private purgeExpiredSnapshots() {
    const now = Date.now();

    for (const [id, snapshot] of this.snapshots) {
      if (new Date(snapshot.expiresAt).getTime() < now) {
        this.snapshots.delete(id);
      }
    }
  }
}
