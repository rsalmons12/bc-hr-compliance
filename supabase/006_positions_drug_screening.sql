-- BC HR & Compliance portal: positions, job description sign-off and drug screening
-- (run AFTER 004_training.sql; 005 is optional).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Adds:
--   * positions (job descriptions) for each agency, and each employee's position
--   * job description acknowledgments: the employee signs, then a supervisor countersigns;
--     the exact text signed is kept with the signature
--   * drug screening: per-agency scheduling instructions, and each employee's screening
--     appointment and result

-- ---------------------------------------------------------------------------
-- Positions
-- ---------------------------------------------------------------------------

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  regulation text,
  reports_to text,
  supervises text,
  employment_status text,
  summary text,
  description text,
  signer_title text, -- who countersigns, e.g. "Program Director"
  file_path text,
  file_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, title)
);

alter table public.employee_profiles
  add column position_id uuid references public.positions (id) on delete set null;

alter table public.positions enable row level security;

create policy "people read their agency positions" on public.positions
  for select to authenticated using (company_id = my_company_id() or is_admin());
create policy "staff manage positions" on public.positions
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

-- Employees cannot assign themselves a position (same rule as job title and start date).
create or replace function public.employee_profiles_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  trusted boolean := coalesce(current_setting('bc.trusted', true), '') = 'on';
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();
  if trusted or can_manage_company(new.company_id) then
    if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      new.submitted_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'in_progress';
    new.ssn_on_file := false;
    new.bank_on_file := false;
    new.job_title := null;
    new.position_id := null;
    new.start_date := null;
    new.submitted_at := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_notes := null;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (new.status = 'submitted' and old.status in ('in_progress', 'changes_requested')) then
    raise exception 'Only BC HR or your manager can change the onboarding status';
  end if;
  if (new.ssn_on_file, new.bank_on_file, new.job_title, new.position_id, new.start_date,
      new.reviewed_at, new.reviewed_by, new.review_notes)
     is distinct from
     (old.ssn_on_file, old.bank_on_file, old.job_title, old.position_id, old.start_date,
      old.reviewed_at, old.reviewed_by, old.review_notes) then
    raise exception 'These fields can only be changed by BC HR or your manager';
  end if;
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job description acknowledgments
-- ---------------------------------------------------------------------------

create table public.position_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references public.positions (id) on delete set null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  typed_name text not null check (length(trim(typed_name)) >= 2),
  signed_at timestamptz not null default now(),
  snapshot jsonb, -- the job description exactly as it was when signed
  content_sha256 text,
  countersigned_by uuid references public.profiles (id) on delete set null,
  countersigner_name text,
  countersigner_title text,
  countersigned_at timestamptz,
  unique (position_id, user_id)
);

-- The database fills in the time, the signed text and its fingerprint; only the
-- countersignature can be added later.
create or replace function public.position_ack_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  p positions%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into p from positions where id = new.position_id;
    if not found or p.company_id is distinct from company_of(new.user_id) then
      raise exception 'This job description is not for your agency';
    end if;
    new.company_id := p.company_id;
    new.signed_at := now();
    new.snapshot := to_jsonb(p) - 'file_path' - 'created_at' - 'updated_at' - 'active';
    new.content_sha256 := encode(extensions.digest(new.snapshot::text, 'sha256'), 'hex');
    new.countersigned_by := null;
    new.countersigner_name := null;
    new.countersigner_title := null;
    new.countersigned_at := null;
    return new;
  end if;
  -- position_id may only be cleared, which happens when a position is deleted.
  if (new.user_id, new.company_id, new.typed_name, new.signed_at, new.snapshot, new.content_sha256)
     is distinct from (old.user_id, old.company_id, old.typed_name, old.signed_at, old.snapshot, old.content_sha256)
     or (new.position_id is not null and new.position_id is distinct from old.position_id) then
    raise exception 'A signed job description cannot be changed';
  end if;
  if new.countersigner_name is distinct from old.countersigner_name then
    new.countersigned_by := auth.uid();
    new.countersigned_at := case when new.countersigner_name is null then null else now() end;
  else
    new.countersigned_by := old.countersigned_by;
    new.countersigned_at := old.countersigned_at;
  end if;
  return new;
end;
$$;

create trigger position_ack_guard
  before insert or update on public.position_acknowledgements
  for each row execute function public.position_ack_guard();

alter table public.position_acknowledgements enable row level security;

create policy "employees read own job acknowledgements" on public.position_acknowledgements
  for select to authenticated using (user_id = auth.uid());
create policy "employees sign own job description" on public.position_acknowledgements
  for insert to authenticated
  with check (user_id = auth.uid()
              and position_id = (select e.position_id from public.employee_profiles e where e.user_id = auth.uid()));
create policy "staff read company job acknowledgements" on public.position_acknowledgements
  for select to authenticated using (can_manage_company(company_id));
create policy "staff countersign job acknowledgements" on public.position_acknowledgements
  for update to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));
create policy "admins delete job acknowledgements" on public.position_acknowledgements
  for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------------
-- Drug screening
-- ---------------------------------------------------------------------------

alter table public.companies
  add column drug_screen_required boolean not null default false,
  add column drug_screen_instructions text,
  add column drug_screen_url text,
  add column drug_screen_service_code text,
  add column drug_screen_case_number text,
  add column drug_screen_paid_by_facility boolean not null default true;

create table public.drug_screens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  screen_type text not null default 'pre_employment'
    check (screen_type in ('pre_employment', 'random', 'reasonable_suspicion', 'post_incident', 'return_to_duty')),
  appointment_date date,
  appointment_location text,
  result text not null default 'pending'
    check (result in ('pending', 'negative', 'positive', 'dilute', 'refused', 'cancelled')),
  result_date date,
  notes text,
  file_path text,
  file_name text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index drug_screens_company_idx on public.drug_screens (company_id, result);

-- Employees record their appointment; only staff record the result.
create or replace function public.drug_screens_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();
  if can_manage_company(new.company_id) then
    if tg_op = 'UPDATE' and (new.result, new.result_date) is distinct from (old.result, old.result_date) then
      new.recorded_by := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.screen_type := 'pre_employment';
    new.result := 'pending';
    new.result_date := null;
    new.notes := null;
    new.file_path := null;
    new.file_name := null;
    new.recorded_by := null;
    new.created_at := now();
    return new;
  end if;
  if (new.user_id, new.screen_type, new.result, new.result_date, new.notes, new.file_path, new.file_name, new.recorded_by)
     is distinct from
     (old.user_id, old.screen_type, old.result, old.result_date, old.notes, old.file_path, old.file_name, old.recorded_by) then
    raise exception 'Only your manager or BC HR can record drug screening results';
  end if;
  return new;
end;
$$;

create trigger drug_screens_guard
  before insert or update on public.drug_screens
  for each row execute function public.drug_screens_guard();

alter table public.drug_screens enable row level security;

create policy "employees manage own screening appointment" on public.drug_screens
  for select to authenticated using (user_id = auth.uid());
create policy "employees add own screening" on public.drug_screens
  for insert to authenticated with check (user_id = auth.uid());
create policy "employees update own screening appointment" on public.drug_screens
  for update to authenticated using (user_id = auth.uid() and result = 'pending') with check (user_id = auth.uid());
create policy "staff manage company screenings" on public.drug_screens
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

grant select, insert, update, delete on public.positions, public.position_acknowledgements,
  public.drug_screens to authenticated;
