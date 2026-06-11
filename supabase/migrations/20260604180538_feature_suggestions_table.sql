create table if not exists public.feature_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  building_id uuid references public.buildings(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'new' check (status in ('new','reviewing','planned','declined','shipped')),
  created_at timestamptz not null default now()
);

alter table public.feature_suggestions enable row level security;

-- Submit: any signed-in user, only as themselves.
create policy feature_suggestions_insert on public.feature_suggestions
  for insert to authenticated
  with check (submitted_by = auth.uid());

-- Read: your own submissions, or super-admin (vendor) sees all for triage.
create policy feature_suggestions_select on public.feature_suggestions
  for select to authenticated
  using (
    submitted_by = auth.uid()
    or exists (select 1 from public.access_grants
               where user_id = auth.uid() and role = 'super_admin'
                 and (expires_at is null or expires_at > now()))
  );

-- Triage: super-admin updates status only.
create policy feature_suggestions_update on public.feature_suggestions
  for update to authenticated
  using (exists (select 1 from public.access_grants
                 where user_id = auth.uid() and role = 'super_admin'
                   and (expires_at is null or expires_at > now())))
  with check (true);

grant select, insert, update on public.feature_suggestions to authenticated;
