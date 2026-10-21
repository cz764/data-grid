import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { GridErrorResponse } from "@/data/grid";

export class GridError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GridError";
  }
}

const noStoreHeaders = { "Cache-Control": "private, no-store" };

export function jsonResponse<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...noStoreHeaders, ...init?.headers } });
}

export function errorResponse(error: unknown) {
  const gridError =
    error instanceof GridError
      ? error
      : new GridError(500, "INTERNAL_ERROR", "The request could not be completed.", true);
  const body: GridErrorResponse = {
    error: { code: gridError.code, message: gridError.message, retryable: gridError.retryable },
    requestId: randomUUID(),
  };

  return jsonResponse(body, { status: gridError.status });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GridError(400, "INVALID_BODY", "The request body must be valid JSON.");
  }
}
