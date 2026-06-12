-- Zone/department on assets — free-text, nullable, filterable later (v1 stores only).
alter table public.assets add column zone text;
