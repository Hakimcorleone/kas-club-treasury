-- Kas · Club Treasury · Supabase schema (multi-club, Google auth, RLS)
-- Run once in Supabase SQL Editor. Safe to re-run for functions/policies.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 80),
  opening_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('president','treasurer','secretary','member')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('president','treasurer','secretary','member')),
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (club_id, email)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (length(title) between 2 and 100),
  description text check (length(description) <= 1000),
  location text check (length(location) <= 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.transactions (
  id bigserial primary key,
  club_id uuid not null references public.clubs(id),
  event_id uuid references public.events(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  category text not null check (length(category) between 1 and 40),
  description text not null check (length(description) between 1 and 200),
  txn_date date not null default current_date,
  receipt_path text not null,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  reverses_id bigint references public.transactions(id)
);

create table if not exists public.audit_log (
  id bigserial primary key,
  club_id uuid references public.clubs(id) on delete cascade,
  user_id uuid,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);

create index if not exists tx_club_idx on public.transactions(club_id, created_at desc);
create index if not exists ev_club_idx on public.events(club_id, starts_at);
create index if not exists audit_club_idx on public.audit_log(club_id, at desc);

-- ---------- helpers (security definer so RLS policies don't recurse) ----------
create or replace function public.is_super() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

create or replace function public.club_role(c uuid) returns text language sql stable security definer set search_path = public as $$
  select role from memberships where club_id = c and user_id = auth.uid()
$$;

create or replace function public.can_view(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super() or exists (select 1 from memberships where club_id = c and user_id = auth.uid())
$$;

create or replace function public.has_role(c uuid, roles text[]) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.club_role(c) = any(roles), false)
$$;

create or replace function public.audit(c uuid, a text, d jsonb) returns void language sql security definer set search_path = public as $$
  insert into audit_log(club_id, user_id, action, detail) values (c, auth.uid(), a, d)
$$;

-- ---------- triggers ----------
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, avatar_url)
  values (new.id, lower(new.email), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.no_delete() returns trigger language plpgsql as $$
begin raise exception 'Transactions are never deleted. Use a reversal.'; end $$;
drop trigger if exists tx_no_delete on public.transactions;
create trigger tx_no_delete before delete on public.transactions for each row execute function public.no_delete();

create or replace function public.audit_tx() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit(new.club_id, 'transaction.create', jsonb_build_object('id', new.id, 'type', new.type, 'amount_cents', new.amount_cents, 'reverses', new.reverses_id));
  elsif new.status is distinct from old.status then
    perform public.audit(new.club_id, 'transaction.' || new.status, jsonb_build_object('id', new.id, 'note', new.decision_note));
  end if;
  return new;
end $$;
drop trigger if exists tx_audit on public.transactions;
create trigger tx_audit after insert or update on public.transactions for each row execute function public.audit_tx();

create or replace function public.audit_generic() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; begin
  r := coalesce(new, old);
  perform public.audit(r.club_id, tg_table_name || '.' || lower(tg_op), to_jsonb(r) - 'description');
  return r;
end $$;
drop trigger if exists ev_audit on public.events;
create trigger ev_audit after insert or update or delete on public.events for each row execute function public.audit_generic();
drop trigger if exists mem_audit on public.memberships;
create trigger mem_audit after insert or update or delete on public.memberships for each row execute function public.audit_generic();
drop trigger if exists inv_audit on public.invites;
create trigger inv_audit after insert or delete on public.invites for each row execute function public.audit_generic();

-- ---------- RPCs ----------
-- Called after every login: turns pending invites for this Google email into memberships.
create or replace function public.accept_invites() returns int language plpgsql security definer set search_path = public as $$
declare em text; n int := 0; i record;
begin
  -- Only verified emails can claim invites (stops someone signing up with another person's email).
  select lower(u.email) into em from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if em is null then return 0; end if;
  for i in select * from invites where email = em and accepted_at is null loop
    insert into memberships(club_id, user_id, role) values (i.club_id, auth.uid(), i.role)
      on conflict (club_id, user_id) do update set role = excluded.role;
    update invites set accepted_at = now() where id = i.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- SRC admin creates a club and invites its president in one go.
create or replace function public.create_club(p_name text, p_opening_cents bigint, p_president_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not public.is_super() then raise exception 'Only SRC admin can create clubs'; end if;
  insert into clubs(name, opening_cents) values (trim(p_name), coalesce(p_opening_cents, 0)) returning id into cid;
  perform public.audit(cid, 'club.create', jsonb_build_object('name', p_name));
  if coalesce(p_president_email, '') <> '' then
    insert into invites(club_id, email, role, invited_by) values (cid, lower(trim(p_president_email)), 'president', auth.uid());
  end if;
  return cid;
end $$;

create or replace function public.decide_transaction(p_id bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t transactions;
begin
  select * into t from transactions where id = p_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if not public.has_role(t.club_id, array['president']) then raise exception 'Only this club''s president can decide'; end if;
  if t.created_by = auth.uid() then raise exception 'You cannot approve your own transaction'; end if;
  if t.status <> 'submitted' then raise exception 'Already %', t.status; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'A reason is required to reject'; end if;
  update transactions set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = p_id;
end $$;

create or replace function public.reverse_transaction(p_id bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare t transactions; nid bigint;
begin
  select * into t from transactions where id = p_id;
  if not found or t.status <> 'approved' then raise exception 'Only approved transactions can be reversed'; end if;
  if t.reverses_id is not null then raise exception 'Cannot reverse a reversal'; end if;
  if not public.has_role(t.club_id, array['treasurer']) then raise exception 'Only this club''s treasurer can reverse'; end if;
  if exists (select 1 from transactions where reverses_id = p_id and status <> 'rejected') then raise exception 'Reversal already exists'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Reason required'; end if;
  insert into transactions(club_id, event_id, type, amount_cents, category, description, txn_date, receipt_path, created_by, reverses_id)
  values (t.club_id, t.event_id, case when t.type = 'income' then 'expense' else 'income' end, t.amount_cents, 'Reversal',
          left('Reverses #' || p_id || ': ' || trim(p_reason), 200), current_date, t.receipt_path, auth.uid(), p_id)
  returning id into nid;
  return nid;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.events enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists p_profiles_sel on public.profiles;
create policy p_profiles_sel on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_super() or exists (
    select 1 from memberships a join memberships b on a.club_id = b.club_id where a.user_id = auth.uid() and b.user_id = profiles.id));
drop policy if exists p_profiles_upd on public.profiles;
create policy p_profiles_upd on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_clubs_sel on public.clubs;
create policy p_clubs_sel on public.clubs for select to authenticated using (public.can_view(id));
drop policy if exists p_clubs_upd on public.clubs;
create policy p_clubs_upd on public.clubs for update to authenticated using (public.is_super()) with check (public.is_super());

drop policy if exists p_mem_sel on public.memberships;
create policy p_mem_sel on public.memberships for select to authenticated using (public.can_view(club_id));
drop policy if exists p_mem_upd on public.memberships;
create policy p_mem_upd on public.memberships for update to authenticated
  using (public.is_super() or public.has_role(club_id, array['president']))
  with check (public.is_super() or public.has_role(club_id, array['president']));
drop policy if exists p_mem_del on public.memberships;
create policy p_mem_del on public.memberships for delete to authenticated
  using ((public.is_super() or public.has_role(club_id, array['president'])) and user_id <> auth.uid());

drop policy if exists p_inv_all on public.invites;
create policy p_inv_all on public.invites for all to authenticated
  using (public.is_super() or public.has_role(club_id, array['president']))
  with check ((public.is_super() or public.has_role(club_id, array['president'])) and invited_by = auth.uid());

drop policy if exists p_ev_sel on public.events;
create policy p_ev_sel on public.events for select to authenticated using (public.can_view(club_id));
drop policy if exists p_ev_ins on public.events;
create policy p_ev_ins on public.events for insert to authenticated
  with check (public.has_role(club_id, array['president','secretary','treasurer']) and created_by = auth.uid());
drop policy if exists p_ev_upd on public.events;
create policy p_ev_upd on public.events for update to authenticated
  using (public.has_role(club_id, array['president','secretary','treasurer']))
  with check (public.has_role(club_id, array['president','secretary','treasurer']));
drop policy if exists p_ev_del on public.events;
create policy p_ev_del on public.events for delete to authenticated using (public.has_role(club_id, array['president','secretary']));

drop policy if exists p_tx_sel on public.transactions;
create policy p_tx_sel on public.transactions for select to authenticated using (public.can_view(club_id));
drop policy if exists p_tx_ins on public.transactions;
create policy p_tx_ins on public.transactions for insert to authenticated with check (
  public.has_role(club_id, array['treasurer']) and created_by = auth.uid() and status = 'submitted'
  and decided_by is null and decided_at is null and reverses_id is null
  and split_part(receipt_path, '/', 1) = club_id::text
  and (event_id is null or exists (select 1 from events e where e.id = event_id and e.club_id = transactions.club_id)));
-- no UPDATE/DELETE policy: decisions only through decide_transaction(), and deletes are blocked by trigger.

drop policy if exists p_audit_sel on public.audit_log;
create policy p_audit_sel on public.audit_log for select to authenticated
  using (public.is_super() or public.has_role(club_id, array['president','treasurer','secretary']));

-- ---------- grants ----------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.clubs, public.memberships, public.invites, public.events, public.transactions to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
revoke update on public.transactions from authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function public.audit(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.accept_invites(), public.create_club(text, bigint, text),
  public.decide_transaction(bigint, boolean, text), public.reverse_transaction(bigint, text),
  public.is_super(), public.club_role(uuid), public.can_view(uuid), public.has_role(uuid, text[]) to authenticated;
