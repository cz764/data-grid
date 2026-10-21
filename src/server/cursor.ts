import { createHmac, timingSafeEqual } from "node:crypto";

import { GridError } from "./errors";

export interface CursorPayload {
  snapshotId: string;
  queryFingerprint: string;
  ordinal: number;
  expiresAt: string;
}

const secret = process.env.GRID_CURSOR_SECRET ?? "local-development-cursor-secret";

function sign(payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeCursor(payload: CursorPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function decodeCursor(cursor: string): CursorPayload {
  const [encoded, signature] = cursor.split(".");

  if (!encoded || !signature) {
    throw new GridError(400, "INVALID_CURSOR", "The cursor is malformed.");
  }

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new GridError(400, "INVALID_CURSOR", "The cursor signature is invalid.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as CursorPayload;

  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new GridError(410, "SNAPSHOT_EXPIRED", "The query snapshot has expired.");
  }

  return payload;
}
