-- BC HR & Compliance portal: resume, work history and employment verification
-- (run AFTER 009_background_checks.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- * Employees upload a resume and list previous employers during onboarding.
-- * The agency verifies each one: who they spoke to (name, title, phone), the dates and
--   full-time / part-time status confirmed, the date verified and the outcome.

alter table public.employee_profiles
  add column resume_path text,
  add column resume_file_name text,
  add column resume_uploaded_at timestamptz,
  add column no_prior_employment boolean not null default false;

create table public.employment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  -- As given by the employee
  employer_name text not null,
  job_title text,
  employer_phone text,
  start_date date,
  end_date date, -- blank = still employed there
  employment_type text check (employment_type in ('full_time', 'part_time')),
  -- Verification, done by the agency
  verification_status text not null default 'not_started'
    check (verification_status in ('not_started', 'verified', 'unable_to_verify', 'discrepancy')),
  verified_contact_name text,
  verified_contact_title text,
  verified_contact_phone text,
  verified_start_date date,
  verified_end_date date,
  verified_employment_type text check (verified_employment_type in ('full_time', 'part_time')),
  verified_on date,
  verified_by uuid references public.profiles (id) on delete set null,
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employment_history_user_idx on public.employment_history (user_id);

-- Employees list their jobs; only staff record verification, and the database notes who did.
create or replace function public.employment_history_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();
  if can_manage_company(new.company_id) then
    if tg_op = 'INSERT' or (new.verification_status, new.verified_on, new.verified_contact_name)
                           is distinct from (old.verification_status, old.verified_on, old.verified_contact_name) then
      new.verified_by := case when new.verification_status = 'not_started' then null else auth.uid() end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'not_started';
    new.verified_contact_name := null;
    new.verified_contact_title := null;
    new.verified_contact_phone := null;
    new.verified_start_date := null;
    new.verified_end_date := null;
    new.verified_employment_type := null;
    new.verified_on := null;
    new.verified_by := null;
    new.verification_notes := null;
    new.created_at := now();
    return new;
  end if;
  if old.verification_status <> 'not_started' then
    raise exception 'This job has already been verified and can no longer be changed';
  end if;
  if (new.user_id, new.verification_status, new.verified_contact_name, new.verified_contact_title,
      new.verified_contact_phone, new.verified_start_date, new.verified_end_date,
      new.verified_employment_type, new.verified_on, new.verified_by, new.verification_notes)
     is distinct from
     (old.user_id, old.verification_status, old.verified_contact_name, old.verified_contact_title,
      old.verified_contact_phone, old.verified_start_date, old.verified_end_date,
      old.verified_employment_type, old.verified_on, old.verified_by, old.verification_notes) then
    raise exception 'Only your manager or BC HR can record employment verification';
  end if;
  return new;
end;
$$;

create trigger employment_history_guard
  before insert or update on public.employment_history
  for each row execute function public.employment_history_guard();

alter table public.employment_history enable row level security;

create policy "employees read own work history" on public.employment_history
  for select to authenticated using (user_id = auth.uid());
create policy "employees add own work history" on public.employment_history
  for insert to authenticated with check (user_id = auth.uid());
create policy "employees edit own unverified work history" on public.employment_history
  for update to authenticated using (user_id = auth.uid() and verification_status = 'not_started')
  with check (user_id = auth.uid());
create policy "employees remove own unverified work history" on public.employment_history
  for delete to authenticated using (user_id = auth.uid() and verification_status = 'not_started');
create policy "staff manage company work history" on public.employment_history
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

grant select, insert, update, delete on public.employment_history to authenticated;
