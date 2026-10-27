import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { bondColumns } from "@/components/BondGrid/columns";
import { BondToolbar } from "@/components/BondToolbar";
import { DataGridSkeleton } from "@/components/DataGridSkeleton";
import type { BondRecord } from "@/data/bonds";
import { defaultGridSort } from "@/data/grid";
import type { BondGridQuery } from "@/data/bond-search-params";
import { createMockBondRecords, mockBondRecords } from "@/mocks/bonds";

import { DataGrid, type DataGridColumn, type DataGridSort } from ".";

function sortRows<T extends object>(
  rows: readonly T[],
  sort: DataGridSort<T> | null,
) {
  if (!sort) return [...rows];

  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));

    return sort.direction === "asc" ? order : -order;
  });
}

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

function ControlledSortingGrid(
  args: React.ComponentProps<typeof DataGrid<BondRecord>>,
) {
  const [sort, setSort] = useState<DataGridSort<BondRecord> | null>({
    key: "bid",
    direction: "asc",
  });

  return (
    <DataGrid
      {...args}
      data={sortRows(args.data, sort)}
      sort={sort}
      onSortChange={setSort}
    />
  );
}

export const ControlledSorting: Story = {
  render: (args) => <ControlledSortingGrid {...args} />,
};

function AppToolbarGrid(
  args: React.ComponentProps<typeof DataGrid<BondRecord>>,
) {
  const [query, setQuery] = useState<BondGridQuery>({
    search: "",
    sector: [],
    creditRating: [],
    sort: defaultGridSort,
  });
  const search = query.search.toUpperCase();
  const data = sortRows(
    args.data.filter(
      (bond) =>
        (!search ||
          bond.cusip.includes(search) ||
          bond.ticker.toUpperCase().includes(search)) &&
        (query.sector.length === 0 || query.sector.includes(bond.sector)) &&
        (query.creditRating.length === 0 ||
          query.creditRating.includes(bond.creditRating)),
    ),
    { key: query.sort.field, direction: query.sort.direction },
  );

  return (
    <DataGrid
      {...args}
      data={data}
      totalCount={args.data.length}
      toolbar={<BondToolbar query={query} onQueryChange={setQuery} />}
      sort={{ key: query.sort.field, direction: query.sort.direction }}
      onSortChange={(sort) =>
        setQuery({
          ...query,
          sort: {
            field: sort.key as BondGridQuery["sort"]["field"],
            direction: sort.direction,
          },
        })
      }
    />
  );
}

export const AppToolbar: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The toolbar slot filled with the application's BondToolbar: substring search on CUSIP or ticker plus sector and rating menus, applied here to the local fixture.",
      },
    },
  },
  args: { data: createMockBondRecords(100) },
  render: (args) => <AppToolbarGrid {...args} />,
};

const ratingTiers = ["All", "AAA", "AA", "A"] as const;
const tierChipClass =
  "h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function QuickFilterToolbarGrid(
  args: React.ComponentProps<typeof DataGrid<BondRecord>>,
) {
  const [tier, setTier] = useState<(typeof ratingTiers)[number]>("All");
  const [maturingBefore, setMaturingBefore] = useState("");
  const data = args.data.filter(
    (bond) =>
      (tier === "All" || bond.creditRating.replace(/[+-]/g, "") === tier) &&
      (!maturingBefore || bond.maturity < maturingBefore),
  );
  const toolbar = (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Quick filters"
    >
      <div className="flex gap-1.5" role="radiogroup" aria-label="Rating tier">
        {ratingTiers.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={tier === option}
            className={`${tierChipClass} ${tier === option ? "border-accent bg-accent text-surface" : "border-border bg-surface text-muted-strong hover:border-accent-soft"}`}
            onClick={() => setTier(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted-strong">
        Maturing before
        <input
          type="date"
          className="h-8 rounded-full border border-border bg-surface px-3 text-xs text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          value={maturingBefore}
          onChange={(event) => setMaturingBefore(event.target.value)}
        />
      </label>
    </div>
  );

  return (
    <DataGrid
      {...args}
      data={data}
      totalCount={args.data.length}
      toolbar={toolbar}
    />
  );
}

export const QuickFilterToolbar: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Any element can fill the toolbar slot. This one uses rating-tier chips and a maturity date instead of the search box.",
      },
    },
  },
  args: {
    data: createMockBondRecords(100),
    name: "Investment grade watchlist",
    eyebrow: "Quick filters",
  },
  render: (args) => <QuickFilterToolbarGrid {...args} />,
};

interface ExtendedBondRecord extends BondRecord {
  faceValue: number;
  couponRate: number;
  callable: boolean;
}

const faceValues = [1_000, 5_000, 10_000, 25_000, 100_000];
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

const extendedBonds: ExtendedBondRecord[] = createMockBondRecords(100).map(
  (bond, index) => ({
    ...bond,
    faceValue: faceValues[index % faceValues.length],
    couponRate: (2.5 + (index % 12) * 0.25) / 100,
    callable: index % 3 === 0,
  }),
);

// Base columns only read fields that ExtendedBondRecord inherits, so widening the row type is safe.
const extendedColumns: readonly DataGridColumn<ExtendedBondRecord>[] = [
  ...(bondColumns as unknown as readonly DataGridColumn<ExtendedBondRecord>[]),
  {
    key: "faceValue",
    title: "Face value",
    width: 150,
    align: "end",
    sortable: true,
    renderCell: (value) => currencyFormatter.format(Number(value)),
  },
  {
    key: "couponRate",
    title: "Coupon",
    width: 120,
    align: "end",
    sortable: true,
    renderCell: (value) => percentFormatter.format(Number(value)),
  },
  {
    key: "callable",
    title: "Callable",
    width: 110,
    align: "center",
    renderCell: (value) => (value ? "Yes" : "No"),
  },
];

function ExtendedColumnsGrid(
  args: React.ComponentProps<typeof DataGrid<BondRecord>>,
) {
  const [sort, setSort] = useState<DataGridSort<ExtendedBondRecord> | null>(
    null,
  );

  return (
    <DataGrid<ExtendedBondRecord>
      {...args}
      data={sortRows(extendedBonds, sort)}
      columns={extendedColumns}
      getRowId={(bond) => bond.id}
      sort={sort}
      onSortChange={setSort}
    />
  );
}

export const ExtendedColumns: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The same grid rendering a wider record type. Face value, coupon rate, and callable are added as formatted columns on top of the default bond columns.",
      },
    },
  },
  args: { name: "Bond terms", eyebrow: "Extended column set" },
  render: (args) => <ExtendedColumnsGrid {...args} />,
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
