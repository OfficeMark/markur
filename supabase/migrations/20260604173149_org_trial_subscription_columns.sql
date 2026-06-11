-- Trial + subscription state on organizations. Self-managed 30-day trial (no card
-- up front), Stripe becomes source of truth only on conversion.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- Existing orgs were just backfilled to 'active' (they predate trials — correct).
-- Future signups should default to 'trial'; handle_new_user also sets it explicitly.
ALTER TABLE public.organizations
  ALTER COLUMN subscription_status SET DEFAULT 'trial';

-- Valid lifecycle states.
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname='organizations_subscription_status_check') then
    alter table public.organizations
      add constraint organizations_subscription_status_check
      check (subscription_status in ('trial','active','past_due','canceled','expired'));
  end if;
end $$;
