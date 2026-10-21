import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BondLoader } from ".";

describe("BondLoader", () => {
  it("loads the first page for the URL query", async () => {
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        {await BondLoader({ searchParams: { sector: "trea", sort: "bid:desc" } })}
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Bond market watch" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Bid" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByText(/^100 of [\d,]+ records$/)).toBeInTheDocument();
    expect(screen.queryByRole("gridcell", { name: "Municipal" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("gridcell", { name: "Treasury" }).length).toBeGreaterThan(0);
  });
});
