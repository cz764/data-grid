export const bondSectors = ["Muni", "corp", "agency", "trea", "MBS", "ABS"] as const;

export type BondSector = (typeof bondSectors)[number];

export const bondCreditRatings = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+"] as const;

export interface Bond {
  id: string;
  isin: string;
  cusip: string;
  ticker: string;
  issuer: string;
  sector: BondSector;
  creditRating: string;
  maturity: string;
  bid: number;
  ask: number;
}

export interface BondRecord extends Bond {
  version: string;
  updatedAt: string;
}

export const bondFields = [
  "isin",
  "cusip",
  "ticker",
  "issuer",
  "sector",
  "creditRating",
  "maturity",
  "bid",
  "ask",
] as const;

export type BondField = (typeof bondFields)[number];

export const bondSortableFields = ["cusip", "ticker", "issuer", "sector", "maturity", "bid", "ask"] as const;

export type BondSortField = (typeof bondSortableFields)[number];

export const bondSectorLabels: Record<BondSector, string> = {
  Muni: "Municipal",
  corp: "Corporate",
  agency: "Agency",
  trea: "Treasury",
  MBS: "Mortgage-backed securities",
  ABS: "Asset-backed securities",
};

export function isBondSector(value: string): value is BondSector {
  return (bondSectors as readonly string[]).includes(value);
}

export function isBondField(value: string): value is BondField {
  return (bondFields as readonly string[]).includes(value);
}

export function isBondSortField(value: string): value is BondSortField {
  return (bondSortableFields as readonly string[]).includes(value);
}
