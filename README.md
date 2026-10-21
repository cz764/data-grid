# Bond data grid

A reusable, read-only React data grid demonstrated in a Next.js application. The initial scaffold includes a typed bond model, 20 deterministic local records, Storybook examples, and a Supabase seed that generates 50,000 records.

## Local development

Use Node.js 22 LTS or Node.js 24 and later.

```bash
npm install
npm run dev
```

Open Storybook with:

```bash
npm run storybook
```

Run component tests with:

```bash
npm test
```

## Project structure

```text
src/
├── api/
│   └── bonds.ts                 # browser fetch client for the grid endpoints
├── app/
│   ├── api/v1/grid/             # route handlers: queries, cursor pages, current rows, quote stream
│   ├── globals.css              # Tailwind import, theme tokens, shared utilities
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── page.tsx                 # reads URL search params, renders the Suspense fallback
│   └── providers.tsx            # TanStack Query provider
├── components/
│   ├── BondGrid/                # page-level composition: query state, URL sync, polling
│   │   ├── columns.tsx
│   │   ├── use-bond-query.ts
│   │   └── use-quote-stream.ts  # SSE subscription for visible rows with polling fallback
│   ├── BondLoader/              # Server Component that loads the first page
│   ├── BondToolbar/             # search CUSIP or ticker, sector and rating filters
│   ├── DataGrid/                # reusable grid: sorting, resizing, virtualization, keyboard
│   │   └── DataGrid.stories.tsx
│   ├── DataGridSkeleton/
│   └── FilterMenu/
├── data/
│   ├── bonds.ts                 # bond model and field lists
│   ├── bond-search-params.ts    # URL query <-> filters and sort
│   └── grid.ts                  # API contract types
├── mocks/
│   └── bonds.ts                 # deterministic fixtures
└── server/
    ├── bond-store.ts            # BondStore interface and store selection
    ├── cursor.ts
    ├── errors.ts
    ├── grid-query.ts            # shared query service
    ├── in-memory-store.ts       # generated dataset with the mock producer
    ├── quote-feed.ts            # subscribe to row IDs, receive conflated updates
    ├── quote-stream.ts          # Server-Sent Events response
    ├── quotes.ts                # bid/ask random walk
    ├── subscriptions.ts         # registry of subscribed row IDs
    ├── supabase.ts              # server-only client
    ├── supabase-store.ts        # BondStore over Supabase
    └── supabase-subscriptions.ts
scripts/
└── producer.ts                  # Supabase quote producer process
```

Non-component directories and supporting files use lowercase names. Each React component uses a PascalCase directory matching the exported component name and keeps its implementation and tests together. Styling is Tailwind utilities in JSX; theme tokens live in `src/app/globals.css`.

## Data flow

The Server Component calls the shared query service for the first page and passes it to `BondGrid`. The browser creates new queries and fetches further pages through `/api/v1/grid`, and opens one Server-Sent Events stream for the row IDs in the viewport. On each connect it fetches a snapshot of those rows, then applies pushed `quotes` events whose version is newer than the displayed one. After three failed reconnects it falls back to one-second polling, and the grid eyebrow reads "polling". With Supabase configured, the service creates snapshots in SQL and a separate producer process writes the quotes; otherwise an in-memory store of 50,000 generated bonds plays both roles.

Cells whose value changed since the row was last shown flash in the accent tint; pass `highlightChanges={false}` to disable it.

### DataGrid keyboard

| Key | Behavior |
| --- | --- |
| Arrow keys | Move between cells; the header row is reachable with ArrowUp. |
| Tab / Shift+Tab | Next or previous cell in row-major order; exits the grid at its boundaries. |
| Enter / Space | Sort the focused sortable header. |
| Shift+ArrowLeft / Shift+ArrowRight | Resize the focused column. |
| Home / End | First or last cell in the row; with Ctrl, the first or last row. |

## Supabase

Without credentials the app runs against an in-memory store with a built-in producer. To run against Supabase:

1. Create a project at supabase.com, then link it and apply the migrations and the 50,000-row seed:

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push --include-seed
   ```

2. Copy `.env.example` to `.env.local` and set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the project's secret or service_role key; it stays on the server).

3. Start the app and, in a second terminal, the producer:

   ```bash
   npm run dev
   npm run producer
   ```

The producer updates every row that an open stream subscribes to once per second, plus a random background sample, through the `apply_quote_updates` SQL function. Server processes publish their subscribed IDs to `grid_subscriptions` with a five-second heartbeat. Expired snapshots are deleted when a new snapshot is created; `cleanup_grid_state()` can also be scheduled with pg_cron.

The migrations create `public.bonds` with the agreed constraints plus `version` and `updated_at`, the snapshot tables, the subscriptions table, and the SQL functions. `supabase/seed.sql` uses `generate_series` to insert or refresh 50,000 deterministic synthetic bonds without committing a large fixture file.
