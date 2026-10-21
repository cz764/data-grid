import { errorResponse, jsonResponse, readJsonBody } from "@/server/errors";
import { createGridQuery } from "@/server/grid-query";

export async function POST(request: Request) {
  try {
    return jsonResponse(createGridQuery(await readJsonBody(request)), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
