alter table public.floors
  add column plan_provenance text not null default 'not_specified'
  check (plan_provenance in (
    'not_specified',
    'client_provided',
    'recreated_from_reference',
    'recreated_from_scan'
  ));
