# Server modules

Server-only data access and the shared grid query service.

- `bond-store.ts` — the bond data source. The in-memory implementation generates 50,000 deterministic bonds and runs the mock quote producer: every subscribed bond updates once per second plus a background sample of ten. A Supabase-backed store replaces it without changing the service.
- `subscriptions.ts` — the registry of row IDs that open streams subscribe to; the producer reads its union each tick.
- `quote-feed.ts` — the stream tier's only dependency: subscribe to row IDs and receive conflated updates. The in-memory feed listens to producer ticks; the Supabase version will poll by ID.
- `quote-stream.ts` — builds the Server-Sent Events response: `quotes` events, a heartbeat comment every 15 seconds, and release on abort.
- `grid-query.ts` — validates query input, creates ordered snapshots, pages through them by cursor, and returns current rows for polling.
- `cursor.ts` — signed, opaque cursors binding the snapshot, query fingerprint, last ordinal, and expiry.
- `errors.ts` — the structured error envelope and `Cache-Control: private, no-store` responses.

Route handlers under `src/app/api/v1/grid` are thin wrappers over this service. The Server Component calls the service directly for the first page.
