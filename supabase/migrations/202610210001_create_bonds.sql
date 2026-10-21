create extension if not exists pgcrypto;

create table if not exists public.bonds (
  id uuid primary key default gen_random_uuid(),
  isin text not null check (isin ~ '^[A-Z0-9]{12}$'),
  cusip text not null check (cusip ~ '^[A-Z0-9]{9}$'),
  ticker text not null check (char_length(btrim(ticker)) between 1 and 32),
  issuer text not null check (char_length(btrim(issuer)) between 1 and 200),
  sector text not null check (sector in ('Muni', 'corp', 'agency', 'trea', 'MBS', 'ABS')),
  credit_rating text not null check (char_length(btrim(credit_rating)) between 1 and 16),
  maturity date not null,
  bid numeric(12, 4) not null check (bid >= 0),
  ask numeric(12, 4) not null check (ask >= bid)
);

create unique index if not exists bonds_isin_idx on public.bonds (isin);
create unique index if not exists bonds_cusip_idx on public.bonds (cusip);
create index if not exists bonds_ticker_id_idx on public.bonds (ticker, id);
