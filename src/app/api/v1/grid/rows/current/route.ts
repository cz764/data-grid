import type { GridCurrentRowsResponse } from "@/data/grid";
import { errorResponse, jsonResponse, readJsonBody } from "@/server/errors";
import { getCurrentRows } from "@/server/grid-query";

export async function POST(request: Request) {
  try {
    const body: GridCurrentRowsResponse = { rows: await getCurrentRows(await readJsonBody(request)) };

    return jsonResponse(body);
  } catch (error) {
    return errorResponse(error);
  }
}
