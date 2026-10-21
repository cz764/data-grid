import { errorResponse, jsonResponse } from "@/server/errors";
import { getGridPage } from "@/server/grid-query";

export async function GET(request: Request, context: { params: Promise<{ snapshotId: string }> }) {
  try {
    const { snapshotId } = await context.params;
    const cursor = new URL(request.url).searchParams.get("after");

    return jsonResponse(getGridPage(snapshotId, cursor));
  } catch (error) {
    return errorResponse(error);
  }
}
