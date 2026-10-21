export interface SubscriptionRegistry {
  add(rowIds: readonly string[]): () => void;
  subscribedIds(): Set<string>;
  size(): number;
}

class InMemorySubscriptionRegistry implements SubscriptionRegistry {
  private readonly subscriptions = new Map<symbol, readonly string[]>();

  add(rowIds: readonly string[]) {
    const key = Symbol("subscription");
    this.subscriptions.set(key, rowIds);

    return () => {
      this.subscriptions.delete(key);
    };
  }

  subscribedIds() {
    const ids = new Set<string>();

    for (const rowIds of this.subscriptions.values()) {
      rowIds.forEach((id) => ids.add(id));
    }

    return ids;
  }

  size() {
    return this.subscriptions.size;
  }
}

const registryKey = Symbol.for("bond-data-grid.subscriptions");
const globalRegistry = globalThis as typeof globalThis & { [registryKey]?: SubscriptionRegistry };

export function getSubscriptionRegistry(): SubscriptionRegistry {
  globalRegistry[registryKey] ??= new InMemorySubscriptionRegistry();

  return globalRegistry[registryKey];
}
