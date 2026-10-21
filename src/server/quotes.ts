import type { BondRecord } from "@/data/bonds";

export interface QuoteUpdate {
  id: string;
  bid: number;
  ask: number;
}

// Random walk on bid with a jittered spread; keeps ask >= bid and bid >= 0.
export function nextQuote(record: Pick<BondRecord, "id" | "bid" | "ask">): QuoteUpdate {
  const move = (Math.random() - 0.5) * 0.25;
  const bid = Math.max(0, Number((record.bid + move).toFixed(4)));
  const spread = Math.max(0.0125, Number((record.ask - record.bid + (Math.random() - 0.5) * 0.01).toFixed(4)));

  return { id: record.id, bid, ask: Number((bid + spread).toFixed(4)) };
}
