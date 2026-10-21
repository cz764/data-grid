"use client";

import { useEffect, useState } from "react";

import { fetchCurrentBonds, openBondStream, supportsBondStream } from "@/api/bonds";
import type { BondRecord } from "@/data/bonds";

export type QuoteTransport = "stream" | "poll";

const pollIntervalMs = 1000;
const maxStreamFailures = 3;

// Keeps the visible rows fresh: an SSE subscription with a snapshot on each (re)connect, falling back to
// one-second polling when EventSource is unavailable or the stream keeps failing.
export function useQuoteStream(rowIds: readonly string[], applyRows: (rows: BondRecord[]) => void) {
  // Always start as "stream" so server and client render the same markup; EventSource support is
  // checked inside the effect, which only runs in the browser.
  const [transport, setTransport] = useState<QuoteTransport>("stream");

  useEffect(() => {
    if (rowIds.length === 0) {
      return;
    }

    let controller: AbortController | null = null;
    const fetchSnapshot = () => {
      controller?.abort();
      controller = new AbortController();
      fetchCurrentBonds(rowIds, controller.signal)
        .then(applyRows)
        .catch(() => {
          // A failed or cancelled snapshot is retried on the next connect or poll.
        });
    };

    if (transport === "poll" || !supportsBondStream()) {
      const interval = setInterval(fetchSnapshot, pollIntervalMs);

      return () => {
        clearInterval(interval);
        controller?.abort();
      };
    }

    let failures = 0;
    const close = openBondStream(rowIds, {
      onOpen: () => {
        failures = 0;
        fetchSnapshot();
      },
      onQuotes: applyRows,
      onError: () => {
        failures += 1;

        if (failures >= maxStreamFailures) {
          close();
          setTransport("poll");
        }
      },
    });

    return () => {
      close();
      controller?.abort();
    };
  }, [rowIds, transport, applyRows]);

  return transport;
}
