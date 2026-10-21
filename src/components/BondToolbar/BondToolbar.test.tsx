import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultGridSort } from "@/data/grid";

import { BondToolbar } from ".";

const query = { search: "", sector: [], creditRating: [], sort: defaultGridSort };

describe("BondToolbar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces the search value before emitting a query change", () => {
    const onQueryChange = vi.fn();
    render(<BondToolbar query={query} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByPlaceholderText("search CUSIP or ticker"), { target: { value: " ust " } });
    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(onQueryChange).toHaveBeenCalledWith({ ...query, search: "ust" });
  });

  it("emits sector filter changes", () => {
    const onQueryChange = vi.fn();
    render(<BondToolbar query={query} onQueryChange={onQueryChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Treasury" }));
    expect(onQueryChange).toHaveBeenCalledWith({ ...query, sector: ["trea"] });
  });
});
