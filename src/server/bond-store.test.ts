import { describe, expect, it, vi } from "vitest";

import { InMemoryBondStore } from "./bond-store";
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

describe("InMemoryBondStore producer", () => {
  it("updates every subscribed bond on each tick plus a background sample", () => {
    const registry = new TestRegistry();
    const store = new InMemoryBondStore(registry, 500);
    const subscribed = store.list().slice(0, 25).map((record) => record.id);
    registry.add(subscribed);

    const updated = store.tick();
    const updatedIds = new Set(updated.map((record) => record.id));

    expect(subscribed.every((id) => updatedIds.has(id))).toBe(true);
    expect(updated.length).toBeGreaterThanOrEqual(25);
    expect(updated.length).toBeLessThanOrEqual(35);
    expect(store.getByIds([subscribed[0]])[0].version).toBe("2");
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
