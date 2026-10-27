-- CUSIPs are nine alphanumeric characters with the letters rotating through the start, middle, and end
-- so substring search exercises every position. Tickers cycle through 1,000 groups in four shapes.
with identifiers as (
  select
    series,
    (100000 + series)::text as digits,
    chr(65 + (series * 7) % 26) || chr(65 + (series * 11) % 26) || chr(65 + (series * 17) % 26) as letters,
    ((series - 1) % 1000) + 1 as ticker_group,
    (array[
      'NSMA', 'ATLS', 'FHLA', 'UST', 'HARB', 'PAR', 'RDWD', 'CRHS', 'MTA', 'SUMC',
      'GLX', 'VNTR', 'ORCA', 'KPLR', 'ZEN', 'AXIO', 'TRBL', 'NOVA', 'IRIS', 'QNT'
    ])[((series - 1) % 20) + 1] as ticker_name
  from generate_series(1, 50000) as series
),
generated_bonds as (
  select
    (
      substr(md5('bond-' || series::text), 1, 8) || '-' ||
      substr(md5('bond-' || series::text), 9, 4) || '-' ||
      '4' || substr(md5('bond-' || series::text), 14, 3) || '-' ||
      '8' || substr(md5('bond-' || series::text), 18, 3) || '-' ||
      substr(md5('bond-' || series::text), 21, 12)
    )::uuid as id,
    'US' || lpad(series::text, 10, '0') as isin,
    case series % 4
      when 0 then letters || digits
      when 1 then substr(digits, 1, 3) || letters || substr(digits, 4, 3)
      when 2 then digits || letters
      else digits || lpad(((series * 7) % 1000)::text, 3, '0')
    end as cusip,
    case
      when ticker_group <= 250 then 'BND' || lpad(ticker_group::text, 3, '0')
      when ticker_group <= 500 then ticker_name
      when ticker_group <= 750 then ticker_name || (25 + ticker_group % 30)::text
      else
        chr(65 + ticker_group % 26) || chr(65 + (ticker_group * 3) % 26) || chr(65 + (ticker_group * 5) % 26) ||
        (ticker_group % 10)::text || chr(65 + (ticker_group * 7) % 26)
    end as ticker,
    'Synthetic Issuer ' || lpad(((series - 1) % 1000 + 1)::text, 4, '0') as issuer,
    (array['Muni', 'corp', 'agency', 'trea', 'MBS', 'ABS'])[((series - 1) % 6) + 1] as sector,
    (array['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+'])[((series - 1) % 8) + 1] as credit_rating,
    (date '2028-01-01' + ((series * 17) % 7305))::date as maturity,
    round((90 + ((series * 137) % 2000) / 100.0)::numeric, 4) as bid,
    round((90 + ((series * 137) % 2000) / 100.0 + 0.025 + (series % 5) * 0.0125)::numeric, 4) as ask
  from identifiers
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
