with generated_bonds as (
  select
    (
      substr(md5('bond-' || series::text), 1, 8) || '-' ||
      substr(md5('bond-' || series::text), 9, 4) || '-' ||
      '4' || substr(md5('bond-' || series::text), 14, 3) || '-' ||
      '8' || substr(md5('bond-' || series::text), 18, 3) || '-' ||
      substr(md5('bond-' || series::text), 21, 12)
    )::uuid as id,
    'US' || lpad(series::text, 10, '0') as isin,
    lpad(series::text, 9, '0') as cusip,
    'BND' || lpad(((series - 1) % 250 + 1)::text, 3, '0') as ticker,
    'Synthetic Issuer ' || lpad(((series - 1) % 1000 + 1)::text, 4, '0') as issuer,
    (array['Muni', 'corp', 'agency', 'trea', 'MBS', 'ABS'])[((series - 1) % 6) + 1] as sector,
    (array['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+'])[((series - 1) % 8) + 1] as credit_rating,
    (date '2028-01-01' + ((series * 17) % 7305))::date as maturity,
    round((90 + ((series * 137) % 2000) / 100.0)::numeric, 4) as bid,
    round((90 + ((series * 137) % 2000) / 100.0 + 0.025 + (series % 5) * 0.0125)::numeric, 4) as ask
  from generate_series(1, 50000) as series
)
insert into public.bonds (
  id,
  isin,
  cusip,
  ticker,
  issuer,
  sector,
  credit_rating,
  maturity,
  bid,
  ask
)
select
  id,
  isin,
  cusip,
  ticker,
  issuer,
  sector,
  credit_rating,
  maturity,
  bid,
  ask
from generated_bonds
on conflict (id) do update set
  isin = excluded.isin,
  cusip = excluded.cusip,
  ticker = excluded.ticker,
  issuer = excluded.issuer,
  sector = excluded.sector,
  credit_rating = excluded.credit_rating,
  maturity = excluded.maturity,
  bid = excluded.bid,
  ask = excluded.ask;
