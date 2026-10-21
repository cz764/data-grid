import type { DataGridColumn } from "@/components/DataGrid";
import { bondSectorLabels, type BondRecord } from "@/data/bonds";

const quoteFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

export const bondColumns: readonly DataGridColumn<BondRecord>[] = [
  { key: "cusip", title: "CUSIP", width: 90, minWidth: 80, sortable: true },
  { key: "ticker", title: "Ticker", width: 90, minWidth: 80, sortable: true },
  {
    key: "issuer",
    title: "Issuer",
    width: 250,
    minWidth: 180,
    maxWidth: 420,
    sortable: true,
  },
  {
    key: "sector",
    title: "Sector",
    width: 150,
    sortable: true,
    renderCell: (value) => bondSectorLabels[value as BondRecord["sector"]],
  },
  { key: "creditRating", title: "Rating", width: 96, align: "center" },
  {
    key: "maturity",
    title: "Maturity",
    width: 136,
    sortable: true,
    renderCell: (value) =>
      dateFormatter.format(new Date(`${String(value)}T00:00:00Z`)),
  },
  {
    key: "bid",
    title: "Bid",
    width: 112,
    align: "end",
    sortable: true,
    renderCell: (value) => quoteFormatter.format(Number(value)),
  },
  {
    key: "ask",
    title: "Ask",
    width: 112,
    align: "end",
    sortable: true,
    renderCell: (value) => quoteFormatter.format(Number(value)),
  },
];
