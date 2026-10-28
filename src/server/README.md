# Server modules

Server-only data access and the shared grid query service.

- `bond-store.ts` — the `BondStore` interface (snapshot creation, page reads by ordinal, rows by ID) and `getBondStore()`, which returns the Supabase store when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set and the in-memory store otherwise.
- `in-memory-store.ts` — generates 50,000 deterministic bonds, keeps snapshots in process, and runs the mock producer: every subscribed bond updates once per second plus a background sample of ten.
- `supabase-store.ts` — the same interface over Supabase: `create_grid_snapshot` reuses a fresh snapshot with the same query hash or builds the ordered membership in SQL, pages join `grid_snapshot_entries` to `bonds`, and current rows are read by ID.
- `supabase.ts` — server-only client factory and the configuration check.
- `supabase-subscriptions.ts` — heartbeat that publishes this process's subscribed row IDs to `grid_subscriptions` so the external producer (`scripts/producer.ts`) can follow the audience.
- `quotes.ts` — the bid/ask random walk shared by the in-memory producer and the Supabase producer script.
- `subscriptions.ts` — the registry of row IDs that open streams subscribe to; the producer reads its union each tick.
- `quote-feed.ts` — the stream tier's only dependency: subscribe to row IDs and receive conflated updates. The in-memory feed listens to producer ticks; the polling feed used with Supabase reads the union of subscribed rows once per second and fans out the ones whose version advanced.
- `quote-stream.ts` — builds the Server-Sent Events response: `quotes` events, a heartbeat comment every 15 seconds, and release on abort.
- `grid-query.ts` — validates query input, creates ordered snapshots, pages through them by cursor, and returns current rows for polling.
- `cursor.ts` — signed, opaque cursors binding the snapshot, query fingerprint, last ordinal, and expiry.
- `errors.ts` — the structured error envelope and `Cache-Control: private, no-store` responses.

Route handlers under `src/app/api/v1/grid` are thin wrappers over this service. The Server Component calls the service directly for the first page.
