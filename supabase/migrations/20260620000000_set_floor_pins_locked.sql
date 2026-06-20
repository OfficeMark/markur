-- Floor-wide "Lock all / Unlock all pins" RPC.
-- Ported from standalone so PlanSettingsMenu's lock toggle works on the rebuild.
-- Security INVOKER: relies on the existing assets RLS (edit rule) to authorize
-- the bulk update. Returns the number of pins actually changed (for the toast).
create or replace function public.set_floor_pins_locked(p_floor_id uuid, p_locked boolean)
  returns integer
  language plpgsql
  set search_path to 'public', 'private'
as $function$
declare
  v_count integer;
begin
  update public.assets
     set is_locked  = p_locked,
         updated_at = now()
   where floor_id = p_floor_id
     and deleted_at is null
     and is_locked is distinct from p_locked;
  get diagnostics v_count = row_count;
  return v_count;  -- number of pins actually changed
end;
$function$;

revoke all on function public.set_floor_pins_locked(uuid, boolean) from public;
-- The rebuild DB grants EXECUTE to anon by default-privilege; revoke it so the
-- ACL matches standalone (authenticated + service_role only). RLS would block
-- anon regardless since this is SECURITY INVOKER, but keep the surface tight.
revoke execute on function public.set_floor_pins_locked(uuid, boolean) from anon;
grant execute on function public.set_floor_pins_locked(uuid, boolean) to authenticated, service_role;
