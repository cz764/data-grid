import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { bondColumns } from "@/components/BondGrid/columns";
import { DataGridSkeleton } from "@/components/DataGridSkeleton";
import type { BondRecord } from "@/data/bonds";
import { createMockBondRecords, mockBondRecords } from "@/mocks/bonds";

import { DataGrid, type DataGridSort } from ".";

const meta = {
  title: "Data Grid/DataGrid",
  component: DataGrid<BondRecord>,
  parameters: {
    docs: {
      description: {
        component:
          "A read-only, virtualized data grid. It receives rows and column definitions and reports sorting, load-more, and visible-row changes to its parent.",
      },
    },
  },
  decorators: [
    (Story) => (
      <main className="flex h-dvh flex-col p-4 sm:p-6">
        <Story />
      </main>
    ),
  ],
  args: {
    name: "Bond market watch",
    eyebrow: "Live bond inventory",
    data: mockBondRecords,
    columns: bondColumns,
    getRowId: (bond) => bond.id,
    className: "min-h-0 flex-1",
  },
  argTypes: {
    onSortChange: { action: "sort change" },
    onLoadMore: { action: "load more" },
    onRetry: { action: "retry" },
    onVisibleRowsChange: { action: "visible rows" },
  },
} satisfies Meta<typeof DataGrid<BondRecord>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwentyBonds: Story = {};

function ControlledSortingGrid(args: React.ComponentProps<typeof DataGrid<BondRecord>>) {
  const [sort, setSort] = useState<DataGridSort<BondRecord> | null>({ key: "bid", direction: "asc" });
  const data = [...args.data].sort((a, b) => {
    if (!sort) return 0;
    const left = a[sort.key];
    const right = b[sort.key];
    const order =
      typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));

    return sort.direction === "asc" ? order : -order;
  });

  return <DataGrid {...args} data={data} sort={sort} onSortChange={setSort} />;
}

export const ControlledSorting: Story = {
  render: (args) => <ControlledSortingGrid {...args} />,
};

export const Empty: Story = {
  args: {
    data: [],
    name: "Empty bond inventory",
  },
};

export const NarrowViewport: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};

export const Loading: Story = {
  args: {
    data: [],
    isLoading: true,
  },
};

export const LoadingSkeletonFallback: Story = {
  render: () => <DataGridSkeleton />,
};

export const InitialError: Story = {
  args: {
    data: [],
    error: new Error("The grid service is unavailable."),
  },
};

export const LoadMore: Story = {
  args: {
    data: createMockBondRecords(100),
    totalCount: 1250,
    hasMore: true,
  },
};

export const RefreshingQuery: Story = {
  args: {
    ...LoadMore.args,
    isRefreshing: true,
  },
};

export const LoadingAnotherPage: Story = {
  args: {
    ...LoadMore.args,
    isLoading: true,
  },
};

export const LaterPageError: Story = {
  args: {
    ...LoadMore.args,
    error: new Error("Request timed out."),
  },
};

export const Virtualized: Story = {
  args: {
    data: createMockBondRecords(2000),
    totalCount: 50000,
    hasMore: true,
    autoLoadMore: true,
  },
};
