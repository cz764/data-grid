import { errorResponse } from "@/server/errors";
import { getQuoteFeed } from "@/server/quote-feed";
import { createQuoteStreamResponse } from "@/server/quote-stream";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return createQuoteStreamResponse(request, getQuoteFeed());
  } catch (error) {
    return errorResponse(error);
  }
}
