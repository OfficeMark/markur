-- Feature #3a — Zone/department on assets.
-- Free-text, nullable (v1 stores only; filterable later).
alter table public.assets add column zone text;
