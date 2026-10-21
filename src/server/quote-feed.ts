import type { BondRecord } from "@/data/bonds";

import { getBondStore, type InMemoryBondStore } from "./bond-store";
import { getSubscriptionRegistry, type SubscriptionRegistry } from "./subscriptions";

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

export function getQuoteFeed(): QuoteFeed {
  return createInMemoryQuoteFeed(getBondStore(), getSubscriptionRegistry());
}
