import type { SupabaseClient } from "@supabase/supabase-js";

import type { BondField, BondRecord, BondSector } from "@/data/bonds";
import type { GridSort } from "@/data/grid";

import type { BondStore, SnapshotInfo, SnapshotQuery } from "./bond-store";
import { createSupabaseServerClient } from "./supabase";

interface BondRow {
  id: string;
  isin: string;
  cusip: string;
  ticker: string;
  issuer: string;
  sector: string;
  credit_rating: string;
  maturity: string;
  bid: number | string;
  ask: number | string;
  version: number | string;
  updated_at: string;
}

interface SnapshotRow {
  id: string;
  query_hash: string;
  sort_definition: GridSort;
  filter_definition: SnapshotQuery["filters"];
  fields: BondField[];
  page_size: number;
  expires_at: string;
  total_count: number | string;
}

export function toBondRecord(row: BondRow): BondRecord {
  return {
    id: row.id,
    isin: row.isin,
    cusip: row.cusip,
    ticker: row.ticker,
    issuer: row.issuer,
    sector: row.sector as BondSector,
    creditRating: row.credit_rating,
    maturity: row.maturity,
    bid: Number(row.bid),
    ask: Number(row.ask),
    version: String(row.version),
    updatedAt: row.updated_at,
  };
}

function toSnapshotInfo(row: SnapshotRow): SnapshotInfo {
  return {
    id: row.id,
    queryFingerprint: row.query_hash,
    expiresAt: row.expires_at,
    totalCount: Number(row.total_count),
    query: {
      sort: row.sort_definition,
      filters: row.filter_definition,
      fields: row.fields,
      pageSize: row.page_size,
    },
  };
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }

  if (result.data === null) {
    throw new Error(`${context}: no data returned.`);
  }

  return result.data;
}

export class SupabaseBondStore implements BondStore {
  constructor(private readonly client: SupabaseClient = createSupabaseServerClient()) {}

  async createSnapshot(query: SnapshotQuery, queryFingerprint: string, ttlMs: number): Promise<SnapshotInfo> {
    const result = await this.client
      .rpc("create_grid_snapshot", {
        p_query_hash: queryFingerprint,
        p_sort: query.sort,
        p_filters: query.filters,
        p_fields: query.fields,
        p_page_size: query.pageSize,
        p_ttl_seconds: Math.round(ttlMs / 1000),
      })
      .single();

    return toSnapshotInfo(unwrap(result, "create_grid_snapshot") as SnapshotRow);
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotInfo | null> {
    const result = await this.client
      .from("grid_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (result.error) {
      throw new Error(`grid_snapshots lookup: ${result.error.message}`);
    }

    return result.data ? toSnapshotInfo(result.data as SnapshotRow) : null;
  }

  async readSnapshotRows(snapshotId: string, afterOrdinal: number, limit: number): Promise<BondRecord[]> {
    const result = await this.client
      .from("grid_snapshot_entries")
      .select("ordinal, bond:bonds(*)")
      .eq("snapshot_id", snapshotId)
      .gt("ordinal", afterOrdinal)
      .order("ordinal", { ascending: true })
      .limit(limit);
    const entries = unwrap(result, "grid_snapshot_entries page") as unknown as { bond: BondRow | null }[];

    return entries.flatMap((entry) => (entry.bond ? [toBondRecord(entry.bond)] : []));
  }

  async getByIds(ids: readonly string[]): Promise<BondRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.client.from("bonds").select("*").in("id", ids);

    return (unwrap(result, "bonds by id") as BondRow[]).map(toBondRecord);
  }
}
