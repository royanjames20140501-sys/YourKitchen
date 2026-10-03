create table if not exists public.user_kitchens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_kitchens enable row level security;
revoke all on table public.user_kitchens from anon;
revoke all on table public.user_kitchens from authenticated;
grant select, insert, update on table public.user_kitchens to authenticated;

drop policy if exists "Users read their own kitchen" on public.user_kitchens;
create policy "Users read their own kitchen"
  on public.user_kitchens for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own kitchen" on public.user_kitchens;
create policy "Users create their own kitchen"
  on public.user_kitchens for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own kitchen" on public.user_kitchens;
create policy "Users update their own kitchen"
  on public.user_kitchens for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
