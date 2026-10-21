// Mock quote producer for the Supabase-backed store. Run with `npm run producer`.
// Each second it updates every row that a server process currently streams, plus a background
// sample, and persists them through apply_quote_updates.

import { createSupabaseServerClient } from "@/server/supabase";
import { nextQuote, type QuoteUpdate } from "@/server/quotes";

const tickIntervalMs = 1000;
const backgroundUpdatesPerTick = 10;
const subscriptionMaxAgeSeconds = 15;

const client = createSupabaseServerClient();
let inFlight = false;

// PostgREST returns a set of scalars either as plain values or as single-key objects.
function toIdList(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => (typeof row === "string" ? row : String(Object.values(row as object)[0])));
}

async function tick() {
  if (inFlight) {
    return;
  }

  inFlight = true;
  const startedAt = Date.now();

  try {
    const [subscribed, background] = await Promise.all([
      client.rpc("subscribed_bond_ids", { p_max_age_seconds: subscriptionMaxAgeSeconds }),
      client.rpc("random_bond_ids", { p_count: backgroundUpdatesPerTick }),
    ]);

    if (subscribed.error) throw new Error(subscribed.error.message);
    if (background.error) throw new Error(background.error.message);

    const ids = Array.from(new Set([...toIdList(subscribed.data), ...toIdList(background.data)]));

    if (ids.length === 0) {
      return;
    }

    const current = await client.from("bonds").select("id, bid, ask").in("id", ids);

    if (current.error) throw new Error(current.error.message);

    const updates: QuoteUpdate[] = (current.data as { id: string; bid: number | string; ask: number | string }[]).map(
      (row) => nextQuote({ id: row.id, bid: Number(row.bid), ask: Number(row.ask) }),
    );
    const applied = await client.rpc("apply_quote_updates", { p_updates: updates });

    if (applied.error) throw new Error(applied.error.message);

    console.log(
      `${new Date().toISOString()} updated ${applied.data} rows (${toIdList(subscribed.data).length} subscribed) in ${Date.now() - startedAt}ms`,
    );
  } catch (error) {
    console.error("Producer tick failed", error);
  } finally {
    inFlight = false;
  }
}

console.log("Quote producer started");
setInterval(() => void tick(), tickIntervalMs);
void tick();
