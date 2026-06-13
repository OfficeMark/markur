-- floors.plan_provenance: how a floor's plan was sourced (provenance label).
-- Applied on demo by web Claude (recorded: floor_plan_provenance). Reconstructed
-- here — web Claude: confirm byte-faithful or replace with the recorded SQL
-- (and the real recorded timestamp/filename).

alter table public.floors
  add column plan_provenance text not null default 'not_specified'
  check (plan_provenance in (
    'not_specified',
    'client_provided',
    'recreated_from_reference',
    'recreated_from_scan'
  ));
