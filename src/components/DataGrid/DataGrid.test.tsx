import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataGrid, type DataGridColumn } from ".";

interface ExampleRow {
  id: string;
  label: string;
  price: number;
}

const columns: readonly DataGridColumn<ExampleRow>[] = [
  { key: "label", title: "Label", width: 160, minWidth: 100, maxWidth: 200 },
  { key: "price", title: "Price", width: 120, sortable: true, align: "end" },
];

const rows: ExampleRow[] = [
  { id: "1", label: "First record", price: 10 },
  { id: "2", label: "Second record", price: 20 },
];

function renderGrid(props: Partial<React.ComponentProps<typeof DataGrid<ExampleRow>>> = {}) {
  return render(
    <DataGrid name="Example records" data={rows} columns={columns} getRowId={(row) => row.id} {...props} />,
  );
}

describe("DataGrid", () => {
  it("renders rows with their accessible grid name", () => {
    renderGrid();

    expect(screen.getByRole("heading", { name: "Example records" })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Example records" })).toBeInTheDocument();
    expect(screen.getByText("First record")).toBeInTheDocument();
    expect(screen.getByText("2 records")).toBeInTheDocument();
  });

  it("renders its empty state", () => {
    renderGrid({ data: [] });

    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("shows the total count separately from the loaded count", () => {
    renderGrid({ totalCount: 1250 });

    expect(screen.getByText("2 of 1,250 records")).toBeInTheDocument();
  });

  it("requests a sort change from a sortable header by click and keyboard", () => {
    const onSortChange = vi.fn();
    renderGrid({ sort: { key: "price", direction: "asc" }, onSortChange });

    const header = screen.getByRole("columnheader", { name: "Price" });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Label" })).not.toHaveAttribute("aria-sort");

    fireEvent.click(header);
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "price", direction: "desc" });

    header.focus();
    fireEvent.keyDown(header, { key: "Enter" });
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "price", direction: "desc" });
    expect(onSortChange).toHaveBeenCalledTimes(2);
  });

  it("resizes a column with the keyboard inside its bounds", () => {
    renderGrid();

    const header = screen.getByRole("columnheader", { name: "Label" });
    const column = () => document.querySelector("col") as HTMLTableColElement;
    header.focus();

    fireEvent.keyDown(header, { key: "ArrowRight", shiftKey: true });
    expect(column().style.width).toBe("170px");

    for (let step = 0; step < 10; step += 1) {
      fireEvent.keyDown(header, { key: "ArrowRight", shiftKey: true });
    }
    expect(column().style.width).toBe("200px");

    for (let step = 0; step < 20; step += 1) {
      fireEvent.keyDown(header, { key: "ArrowLeft", shiftKey: true });
    }
    expect(column().style.width).toBe("100px");
  });

  it("moves focus between cells with arrow keys and Tab", () => {
    renderGrid();

    const header = screen.getByRole("columnheader", { name: "Label" });
    header.focus();

    fireEvent.keyDown(header, { key: "ArrowDown" });
    const firstCell = screen.getByRole("gridcell", { name: "First record" });
    expect(firstCell).toHaveFocus();

    fireEvent.keyDown(firstCell, { key: "Tab" });
    expect(screen.getByRole("gridcell", { name: "10" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("gridcell", { name: "10" }), { key: "Tab" });
    expect(screen.getByRole("gridcell", { name: "Second record" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("gridcell", { name: "Second record" }), { key: "ArrowUp" });
    expect(firstCell).toHaveFocus();
  });

  it("shows the skeleton on initial load and the error state with retry", () => {
    const onRetry = vi.fn();
    const { rerender } = renderGrid({ data: [], isLoading: true });

    expect(screen.getByRole("region", { name: "Loading Example records" })).toHaveAttribute("aria-busy", "true");

    rerender(
      <DataGrid
        name="Example records"
        data={[]}
        columns={columns}
        getRowId={(row) => row.id}
        error={new Error("Service down")}
        onRetry={onRetry}
      />,
    );

    expect(within(screen.getByRole("alert")).getByText("Service down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("keeps rows and shows footer states for later pages", () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderGrid({ hasMore: true, onLoadMore });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <DataGrid name="Example records" data={rows} columns={columns} getRowId={(row) => row.id} isLoading hasMore />,
    );
    expect(screen.getByText("First record")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading more rows");

    rerender(<DataGrid name="Example records" data={rows} columns={columns} getRowId={(row) => row.id} />);
    expect(screen.getByRole("status")).toHaveTextContent("End of results");
  });

  it("keeps rows visible and announces an update while refreshing", () => {
    renderGrid({ isRefreshing: true });

    expect(screen.getByText("First record")).toBeInTheDocument();
    expect(screen.getByText(/Updating rows/)).toBeVisible();
    expect(screen.getByRole("grid")).toHaveAttribute("aria-busy", "true");
  });

  it("loads automatically near the end when auto loading is enabled", () => {
    const onLoadMore = vi.fn();
    renderGrid({ hasMore: true, autoLoadMore: true, onLoadMore });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("flashes a cell whose value changed since it was last shown", () => {
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const { rerender } = renderGrid();

    expect(animate).not.toHaveBeenCalled();

    rerender(
      <DataGrid
        name="Example records"
        data={[{ ...rows[0], price: 11 }, rows[1]]}
        columns={columns}
        getRowId={(row) => row.id}
      />,
    );

    expect(animate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("gridcell", { name: "11" })).toHaveAttribute("data-grid-column", "1");
  });

  it("reports the visible row ids", () => {
    const onVisibleRowsChange = vi.fn();
    renderGrid({ onVisibleRowsChange });

    expect(onVisibleRowsChange).toHaveBeenLastCalledWith(["1", "2"]);
  });
});
