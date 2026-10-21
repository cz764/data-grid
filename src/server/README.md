# Server modules

Server-only data access and the shared grid query service.

- `bond-store.ts` — the bond data source. The in-memory implementation generates 50,000 deterministic bonds and runs the mock quote producer (50 updates per second). A Supabase-backed store replaces it without changing the service.
- `grid-query.ts` — validates query input, creates ordered snapshots, pages through them by cursor, and returns current rows for polling.
- `cursor.ts` — signed, opaque cursors binding the snapshot, query fingerprint, last ordinal, and expiry.
- `errors.ts` — the structured error envelope and `Cache-Control: private, no-store` responses.

Route handlers under `src/app/api/v1/grid` are thin wrappers over this service. The Server Component calls the service directly for the first page.
