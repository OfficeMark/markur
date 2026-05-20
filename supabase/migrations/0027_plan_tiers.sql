-- =========================================================================
-- Restructure organization plan tiers
-- =========================================================================
--
-- Old: free / pro / enterprise            (3 tiers; `pro` = single paid tier)
-- New: free / building / portfolio / enterprise   (4 tiers)
--
-- This is a rename/restructure ONLY — no quota enforcement is added. Building/
-- floor/asset counts remain unlimited on every tier. `organizations.plan` is
-- still not read anywhere in the application; it's a forward-looking column,
-- and per-tier enforcement (e.g. building caps) is deliberately deferred until
-- there are paying customers.
--
-- Data migration: the two existing orgs carry the legacy `pro` value, which is
-- dropped from the new set. They are remapped to `portfolio` — the entry paid
-- tier — as the closest equivalent of the old single `pro` paid tier. With the
-- column unused, this is cosmetic and can be changed with a one-line UPDATE.
-- =========================================================================

-- Drop the old constraint FIRST — the remap below sets 'portfolio', which the
-- old free/pro/enterprise check would reject.
alter table public.organizations drop constraint if exists organizations_plan_check;

-- Remap the legacy 'pro' value to the new entry paid tier.
update public.organizations set plan = 'portfolio' where plan = 'pro';

-- Re-add the constraint with the new tier set. Every row is now
-- free / portfolio / enterprise — all valid under the new check.
alter table public.organizations add constraint organizations_plan_check
  check (plan = any (array['free', 'building', 'portfolio', 'enterprise']));

-- Default stays 'free' — still valid under the new set, no change needed.
