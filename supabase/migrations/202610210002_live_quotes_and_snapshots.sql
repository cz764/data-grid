-- Synchronization metadata written by the producer with every quote change.
alter table public.bonds
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists bonds_sector_idx on public.bonds (sector);
create index if not exists bonds_credit_rating_idx on public.bonds (credit_rating);

-- One stable filtered order per query; pages seek by ordinal within it.
create table if not exists public.grid_snapshots (
  id uuid primary key default gen_random_uuid(),
  query_hash text not null,
  sort_definition jsonb not null,
  filter_definition jsonb not null,
  fields jsonb not null,
  page_size integer not null check (page_size between 1 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  total_count bigint not null default 0
);

create index if not exists grid_snapshots_expires_at_idx on public.grid_snapshots (expires_at);

create table if not exists public.grid_snapshot_entries (
  snapshot_id uuid not null references public.grid_snapshots (id) on delete cascade,
  ordinal bigint not null,
  record_id uuid not null references public.bonds (id),
  primary key (snapshot_id, ordinal)
);

-- Row IDs each server process currently streams, so the producer can follow the audience.
create table if not exists public.grid_subscriptions (
  id uuid primary key,
  row_ids uuid[] not null,
  heartbeat_at timestamptz not null default now()
);

-- The browser never queries Supabase directly; server code uses the secret key, which bypasses RLS.
alter table public.bonds enable row level security;
alter table public.grid_snapshots enable row level security;
alter table public.grid_snapshot_entries enable row level security;
alter table public.grid_subscriptions enable row level security;

create or replace function public.escape_like_prefix(p_value text)
returns text
language sql
immutable
as $fn$
  select case
    when p_value is null or p_value = '' then null
    else replace(replace(replace(p_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$fn$;

create or replace function public.create_grid_snapshot(
  p_query_hash text,
  p_sort jsonb,
  p_filters jsonb,
  p_fields jsonb,
  p_page_size integer,
  p_ttl_seconds integer
)
returns public.grid_snapshots
language plpgsql
as $fn$
declare
  v_row public.grid_snapshots;
  v_sort_field text := p_sort ->> 'field';
  v_direction text := case when p_sort ->> 'direction' = 'desc' then 'desc' else 'asc' end;
  v_cusip text := public.escape_like_prefix(p_filters ->> 'cusip');
  v_ticker text := public.escape_like_prefix(p_filters ->> 'ticker');
  v_sectors text[] := case
    when jsonb_typeof(p_filters -> 'sector') = 'array'
      then array(select jsonb_array_elements_text(p_filters -> 'sector'))
  end;
  v_ratings text[] := case
    when jsonb_typeof(p_filters -> 'creditRating') = 'array'
      then array(select jsonb_array_elements_text(p_filters -> 'creditRating'))
  end;
  v_count bigint;
begin
  if v_sort_field not in ('cusip', 'ticker', 'issuer', 'sector', 'maturity', 'bid', 'ask') then
    raise exception 'unsupported sort field: %', v_sort_field using errcode = '22023';
  end if;

  delete from public.grid_snapshots where expires_at < now();

  insert into public.grid_snapshots (query_hash, sort_definition, filter_definition, fields, page_size, expires_at)
  values (p_query_hash, p_sort, p_filters, p_fields, p_page_size, now() + make_interval(secs => p_ttl_seconds))
  returning * into v_row;

  execute format(
    $sql$
      insert into public.grid_snapshot_entries (snapshot_id, ordinal, record_id)
      select $1, row_number() over (order by %I %s, id asc) - 1, id
      from public.bonds
      where (
          ($2 is null and $3 is null)
          or ($2 is not null and cusip ilike $2)
          or ($3 is not null and ticker ilike $3)
        )
        and ($4 is null or sector = any ($4))
        and ($5 is null or credit_rating = any ($5))
    $sql$,
    v_sort_field,
    v_direction
  )
  using v_row.id, v_cusip, v_ticker, v_sectors, v_ratings;

  get diagnostics v_count = row_count;

  update public.grid_snapshots set total_count = v_count where id = v_row.id returning * into v_row;

  return v_row;
end;
$fn$;

-- Producer batch write: bid, ask, version, and updated_at change in one statement.
create or replace function public.apply_quote_updates(p_updates jsonb)
returns integer
language sql
as $fn$
  with updated as (
    update public.bonds b
    set bid = u.bid,
        ask = u.ask,
        version = b.version + 1,
        updated_at = now()
    from jsonb_to_recordset(p_updates) as u (id uuid, bid numeric, ask numeric)
    where b.id = u.id
      and u.bid >= 0
      and u.ask >= u.bid
    returning b.id
  )
  select count(*)::integer from updated;
$fn$;

-- Union of row IDs from server processes that reported recently.
create or replace function public.subscribed_bond_ids(p_max_age_seconds integer default 15)
returns setof uuid
language sql
stable
as $fn$
  select distinct unnest(row_ids)
  from public.grid_subscriptions
  where heartbeat_at > now() - make_interval(secs => p_max_age_seconds);
$fn$;

-- Cheap random sample for background drift; tablesample avoids a full scan.
create or replace function public.random_bond_ids(p_count integer)
returns setof uuid
language sql
stable
as $fn$
  select id from public.bonds tablesample system (1) order by random() limit p_count;
$fn$;

create or replace function public.cleanup_grid_state()
returns integer
language sql
as $fn$
  with snapshots as (
    delete from public.grid_snapshots where expires_at < now() returning 1
  ),
  subscriptions as (
    delete from public.grid_subscriptions where heartbeat_at < now() - interval '1 minute' returning 1
  )
  select (select count(*) from snapshots)::integer + (select count(*) from subscriptions)::integer;
$fn$;
