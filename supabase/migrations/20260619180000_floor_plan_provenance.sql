-- Feature #1 — Plan provenance label.
-- How a floor's plan was sourced. Stored as a key; the frontend owns the
-- display strings. 'not_specified' renders no label.
alter table public.floors
  add column plan_provenance text not null default 'not_specified'
  check (plan_provenance in (
    'not_specified',
    'client_provided',
    'recreated_from_reference',
    'recreated_from_scan'
  ));
