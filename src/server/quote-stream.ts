import type { BondRecord } from "@/data/bonds";
import { maxCurrentRowIds } from "@/data/grid";

import { GridError } from "./errors";
import type { QuoteFeed } from "./quote-feed";

const heartbeatIntervalMs = 15_000;

export function parseStreamRowIds(value: string | null): string[] {
  const rowIds = Array.from(new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean)));

  if (rowIds.length === 0 || rowIds.length > maxCurrentRowIds) {
    throw new GridError(400, "INVALID_ROW_IDS", `ids must contain 1 to ${maxCurrentRowIds} record IDs.`);
  }

  return rowIds;
}

export function formatQuotesEvent(rows: readonly BondRecord[], id: string) {
  return `event: quotes\nid: ${id}\ndata: ${JSON.stringify({ rows })}\n\n`;
}

export function createQuoteStreamResponse(request: Request, feed: QuoteFeed) {
  const rowIds = parseStreamRowIds(new URL(request.url).searchParams.get("ids"));
  const encoder = new TextEncoder();
  let sequence = 0;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const unsubscribe = feed.subscribe(rowIds, (rows) => {
        sequence += 1;
        send(formatQuotesEvent(rows, `${Date.now()}-${sequence}`));
      });
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), heartbeatIntervalMs);
      let closed = false;

      cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanupAndClose);
      };

      const cleanupAndClose = () => {
        cleanup();
        controller.close();
      };

      send(": connected\n\n");

      if (request.signal.aborted) {
        cleanupAndClose();
      } else {
        request.signal.addEventListener("abort", cleanupAndClose, { once: true });
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
