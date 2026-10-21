import type { BondRecord } from "@/data/bonds";
import { createMockBonds } from "@/mocks/bonds";

export interface BondStore {
  list(): readonly BondRecord[];
  getByIds(ids: readonly string[]): BondRecord[];
}

const datasetSize = 50_000;
const producerUpdatesPerSecond = 50;

class InMemoryBondStore implements BondStore {
  private readonly records = new Map<string, BondRecord>();
  private producer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const updatedAt = new Date().toISOString();

    for (const bond of createMockBonds(datasetSize)) {
      this.records.set(bond.id, { ...bond, version: "1", updatedAt });
    }
  }

  list() {
    return Array.from(this.records.values());
  }

  getByIds(ids: readonly string[]) {
    return ids.flatMap((id) => this.records.get(id) ?? []);
  }

  startProducer() {
    if (this.producer) {
      return;
    }

    const ids = Array.from(this.records.keys());
    this.producer = setInterval(() => {
      const updatedAt = new Date().toISOString();

      for (let index = 0; index < producerUpdatesPerSecond; index += 1) {
        const record = this.records.get(ids[Math.floor(Math.random() * ids.length)]);

        if (record) {
          this.records.set(record.id, nextQuote(record, updatedAt));
        }
      }
    }, 1000);
    this.producer.unref?.();
  }
}

function nextQuote(record: BondRecord, updatedAt: string): BondRecord {
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

const storeKey = Symbol.for("bond-data-grid.store");
const globalStore = globalThis as typeof globalThis & { [storeKey]?: InMemoryBondStore };

export function getBondStore(): BondStore {
  if (!globalStore[storeKey]) {
    const store = new InMemoryBondStore();
    store.startProducer();
    globalStore[storeKey] = store;
  }

  return globalStore[storeKey];
}
