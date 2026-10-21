# Parking lot

Improvements and open items that the design doc calls for but the current code does not deliver, plus
decisions deferred during implementation. Each entry names the design doc section it comes from.
Remove an entry when it ships.

## Decided to defer

### Publish subscriptions on change (§2.1, §4.4)

With Supabase, a server process publishes its subscribed row IDs to `grid_subscriptions` on a five-second
heartbeat. A row that scrolls into view can wait up to five seconds before the producer learns about it,
then one producer tick and one feed poll before its first update is pushed. Adding a debounced publish
when the registry changes, on top of the periodic beat, cuts the typical wait to about two seconds. The
heartbeat itself stays: it is the liveness signal that lets the producer drop subscriptions from crashed or
redeployed processes. Removing it would need a time-to-live refreshed by the process, which is a heartbeat
under another name. Deferred on 2026-10-21 because the current delay is acceptable for the demo.

### shadcn/ui (§2.3)

The design doc selects shadcn/ui for visual primitives. The code uses Tailwind utilities with native
elements (`details` for the filter menus, plain inputs and buttons). Decide whether to adopt shadcn/ui for
the toolbar primitives or update §2.3 to record the native-element choice.

## Not yet implemented

### Infinite-scroll cache budget and eviction (§7)

TanStack Query holds every discovered page for the session. The doc calls for a budget of roughly 10
pages, eviction of distant pages while retaining the viewport and focused rows, fixed-height placeholders
for evicted ranges so scroll geometry is preserved, and refetch on approach without counting toward the
six automatic loads.

### Snapshot-expiry and rate-limit handling on the client (§5.5)

The browser client maps every non-2xx response to a generic error. The doc specifies that a 410
`SNAPSHOT_EXPIRED` keeps the displayed rows and requires a new query, that a 429 respects `Retry-After`
and retains existing rows, and that 401/403 stop requests and show the access state. Today a 410 on a
later page shows the footer Retry, which retries the same expired cursor.

### Rate limiting and body-size validation on the server (§5, §5.5)

Routes validate projections, filters, sorting, and cursor integrity, but there is no request rate limit
for queries, streams, or polling, and no explicit body-size limit on the JSON routes.

### Access scope (§5.6)

Row Level Security is enabled on all tables with no policies; server code uses the secret key, which
bypasses RLS. The doc's restricted anonymous session for the public demo, and tenant scope derived from
verified identity, are not implemented.

### Domain validation at the boundary (§4.1, §10)

"Validate the domain shape when data enters the application" is not done for rows read from the
database: UUIDs, identifier lengths, sector values, maturity dates, rating strings, numeric precision, and
`ask >= bid` are trusted as stored. The database constraints cover inserts, not reads.

### Scheduled cleanup (§4.3)

`cleanup_grid_state()` exists and expired snapshots are purged when a new snapshot is created, but nothing
runs on a schedule. Register it with pg_cron, or a Supabase scheduled function, so an idle database does
not keep expired entries.

### Index review after inspecting query plans (§4.2)

Indexes exist on `id`, `isin`, `cusip`, `(ticker, id)`, `sector`, and `credit_rating`. The doc asks for
indexes on demonstrated filter and sort combinations after reading actual `EXPLAIN` output, which has not
been collected.

### Back and forward navigation (§3, Toolbar)

Filter and sort state is written to the URL with `history.replaceState`, so a reload restores it, but the
page does not listen for `popstate`. Browser back and forward do not change the query.

### Second column configuration (§1 Assumptions, §10 Reuse)

The API accepts a `fields` projection and the grid is generic, but the app renders one view with every
field. The reuse check calls for two column configurations rendered with the same grid.

### Column virtualization (§7)

Deferred by the doc until profiling shows a need. Revisit if a wider column set is added.

## Measurements not yet collected (§10)

The doc lists acceptance checks that should be recorded with dataset size, page size, visible and mounted
row counts, browser and device, build mode, conflation interval, and database latency. None have been run:

- Producer throughput and Supabase write latency for 50 subscribed rows plus the background rate. The
  producer logs per-tick latency; capture a run.
- Push freshness: producer commit-to-display latency for up to 50 visible rows, target p95 below 1.5
  seconds; reconnect fetches a snapshot; polling fallback engages after repeated stream failures.
- Snapshot creation time and storage at 50,000 rows (§4.3), and the 100,000-row benchmark (§1).
- Virtualization: mounted rows follow viewport plus overscan rather than loaded or total row count.
- Memory: resident page cache near its budget while traversing the dataset (depends on eviction above).
- Responsiveness: smooth scrolling and no update-driven tasks over 50 ms on the reference desktop; a
  separate mobile profile.
- Cursor correctness: mutate quotes across page boundaries and verify a snapshot has no skipped or
  repeated IDs against the real database.
- Hybrid browsing: six automatic loads, manual loads afterward, retry, and reset after sort or filter
  changes, verified in the browser.
- Accessibility: keyboard traversal and resizing, VoiceOver on macOS, and automated checks beyond the
  Storybook a11y addon.

## Explicitly out of scope for the first version (§1)

Editing, selection, bulk actions, grouping, export, historical charts, live insertion or deletion,
continuous reordering as quotes change, agency-aware ratings and rating sorting, nullability, and
identifier checksum validation. Supabase Realtime, WebSocket, and a real market data feed remain
alternatives if the demo needs them.
