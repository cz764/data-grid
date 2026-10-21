import { describe, expect, it } from "vitest";

import type { BondRecord } from "@/data/bonds";
import { createMockBondRecords } from "@/mocks/bonds";

import { GridError } from "./errors";
import type { QuoteFeed, QuoteFeedListener } from "./quote-feed";
import { createQuoteStreamResponse, parseStreamRowIds } from "./quote-stream";

function createFakeFeed() {
  let active: { rowIds: readonly string[]; listener: QuoteFeedListener } | null = null;
  const feed: QuoteFeed = {
    subscribe(rowIds, listener) {
      active = { rowIds, listener };

      return () => {
        active = null;
      };
    },
  };

  return { feed, emit: (rows: BondRecord[]) => active?.listener(rows), isActive: () => active !== null };
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();

  return done ? null : new TextDecoder().decode(value);
}

describe("quote stream", () => {
  it("rejects an empty or oversized id list", () => {
    expect(() => parseStreamRowIds(null)).toThrow(GridError);
    expect(() => parseStreamRowIds(Array.from({ length: 51 }, (_, i) => `id-${i}`).join(","))).toThrow(GridError);
    expect(parseStreamRowIds("a, b,a")).toEqual(["a", "b"]);
  });

  it("streams conflated quote events for the subscribed ids and closes on abort", async () => {
    const { feed, emit, isActive } = createFakeFeed();
    const rows = createMockBondRecords(2);
    const controller = new AbortController();
    const request = new Request(`http://localhost/api/v1/grid/rows/stream?ids=${rows.map((row) => row.id).join(",")}`, {
      signal: controller.signal,
    });

    const response = createQuoteStreamResponse(request, feed);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, no-transform");

    const reader = response.body!.getReader();
    expect(await readChunk(reader)).toBe(": connected\n\n");
    expect(isActive()).toBe(true);

    emit([rows[0]]);
    const event = await readChunk(reader);
    expect(event).toMatch(/^event: quotes\nid: \d+-1\ndata: /);
    expect(JSON.parse(event!.split("data: ")[1]).rows[0].id).toBe(rows[0].id);

    controller.abort();
    expect(await readChunk(reader)).toBeNull();
    expect(isActive()).toBe(false);
  });
});
