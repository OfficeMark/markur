-- Pin search_path on trigger helpers so they can't be hijacked by a malicious
-- search_path injection (Supabase advisor 0011_function_search_path_mutable).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_pin_coords()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.x < 0 or new.x > 1 or new.y < 0 or new.y > 1 then
    raise exception 'Pin coordinates must be normalized 0..1 (got x=%, y=%)', new.x, new.y;
  end if;
  return new;
end;
$$;
