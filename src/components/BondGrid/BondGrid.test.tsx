import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultGridSort, type GridPage } from "@/data/grid";
import { mockBondRecords } from "@/mocks/bonds";

import { BondGrid } from ".";

const initialQuery = { search: "", sector: [], creditRating: [], sort: defaultGridSort };

function page(rows = mockBondRecords, overrides: Partial<GridPage> = {}): GridPage {
  return {
    snapshotId: "snapshot-1",
    queryFingerprint: "fp",
    expiresAt: "2099-01-01T00:00:00.000Z",
    sort: defaultGridSort,
    filters: {},
    fields: ["cusip"],
    pageSize: 100,
    totalCount: rows.length,
    rows,
    nextCursor: null,
    hasMore: false,
    ...overrides,
  };
}

function renderBondGrid(initialPage = page()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <BondGrid initialQuery={initialQuery} initialPage={initialPage} />
    </QueryClientProvider>,
  );
}

describe("BondGrid", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the server-rendered first page with the toolbar", () => {
    renderBondGrid();

    expect(screen.getByRole("heading", { name: "Bond market watch" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("search CUSIP or ticker")).toBeInTheDocument();
    expect(screen.getByText(mockBondRecords[0].cusip)).toBeInTheDocument();
    expect(screen.getByText("20 of 20 records")).toBeInTheDocument();
  });

  it("creates a new query and syncs the URL when the sort changes", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(page(mockBondRecords.slice(0, 1), { sort: { field: "bid", direction: "asc" } })), {
        status: 201,
      }),
    );
    renderBondGrid();

    fireEvent.click(screen.getByRole("columnheader", { name: "Bid" }));

    await waitFor(() => expect(screen.getByText("1 of 1 records")).toBeInTheDocument());
    expect(window.location.search).toBe("?sort=bid%3Aasc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/grid/queries");
    expect(JSON.parse(String(init?.body))).toEqual({ filters: {}, sort: { field: "bid", direction: "asc" } });
  });
});
