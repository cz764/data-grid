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
│   ├── api/v1/grid/             # route handlers: queries, cursor pages, current rows
│   ├── globals.css              # Tailwind import, theme tokens, shared utilities
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── page.tsx                 # reads URL search params, renders the Suspense fallback
│   └── providers.tsx            # TanStack Query provider
├── components/
│   ├── BondGrid/                # page-level composition: query state, URL sync, polling
│   │   ├── columns.tsx
│   │   └── use-bond-query.ts
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
    ├── bond-store.ts            # in-memory store with the mock quote producer
    ├── cursor.ts
    ├── errors.ts
    └── grid-query.ts            # shared query service
```

Non-component directories and supporting files use lowercase names. Each React component uses a PascalCase directory matching the exported component name and keeps its implementation and tests together. Styling is Tailwind utilities in JSX; theme tokens live in `src/app/globals.css`.

## Data flow

The Server Component calls the shared query service for the first page and passes it to `BondGrid`. The browser creates new queries and fetches further pages through `/api/v1/grid`, and polls the visible row IDs once per second. Until Supabase is seeded, the service runs against an in-memory store of 50,000 generated bonds with a producer that updates 50 quotes per second.

### DataGrid keyboard

| Key | Behavior |
| --- | --- |
| Arrow keys | Move between cells; the header row is reachable with ArrowUp. |
| Tab / Shift+Tab | Next or previous cell in row-major order; exits the grid at its boundaries. |
| Enter / Space | Sort the focused sortable header. |
| Shift+ArrowLeft / Shift+ArrowRight | Resize the focused column. |
| Home / End | First or last cell in the row; with Ctrl, the first or last row. |

## Supabase seed

The migration creates `public.bonds` with the agreed constraints. `supabase/seed.sql` uses PostgreSQL `generate_series` to insert or refresh 50,000 deterministic synthetic bonds without committing a large fixture file.
