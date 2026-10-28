-- Identical queries share one fresh snapshot instead of materializing the same order again.
-- A snapshot is reused only while at least half its lifetime remains, so a reused cursor
-- still has a useful window and a new query never sees an order older than half the TTL.
create index if not exists grid_snapshots_query_hash_expires_at_idx
  on public.grid_snapshots (query_hash, expires_at desc);

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
  v_cusip text := public.escape_like_contains(p_filters ->> 'cusip');
  v_ticker text := public.escape_like_contains(p_filters ->> 'ticker');
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

  -- Concurrent identical queries wait for the first one so only it materializes the order.
  perform pg_advisory_xact_lock(hashtext(p_query_hash));

  delete from public.grid_snapshots where expires_at < now();

  select * into v_row
  from public.grid_snapshots
  where query_hash = p_query_hash
    and expires_at >= now() + make_interval(secs => p_ttl_seconds::double precision / 2)
  order by expires_at desc
  limit 1;

  if found then
    return v_row;
  end if;

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
