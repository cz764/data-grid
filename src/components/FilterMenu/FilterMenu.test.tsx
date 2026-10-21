import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterMenu } from ".";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("FilterMenu", () => {
  it("adds and removes selected values", () => {
    const onChange = vi.fn();
    render(<FilterMenu label="Sector" options={options} selected={["a"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows the selected count and clears the selection", () => {
    const onChange = vi.fn();
    render(<FilterMenu label="Rating" options={options} selected={["a", "b"]} onChange={onChange} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
