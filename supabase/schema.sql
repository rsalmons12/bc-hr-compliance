-- BC HR & Compliance portal: database setup.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Roles:
--   admin  = BC HR & Compliance staff. Sees and manages every client company.
--   client = a person at a client company. Sees only their own company's data.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  company_id uuid references public.companies (id) on delete set null,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

-- Emails the admin has pre-assigned to a company. When that person's login is
-- created, they are placed in the company automatically.
create table public.invites (
  email text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.policy_acknowledgements (
  policy_id uuid not null references public.policies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  acknowledged_at timestamptz not null default now(),
  primary key (policy_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  submitted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  category text not null,
  subject text not null,
  details text not null,
  incident_date date,
  status text not null default 'new' check (status in ('new', 'reviewing', 'closed')),
  admin_notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can be used inside RLS policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid();
$$;

-- Create a profile for every new login, using a matching invite if there is one.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites where lower(email) = lower(new.email);
  insert into profiles (id, email, full_name, company_id)
  values (new.id, new.email, inv.full_name, inv.company_id);
  delete from invites where lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- If the admin adds an invite for someone who already has a login, apply it now.
create or replace function public.apply_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set company_id = new.company_id,
         full_name = coalesce(profiles.full_name, new.full_name)
   where lower(profiles.email) = lower(new.email);
  if found then
    delete from invites where email = new.email;
  end if;
  return null;
end;
$$;

create trigger on_invite_created
  after insert on public.invites
  for each row execute function public.apply_invite();

-- Clients may only change a task's status, not its details.
create or replace function public.tasks_client_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_admin()
     and (new.title, new.description, new.due_date, new.company_id)
         is distinct from (old.title, old.description, old.due_date, old.company_id) then
    raise exception 'Only BC HR & Compliance staff can edit task details';
  end if;
  return new;
end;
$$;

create trigger tasks_client_guard
  before update on public.tasks
  for each row execute function public.tasks_client_guard();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.documents enable row level security;
alter table public.policies enable row level security;
alter table public.policy_acknowledgements enable row level security;
alter table public.tasks enable row level security;
alter table public.complaints enable row level security;

-- companies
create policy "admins manage companies" on public.companies
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "clients read their company" on public.companies
  for select to authenticated using (id = my_company_id());

-- profiles
create policy "read own profile, admins read all" on public.profiles
  for select to authenticated using (id = auth.uid() or is_admin());
create policy "admins update profiles" on public.profiles
  for update to authenticated using (is_admin()) with check (is_admin());

-- invites
create policy "admins manage invites" on public.invites
  for all to authenticated using (is_admin()) with check (is_admin());

-- documents
create policy "admins manage documents" on public.documents
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "clients read company documents" on public.documents
  for select to authenticated using (company_id = my_company_id());
create policy "clients upload company documents" on public.documents
  for insert to authenticated
  with check (company_id = my_company_id() and uploaded_by = auth.uid());

-- policies
create policy "admins manage policies" on public.policies
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "clients read company policies" on public.policies
  for select to authenticated using (company_id = my_company_id());

-- policy acknowledgements
create policy "admins manage acknowledgements" on public.policy_acknowledgements
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "users read own acknowledgements" on public.policy_acknowledgements
  for select to authenticated using (user_id = auth.uid());
create policy "users acknowledge company policies" on public.policy_acknowledgements
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.policies p
                where p.id = policy_id and p.company_id = my_company_id())
  );

-- tasks
create policy "admins manage tasks" on public.tasks
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "clients read company tasks" on public.tasks
  for select to authenticated using (company_id = my_company_id());
create policy "clients update company task status" on public.tasks
  for update to authenticated
  using (company_id = my_company_id()) with check (company_id = my_company_id());

-- complaints: confidential to the person who submitted it and BC HR staff
create policy "admins manage complaints" on public.complaints
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "clients read own complaints" on public.complaints
  for select to authenticated using (submitted_by = auth.uid());
create policy "clients submit complaints" on public.complaints
  for insert to authenticated
  with check (company_id = my_company_id() and submitted_by = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_admin(), public.my_company_id() to authenticated;

-- ---------------------------------------------------------------------------
-- File storage: one private bucket, one folder per company (<company_id>/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "read company files" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents'
         and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));

create policy "upload company files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents'
              and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));

create policy "admins delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
