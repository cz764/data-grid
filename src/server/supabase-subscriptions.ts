import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubscriptionRegistry } from "./subscriptions";
import { createSupabaseServerClient } from "./supabase";

const heartbeatIntervalMs = 5000;
const heartbeatKey = Symbol.for("bond-data-grid.subscription-heartbeat");
const globalHeartbeat = globalThis as typeof globalThis & { [heartbeatKey]?: () => void };

// Publishes this server process's subscribed row IDs so a separate producer can read the hot set.
export function createSubscriptionHeartbeat(
  registry: SubscriptionRegistry,
  client: SupabaseClient,
  processId = randomUUID(),
) {
  let published = false;

  return async function beat() {
    const rowIds = Array.from(registry.subscribedIds());

    try {
      if (rowIds.length > 0) {
        const { error } = await client
          .from("grid_subscriptions")
          .upsert({ id: processId, row_ids: rowIds, heartbeat_at: new Date().toISOString() });

        if (error) {
          throw new Error(error.message);
        }

        published = true;
      } else if (published) {
        await client.from("grid_subscriptions").delete().eq("id", processId);
        published = false;
      }
    } catch (error) {
      console.error("Subscription heartbeat failed", error);
    }
  };
}

export function startSubscriptionHeartbeat(registry: SubscriptionRegistry) {
  globalHeartbeat[heartbeatKey]?.();

  const beat = createSubscriptionHeartbeat(registry, createSupabaseServerClient());
  const timer = setInterval(() => void beat(), heartbeatIntervalMs);
  timer.unref?.();
  globalHeartbeat[heartbeatKey] = () => clearInterval(timer);
}
