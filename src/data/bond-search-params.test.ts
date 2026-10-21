import { describe, expect, it } from "vitest";

import { parseBondGridQuery, serializeBondGridQuery, toGridFilters } from "./bond-search-params";

describe("bond search params", () => {
  it("round-trips search, filters, and sort through the URL", () => {
    const query = parseBondGridQuery(
      new URLSearchParams("q=UST&sector=trea&sector=bogus&rating=AAA&rating=AA%2B&sort=bid:desc"),
    );

    expect(query).toEqual({
      search: "UST",
      sector: ["trea"],
      creditRating: ["AAA", "AA+"],
      sort: { field: "bid", direction: "desc" },
    });
    expect(serializeBondGridQuery(query).toString()).toBe("q=UST&sector=trea&rating=AAA&rating=AA%2B&sort=bid%3Adesc");
    expect(toGridFilters(query)).toEqual({ cusip: "UST", ticker: "UST", sector: ["trea"], creditRating: ["AAA", "AA+"] });
  });

  it("falls back to the default sort and omits it from the URL", () => {
    const query = parseBondGridQuery({ sort: "creditRating:asc" });

    expect(query.sort).toEqual({ field: "ticker", direction: "asc" });
    expect(serializeBondGridQuery(query).toString()).toBe("");
  });
});
