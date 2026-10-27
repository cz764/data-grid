import { bondSectors, type Bond, type BondRecord } from "@/data/bonds";

const issuers = [
  "Northstar Municipal Authority",
  "Atlas Industrial Holdings",
  "Federal Home Lending Agency",
  "United States Treasury",
  "Harborview Mortgage Trust",
  "Pioneer Auto Receivables",
  "Redwood Energy Group",
  "Crescent Health Systems",
  "Metro Transit Authority",
  "Summit Communications",
] as const;

const ratings = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+"] as const;

const tickerNames = [
  "NSMA", "ATLS", "FHLA", "UST", "HARB", "PAR", "RDWD", "CRHS", "MTA", "SUMC",
  "GLX", "VNTR", "ORCA", "KPLR", "ZEN", "AXIO", "TRBL", "NOVA", "IRIS", "QNT",
] as const;

function deterministicUuid(index: number) {
  return `b0a00000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function letter(value: number) {
  return String.fromCharCode(65 + (value % 26));
}

// Mirrors supabase/seed.sql: letters rotate through the start, middle, and end of the CUSIP.
export function mockCusip(index: number) {
  const digits = String(100000 + index);
  const letters = letter(index * 7) + letter(index * 11) + letter(index * 17);

  switch (index % 4) {
    case 0:
      return letters + digits;
    case 1:
      return digits.slice(0, 3) + letters + digits.slice(3);
    case 2:
      return digits + letters;
    default:
      return digits + String((index * 7) % 1000).padStart(3, "0");
  }
}

export function mockTicker(index: number) {
  const group = ((index - 1) % 1000) + 1;
  const name = tickerNames[(index - 1) % tickerNames.length];

  if (group <= 250) {
    return `BND${String(group).padStart(3, "0")}`;
  }

  if (group <= 500) {
    return name;
  }

  if (group <= 750) {
    return `${name}${25 + (group % 30)}`;
  }

  return `${letter(group)}${letter(group * 3)}${letter(group * 5)}${group % 10}${letter(group * 7)}`;
}

export function createMockBonds(count = 20): Bond[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const bid = Number((93.75 + ((index * 137) % 1000) / 100).toFixed(4));
    const spread = 0.025 + (index % 5) * 0.0125;
    const maturityYear = 2028 + (index % 20);
    const maturityMonth = String((index % 12) + 1).padStart(2, "0");
    const maturityDay = String((index % 27) + 1).padStart(2, "0");

    return {
      id: deterministicUuid(index),
      isin: `US${index.toString().padStart(10, "0")}`,
      cusip: mockCusip(index),
      ticker: mockTicker(index),
      issuer: issuers[offset % issuers.length],
      sector: bondSectors[offset % bondSectors.length],
      creditRating: ratings[offset % ratings.length],
      maturity: `${maturityYear}-${maturityMonth}-${maturityDay}`,
      bid,
      ask: Number((bid + spread).toFixed(4)),
    };
  });
}

export const mockBonds = createMockBonds(20);

export function createMockBondRecords(count = 20): BondRecord[] {
  return createMockBonds(count).map((bond) => ({ ...bond, version: "1", updatedAt: "2026-10-21T14:00:00.000Z" }));
}

export const mockBondRecords = createMockBondRecords(20);
