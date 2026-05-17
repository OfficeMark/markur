-- M32 Step 2B: per-user toggle for tooltip ("button hints") visibility.
--
-- Defaults to true so every existing user keeps seeing the new M32 tooltips
-- the first time they sign in after deploy -- and can turn theirs off
-- immediately from /settings. Org admins do NOT see this toggle (per-user
-- scope only); the prompt's note that it could move to org-wide if Randy
-- wants is tracked separately.
--
-- Wired through ActionHintsProvider on the client; the <Tooltip> primitive
-- (Radix wrapper) short-circuits to render children-only when this is false.

alter table public.profiles
  add column if not exists show_action_hints boolean not null default true;

comment on column public.profiles.show_action_hints is
  'M32: per-user toggle for action tooltips. true = show button hints, false = hide them. Read via the ActionHintsContext on the client.';
