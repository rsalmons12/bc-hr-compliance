-- BC HR & Compliance portal: separate the background check from drug screening
-- (run AFTER 008_rubella.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- * Background check (e.g. NJ fingerprinting through IdentoGO): the employee books it during
--   onboarding using the agency's link and codes; staff record the result.
-- * Drug screening: performed and documented by managers / BC HR in the employee's file;
--   employees can view their own results but no longer enter anything.

-- The scheduling settings already saved for "drug screening" were really for the background
-- check: keep the values, rename the columns.
alter table public.companies rename column drug_screen_instructions to background_instructions;
alter table public.companies rename column drug_screen_url to background_url;
alter table public.companies rename column drug_screen_service_code to background_service_code;
alter table public.companies rename column drug_screen_case_number to background_case_number;
alter table public.companies rename column drug_screen_paid_by_facility to background_paid_by_facility;
alter table public.companies drop column if exists drug_screen_required;

update public.companies
   set background_instructions = 'All employees must complete a background check. Please schedule your fingerprinting appointment online and enter your information as prompted. The facility covers the cost.'
 where background_instructions ilike '%drug screening%';

create table public.background_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  appointment_date date,
  appointment_location text,
  result text not null default 'pending'
    check (result in ('pending', 'cleared', 'not_cleared', 'cancelled')),
  result_date date,
  notes text,
  file_path text,
  file_name text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index background_checks_user_idx on public.background_checks (user_id);

-- Employees record their appointment; only staff record the result.
create or replace function public.background_checks_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();
  if can_manage_company(new.company_id) then
    if tg_op = 'INSERT' or (new.result, new.result_date) is distinct from (old.result, old.result_date) then
      new.recorded_by := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.result := 'pending';
    new.result_date := null;
    new.notes := null;
    new.file_path := null;
    new.file_name := null;
    new.recorded_by := null;
    return new;
  end if;
  if (new.user_id, new.result, new.result_date, new.notes, new.file_path, new.file_name, new.recorded_by)
     is distinct from
     (old.user_id, old.result, old.result_date, old.notes, old.file_path, old.file_name, old.recorded_by) then
    raise exception 'Only your manager or BC HR can record background check results';
  end if;
  return new;
end;
$$;

create trigger background_checks_guard
  before insert or update on public.background_checks
  for each row execute function public.background_checks_guard();

alter table public.background_checks enable row level security;

create policy "employees read own background check" on public.background_checks
  for select to authenticated using (user_id = auth.uid());
create policy "employees add own background check" on public.background_checks
  for insert to authenticated with check (user_id = auth.uid());
create policy "employees update own pending background check" on public.background_checks
  for update to authenticated using (user_id = auth.uid() and result = 'pending') with check (user_id = auth.uid());
create policy "staff manage company background checks" on public.background_checks
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

grant select, insert, update, delete on public.background_checks to authenticated;

-- Appointments employees entered under "drug screening" were for the background check: move them.
insert into public.background_checks (user_id, company_id, appointment_date, appointment_location, created_at)
select user_id, company_id, appointment_date, appointment_location, created_at
  from public.drug_screens
 where recorded_by is null and result = 'pending';
delete from public.drug_screens where recorded_by is null and result = 'pending';

-- Drug screening is now staff-only: employees can still read their own results.
drop policy if exists "employees add own screening" on public.drug_screens;
drop policy if exists "employees update own screening appointment" on public.drug_screens;
