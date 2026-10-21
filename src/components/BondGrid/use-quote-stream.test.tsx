import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockBondRecords } from "@/mocks/bonds";

import { useQuoteStream } from "./use-quote-stream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

const ids = mockBondRecords.slice(0, 2).map((record) => record.id);

describe("useQuoteStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ rows: [mockBondRecords[0]] }))));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("subscribes to the visible ids, fetches a snapshot on open, and applies quote events", async () => {
    const applyRows = vi.fn();
    const { result } = renderHook(() => useQuoteStream(ids, applyRows));

    expect(result.current).toBe("stream");
    const [source] = FakeEventSource.instances;
    expect(source.url).toBe(`/api/v1/grid/rows/stream?ids=${encodeURIComponent(ids.join(","))}`);

    await act(async () => {
      source.onopen?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledWith("/api/v1/grid/rows/current", expect.objectContaining({ method: "POST" }));
    expect(applyRows).toHaveBeenCalledWith([mockBondRecords[0]]);

    act(() => source.emit("quotes", { rows: [mockBondRecords[1]] }));
    expect(applyRows).toHaveBeenLastCalledWith([mockBondRecords[1]]);
  });

  it("reopens the stream when the visible ids change", () => {
    const { rerender } = renderHook(({ rowIds }) => useQuoteStream(rowIds, vi.fn()), {
      initialProps: { rowIds: ids },
    });

    rerender({ rowIds: [ids[0]] });

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(FakeEventSource.instances[1].url).toContain(ids[0]);
  });

  it("falls back to polling after repeated stream failures", async () => {
    const applyRows = vi.fn();
    const { result } = renderHook(() => useQuoteStream(ids, applyRows));
    const [source] = FakeEventSource.instances;

    act(() => {
      source.onerror?.();
      source.onerror?.();
      source.onerror?.();
    });

    expect(result.current).toBe("poll");
    expect(source.closed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(applyRows).toHaveBeenCalledWith([mockBondRecords[0]]);
  });
});
