import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataGridSkeleton } from ".";

describe("DataGridSkeleton", () => {
  it("identifies the loading region", () => {
    render(<DataGridSkeleton />);

    expect(screen.getByRole("region", { name: "Loading bond inventory" })).toHaveAttribute("aria-busy", "true");
  });
});
