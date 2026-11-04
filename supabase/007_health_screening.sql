-- BC HR & Compliance portal: TB and measles screening (run AFTER 006_positions_drug_screening.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Turn it on per agency (e.g. New Jersey facilities) under Client companies. Employees then
-- either upload a TB / measles result from the past 12 months, or book a test (the agency
-- pays; often at a local MinuteClinic). Staff record the result; it is valid for 12 months.

alter table public.companies
  add column health_screen_required boolean not null default false,
  add column health_screen_instructions text,
  add column health_screen_url text,
  add column health_screen_paid_by_facility boolean not null default true;

create table public.health_screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  screening text not null check (screening in ('tb', 'measles')),
  source text not null default 'appointment' check (source in ('appointment', 'prior_result')),
  test_type text,
  appointment_date date,
  appointment_location text,
  test_date date,
  result text not null default 'pending'
    check (result in ('pending', 'negative', 'positive', 'immune', 'not_immune', 'cancelled')),
  valid_until date,
  file_path text,
  file_name text,
  notes text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index health_screenings_user_idx on public.health_screenings (user_id, screening);
create index health_screenings_company_idx on public.health_screenings (company_id, valid_until);

-- Employees book a test or upload a recent result; only staff record the result.
-- A cleared result (TB negative, measles immune) is valid 12 months from the test date.
create or replace function public.health_screenings_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();

  if can_manage_company(new.company_id) then
    if tg_op = 'INSERT' or (new.result, new.valid_until) is distinct from (old.result, old.valid_until) then
      new.recorded_by := auth.uid();
    end if;
    if new.result in ('negative', 'immune') and new.valid_until is null then
      new.valid_until := (coalesce(new.test_date, current_date) + interval '12 months')::date;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.user_id, new.screening, new.result, new.valid_until, new.notes, new.recorded_by)
         is distinct from (old.user_id, old.screening, old.result, old.valid_until, old.notes, old.recorded_by) then
    raise exception 'Only your manager or BC HR can record screening results';
  end if;
  if tg_op = 'INSERT' then
    new.result := 'pending';
    new.valid_until := null;
    new.notes := null;
    new.recorded_by := null;
    new.created_at := now();
  end if;
  if new.source = 'prior_result' then
    if new.file_path is null or new.test_date is null then
      raise exception 'Upload your result and enter the test date';
    end if;
    if new.test_date > current_date or new.test_date < (current_date - interval '12 months')::date then
      raise exception 'A previous result must be from the past 12 months. Please book a new test instead';
    end if;
  end if;
  return new;
end;
$$;

create trigger health_screenings_guard
  before insert or update on public.health_screenings
  for each row execute function public.health_screenings_guard();

alter table public.health_screenings enable row level security;

create policy "employees read own health screenings" on public.health_screenings
  for select to authenticated using (user_id = auth.uid());
create policy "employees add own health screenings" on public.health_screenings
  for insert to authenticated with check (user_id = auth.uid());
create policy "employees update own pending health screenings" on public.health_screenings
  for update to authenticated using (user_id = auth.uid() and result = 'pending') with check (user_id = auth.uid());
create policy "staff manage company health screenings" on public.health_screenings
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

grant select, insert, update, delete on public.health_screenings to authenticated;
