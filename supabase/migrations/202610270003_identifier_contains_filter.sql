-- CUSIP and ticker search match anywhere in the identifier instead of only at the start.
create or replace function public.escape_like_contains(p_value text)
returns text
language sql
immutable
as $fn$
  select case
    when p_value is null or p_value = '' then null
    else '%' || replace(replace(replace(p_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
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

drop function if exists public.escape_like_prefix(text);
