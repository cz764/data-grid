import type { BondRecord } from "@/data/bonds";
import { createMockBonds } from "@/mocks/bonds";

import { getSubscriptionRegistry, type SubscriptionRegistry } from "./subscriptions";

export type QuoteListener = (rows: readonly BondRecord[]) => void;

export interface BondStore {
  list(): readonly BondRecord[];
  getByIds(ids: readonly string[]): BondRecord[];
}

const datasetSize = 50_000;
const backgroundUpdatesPerTick = 10;
const tickIntervalMs = 1000;

export function nextQuote(record: BondRecord, updatedAt: string): BondRecord {
  const move = (Math.random() - 0.5) * 0.25;
  const bid = Math.max(0, Number((record.bid + move).toFixed(4)));
  const spread = Math.max(0.0125, Number((record.ask - record.bid + (Math.random() - 0.5) * 0.01).toFixed(4)));

  return {
    ...record,
    bid,
    ask: Number((bid + spread).toFixed(4)),
    version: String(BigInt(record.version) + BigInt(1)),
    updatedAt,
  };
}

// The in-memory store stands in for Supabase and also hosts the mock producer that will become a
// separate process once the database is wired up.
export class InMemoryBondStore implements BondStore {
  private readonly records = new Map<string, BondRecord>();
  private readonly ids: string[];
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

  getByIds(ids: readonly string[]) {
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
        const next = nextQuote(record, updatedAt);
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
}

const storeKey = Symbol.for("bond-data-grid.store");
const globalStore = globalThis as typeof globalThis & { [storeKey]?: InMemoryBondStore | { stopProducer?: () => void } };

export function getBondStore(): InMemoryBondStore {
  const existing = globalStore[storeKey];

  // Hot reload re-evaluates this module with a new class identity; replace a stale instance.
  if (existing instanceof InMemoryBondStore) {
    return existing;
  }

  existing?.stopProducer?.();
  const store = new InMemoryBondStore(getSubscriptionRegistry());
  store.startProducer();
  globalStore[storeKey] = store;

  return store;
}
