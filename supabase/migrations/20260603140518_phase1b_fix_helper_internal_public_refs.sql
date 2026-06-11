-- phase1b introduced a latent bug: 3 helper bodies hardcoded public.<helper>,
-- which no longer exists after the move to private. Regenerate each from its own
-- definition with the public. qualifier stripped so calls resolve via search_path
-- (private, public). All other attributes (SECURITY DEFINER, search_path) preserved.
do $$
declare d text; f text;
begin
  foreach f in array array[
    'private.user_can_admin_org(uuid)',
    'private.user_can_view_asset(public.assets)',
    'private.user_in_building(uuid)'
  ]
  loop
    d := pg_get_functiondef(f::regprocedure);
    d := replace(d, 'public.user_can(',    'user_can(');     -- won't match user_can_admin_org/_view_asset (require '(')
    d := replace(d, 'public.user_in_org(', 'user_in_org(');
    execute d;
  end loop;
end $$;
