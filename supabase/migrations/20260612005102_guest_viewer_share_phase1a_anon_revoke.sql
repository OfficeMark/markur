-- Tighten share RPC grants: Supabase default privileges grant EXECUTE to anon
-- directly (not via PUBLIC), so the phase-1 'revoke from public' did not remove them.
-- peek stays anon-callable by design (pre-auth share screen). claim/revoke do not need anon.
revoke execute on function public.claim_building_share(text) from anon;
revoke execute on function public.revoke_building_share(uuid) from anon;
