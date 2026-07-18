-- Feature #2 — Floor-wide team notes.
-- A single nullable free-text note scoped to one floor (install details, access
-- notes, anything the team should know). Team-only; writes ride the existing
-- floors RLS (building-edit required). Never surfaced on guest share links.
alter table public.floors add column floor_notes text;
