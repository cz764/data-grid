import type { BondRecord } from "@/data/bonds";
import type { GridCurrentRowsResponse, GridErrorResponse, GridPage, GridQueryRequest } from "@/data/grid";

const basePath = "/api/v1/grid";

export class GridRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GridRequestError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as GridErrorResponse | null;

    throw new GridRequestError(
      response.status,
      body?.error.code ?? "REQUEST_FAILED",
      body?.error.message ?? `Request failed with status ${response.status}.`,
      body?.error.retryable ?? response.status >= 500,
    );
  }

  return (await response.json()) as T;
}

export function createBondQuery(query: GridQueryRequest, signal?: AbortSignal) {
  return request<GridPage>(`${basePath}/queries`, { method: "POST", body: JSON.stringify(query), signal });
}

export function fetchBondPage(snapshotId: string, cursor: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ after: cursor });

  return request<GridPage>(`${basePath}/queries/${snapshotId}/rows?${params}`, { signal });
}

export async function fetchCurrentBonds(rowIds: readonly string[], signal?: AbortSignal): Promise<BondRecord[]> {
  const body = await request<GridCurrentRowsResponse>(`${basePath}/rows/current`, {
    method: "POST",
    body: JSON.stringify({ rowIds }),
    signal,
  });

  return body.rows;
}
