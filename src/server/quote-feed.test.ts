import { describe, expect, it, vi } from "vitest";

import type { BondRecord } from "@/data/bonds";
import { createMockBondRecords } from "@/mocks/bonds";

import type { BondStore } from "./bond-store";
import { createPollingQuoteFeed } from "./quote-feed";
import type { SubscriptionRegistry } from "./subscriptions";

function createRegistry(): SubscriptionRegistry {
  const entries = new Map<symbol, readonly string[]>();

  return {
    add: (ids) => {
      const key = Symbol();
      entries.set(key, ids);

      return () => void entries.delete(key);
    },
    subscribedIds: () => new Set(Array.from(entries.values()).flat()),
    size: () => entries.size,
  };
}

describe("polling quote feed", () => {
  it("emits only rows whose version advanced since the last poll, to the subscribers that want them", async () => {
    const records = new Map(createMockBondRecords(4).map((record) => [record.id, record]));
    const store: BondStore = {
      getByIds: async (ids) => ids.flatMap((id) => records.get(id) ?? []),
      createSnapshot: vi.fn(),
      getSnapshot: vi.fn(),
      readSnapshotRows: vi.fn(),
    };
    const registry = createRegistry();
    let scheduled: (() => void) | null = null;
    const stopSchedule = vi.fn();
    const feed = createPollingQuoteFeed(store, registry, 1000, (tick) => {
      scheduled = tick;

      return stopSchedule;
    });
    const ids = Array.from(records.keys());
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = feed.subscribe(ids.slice(0, 2), first);
    feed.subscribe(ids.slice(1, 3), second);

    await feed.poll();
    expect(first).not.toHaveBeenCalled();

    const bumped: BondRecord = { ...records.get(ids[1])!, version: "2", bid: 1 };
    records.set(ids[1], bumped);
    await feed.poll();

    expect(first).toHaveBeenCalledWith([bumped]);
    expect(second).toHaveBeenCalledWith([bumped]);
    expect(scheduled).not.toBeNull();

    unsubscribeFirst();
    expect(registry.size()).toBe(1);
    expect(stopSchedule).not.toHaveBeenCalled();
  });
});
