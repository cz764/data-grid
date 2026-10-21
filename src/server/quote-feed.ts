import type { BondRecord } from "@/data/bonds";

import { getBondStore, type BondStore } from "./bond-store";
import { InMemoryBondStore } from "./in-memory-store";
import { getSubscriptionRegistry, type SubscriptionRegistry } from "./subscriptions";
import { startSubscriptionHeartbeat } from "./supabase-subscriptions";

export type QuoteFeedListener = (rows: readonly BondRecord[]) => void;

// The stream tier's only dependency: it subscribes to row IDs and receives conflated updates.
export interface QuoteFeed {
  subscribe(rowIds: readonly string[], listener: QuoteFeedListener): () => void;
}

export function createInMemoryQuoteFeed(store: InMemoryBondStore, registry: SubscriptionRegistry): QuoteFeed {
  return {
    subscribe(rowIds, listener) {
      const wanted = new Set(rowIds);
      const release = registry.add(rowIds);
      const stop = store.onQuotes((rows) => {
        const mine = rows.filter((row) => wanted.has(row.id));

        if (mine.length > 0) {
          listener(mine);
        }
      });

      return () => {
        stop();
        release();
      };
    },
  };
}

interface PollingSubscriber {
  wanted: Set<string>;
  listener: QuoteFeedListener;
}

// Reads the union of subscribed rows once per interval and fans out the ones whose version advanced.
// This is the feed for stores updated by an external producer, such as Supabase.
export function createPollingQuoteFeed(
  store: BondStore,
  registry: SubscriptionRegistry,
  intervalMs = 1000,
  schedule: (tick: () => void) => () => void = (tick) => {
    const timer = setInterval(tick, intervalMs);
    timer.unref?.();

    return () => clearInterval(timer);
  },
): QuoteFeed & { poll(): Promise<void> } {
  const subscribers = new Map<symbol, PollingSubscriber>();
  const lastSeen = new Map<string, string>();
  let stop: (() => void) | null = null;
  let inFlight = false;

  const poll = async () => {
    if (inFlight || subscribers.size === 0) {
      return;
    }

    inFlight = true;

    try {
      const ids = Array.from(registry.subscribedIds());
      const rows = await store.getByIds(ids);
      const changed: BondRecord[] = [];

      for (const row of rows) {
        const previous = lastSeen.get(row.id);
        lastSeen.set(row.id, row.version);

        if (previous !== undefined && previous !== row.version) {
          changed.push(row);
        }
      }

      for (const id of lastSeen.keys()) {
        if (!ids.includes(id)) {
          lastSeen.delete(id);
        }
      }

      if (changed.length > 0) {
        for (const { wanted, listener } of subscribers.values()) {
          const mine = changed.filter((row) => wanted.has(row.id));

          if (mine.length > 0) {
            listener(mine);
          }
        }
      }
    } catch (error) {
      console.error("Quote feed poll failed", error);
    } finally {
      inFlight = false;
    }
  };

  return {
    poll,
    subscribe(rowIds, listener) {
      const key = Symbol("poll-subscriber");
      subscribers.set(key, { wanted: new Set(rowIds), listener });
      const release = registry.add(rowIds);
      stop ??= schedule(() => void poll());

      return () => {
        subscribers.delete(key);
        release();

        if (subscribers.size === 0) {
          stop?.();
          stop = null;
        }
      };
    },
  };
}

const feedKey = Symbol.for("bond-data-grid.quote-feed");
const globalFeed = globalThis as typeof globalThis & { [feedKey]?: { store: BondStore; feed: QuoteFeed } };

export function getQuoteFeed(): QuoteFeed {
  const store = getBondStore();
  const cached = globalFeed[feedKey];

  if (cached && cached.store === store) {
    return cached.feed;
  }

  const registry = getSubscriptionRegistry();
  let feed: QuoteFeed;

  if (store instanceof InMemoryBondStore) {
    feed = createInMemoryQuoteFeed(store, registry);
  } else {
    feed = createPollingQuoteFeed(store, registry);
    startSubscriptionHeartbeat(registry);
  }

  globalFeed[feedKey] = { store, feed };

  return feed;
}
