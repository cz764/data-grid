import { describe, expect, it, vi } from "vitest";

import { InMemoryBondStore } from "./in-memory-store";
import { createInMemoryQuoteFeed } from "./quote-feed";
import { getSubscriptionRegistry } from "./subscriptions";

class TestRegistry {
  private readonly entries = new Map<symbol, readonly string[]>();

  add(rowIds: readonly string[]) {
    const key = Symbol();
    this.entries.set(key, rowIds);

    return () => void this.entries.delete(key);
  }

  subscribedIds() {
    return new Set(Array.from(this.entries.values()).flat());
  }

  size() {
    return this.entries.size;
  }
}

const query = {
  sort: { field: "ticker", direction: "asc" },
  filters: {},
  fields: ["cusip", "bid"],
  pageSize: 100,
} as const;

describe("InMemoryBondStore snapshots", () => {
  it("reuses a snapshot for the same fingerprint while at least half its lifetime remains", async () => {
    vi.useFakeTimers();
    const store = new InMemoryBondStore(new TestRegistry(), 200);

    const first = await store.createSnapshot(query, "fp", 900_000);
    vi.advanceTimersByTime(449_000);
    const second = await store.createSnapshot(query, "fp", 900_000);
    const other = await store.createSnapshot(query, "other", 900_000);

    expect(second).toEqual(first);
    expect(other.id).not.toBe(first.id);
    vi.useRealTimers();
  });

  it("creates a new snapshot once less than half the lifetime remains", async () => {
    vi.useFakeTimers();
    const store = new InMemoryBondStore(new TestRegistry(), 200);

    const first = await store.createSnapshot(query, "fp", 900_000);
    vi.advanceTimersByTime(451_000);
    const second = await store.createSnapshot(query, "fp", 900_000);

    expect(second.id).not.toBe(first.id);
    expect(new Date(second.expiresAt).getTime()).toBeGreaterThan(new Date(first.expiresAt).getTime());
    expect(await store.getSnapshot(first.id)).not.toBeNull();
    vi.useRealTimers();
  });
});

describe("InMemoryBondStore producer", () => {
  it("updates every subscribed bond on each tick plus a background sample", async () => {
    const registry = new TestRegistry();
    const store = new InMemoryBondStore(registry, 500);
    const subscribed = store.list().slice(0, 25).map((record) => record.id);
    registry.add(subscribed);

    const updated = store.tick();
    const updatedIds = new Set(updated.map((record) => record.id));

    expect(subscribed.every((id) => updatedIds.has(id))).toBe(true);
    expect(updated.length).toBeGreaterThanOrEqual(25);
    expect(updated.length).toBeLessThanOrEqual(35);
    expect((await store.getByIds([subscribed[0]]))[0].version).toBe("2");
    expect(updated.every((record) => record.ask >= record.bid)).toBe(true);
  });

  it("delivers only subscribed rows to a quote feed listener and releases on unsubscribe", () => {
    const registry = new TestRegistry();
    const store = new InMemoryBondStore(registry, 200);
    const feed = createInMemoryQuoteFeed(store, registry);
    const ids = store.list().slice(0, 3).map((record) => record.id);
    const listener = vi.fn();

    const unsubscribe = feed.subscribe(ids, listener);
    store.tick();

    expect(listener).toHaveBeenCalledTimes(1);
    const rows = listener.mock.calls[0][0] as { id: string }[];
    expect(rows.map((row) => row.id).sort()).toEqual([...ids].sort());

    unsubscribe();
    expect(registry.size()).toBe(0);
    store.tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("exposes one shared registry", () => {
    expect(getSubscriptionRegistry()).toBe(getSubscriptionRegistry());
  });
});
