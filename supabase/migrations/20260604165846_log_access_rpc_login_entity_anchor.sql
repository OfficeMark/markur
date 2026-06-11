-- audit_log requires action, entity_type, entity_id all NOT NULL. A login has no
-- natural entity, so anchor it to the user's own id. View calls already pass both.
CREATE OR REPLACE FUNCTION public.log_access(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  if p_action not in ('view','login','logout') then
    raise exception 'log_access: invalid action %', p_action;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, created_at)
  values (
    v_user,
    case when p_entity_type is null then p_action
         else p_action || '.' || p_entity_type end,
    coalesce(p_entity_type, p_action),   -- NOT NULL
    coalesce(p_entity_id, v_user),       -- NOT NULL: anchor login to the user
    now()
  );
end;
$function$;
