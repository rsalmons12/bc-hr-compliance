-- BC HR & Compliance portal: employee onboarding (run AFTER schema.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Adds:
--   * roles: admin (BC HR staff), manager (client company contact), employee
--   * employee onboarding file (personal details, education, review status)
--   * credentials: degrees, licenses, certifications with expiry dates and uploads
--   * documents to sign with typed electronic signatures
--   * SSN and bank details, encrypted, readable only by BC HR admins (and every view is logged)

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'manager' where role = 'client';
alter table public.profiles alter column role set default 'employee';
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'manager', 'employee'));

alter table public.invites add column role text not null default 'employee'
  check (role in ('manager', 'employee'));
alter table public.invites add column invited_by uuid references public.profiles (id) on delete set null;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'manager');
$$;

-- Admins manage every company; managers manage their own.
create or replace function public.can_manage_company(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (is_manager() and target = my_company_id());
$$;

create or replace function public.company_of(target uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = target;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites where lower(email) = lower(new.email);
  insert into profiles (id, email, full_name, company_id, role)
  values (new.id, new.email,
          coalesce(inv.full_name, new.raw_user_meta_data ->> 'full_name'),
          inv.company_id, coalesce(inv.role, 'employee'));
  delete from invites where lower(email) = lower(new.email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Managers: access to their own company
-- ---------------------------------------------------------------------------

create policy "managers read company profiles" on public.profiles
  for select to authenticated using (is_manager() and company_id = my_company_id());

create policy "managers read company invites" on public.invites
  for select to authenticated using (is_manager() and company_id = my_company_id());
create policy "managers remove company invites" on public.invites
  for delete to authenticated using (is_manager() and company_id = my_company_id());

-- Company files: everyone in the company reads, only admins and managers change.
drop policy "clients upload company documents" on public.documents;
create policy "managers manage company documents" on public.documents
  for all to authenticated
  using (is_manager() and company_id = my_company_id())
  with check (is_manager() and company_id = my_company_id());

drop policy "upload company files" on storage.objects;
drop policy "admins delete files" on storage.objects;
create policy "staff upload company files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents'
              and (public.is_admin()
                   or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));
create policy "staff delete company files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents'
         and (public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

-- Policies: managers can publish for their company and see who signed.
create policy "managers manage company policies" on public.policies
  for all to authenticated
  using (is_manager() and company_id = my_company_id())
  with check (is_manager() and company_id = my_company_id());
create policy "managers read company acknowledgements" on public.policy_acknowledgements
  for select to authenticated
  using (exists (select 1 from public.policies p
                 where p.id = policy_id and is_manager() and p.company_id = my_company_id()));

-- Compliance checklist is for managers, not every employee.
drop policy "clients read company tasks" on public.tasks;
drop policy "clients update company task status" on public.tasks;
create policy "managers read company tasks" on public.tasks
  for select to authenticated using (is_manager() and company_id = my_company_id());
create policy "managers update company task status" on public.tasks
  for update to authenticated
  using (is_manager() and company_id = my_company_id())
  with check (is_manager() and company_id = my_company_id());

-- ---------------------------------------------------------------------------
-- Employee onboarding file
-- ---------------------------------------------------------------------------

create table public.employee_profiles (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  legal_first_name text,
  legal_middle_name text,
  legal_last_name text,
  preferred_name text,
  date_of_birth date,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  emergency_name text,
  emergency_relationship text,
  emergency_phone text,
  job_title text,
  start_date date,
  education_level text,
  school_name text,
  field_of_study text,
  graduation_year int,
  ssn_on_file boolean not null default false,
  bank_on_file boolean not null default false,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'changes_requested', 'approved')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text,
  updated_at timestamptz not null default now()
);

-- Keeps company_id in sync and stops employees approving themselves.
-- Functions that save SSN/bank details set bc.trusted so they can flip the "on file" flags.
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
  if (new.ssn_on_file, new.bank_on_file, new.job_title, new.start_date,
      new.reviewed_at, new.reviewed_by, new.review_notes)
     is distinct from
     (old.ssn_on_file, old.bank_on_file, old.job_title, old.start_date,
      old.reviewed_at, old.reviewed_by, old.review_notes) then
    raise exception 'These fields can only be changed by BC HR or your manager';
  end if;
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger employee_profiles_guard
  before insert or update on public.employee_profiles
  for each row execute function public.employee_profiles_guard();

alter table public.employee_profiles enable row level security;

create policy "employees manage own file" on public.employee_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff manage company files" on public.employee_profiles
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

-- ---------------------------------------------------------------------------
-- Credentials: degrees, licenses, certifications, ID
-- ---------------------------------------------------------------------------

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  kind text not null check (kind in ('degree', 'license', 'certification', 'id', 'other')),
  name text not null,
  issuer text,
  number text,
  issuing_state text,
  issue_date date,
  expiry_date date,
  file_path text,
  file_name text,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credentials_expiry_idx on public.credentials (company_id, expiry_date);

-- Employees cannot verify their own credentials; changing a verified one un-verifies it.
create or replace function public.credentials_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.company_id := company_of(new.user_id);
  new.updated_at := now();
  if can_manage_company(new.company_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified_at := null;
    new.verified_by := null;
  elsif (new.verified_at, new.verified_by) is distinct from (old.verified_at, old.verified_by) then
    raise exception 'Only BC HR or your manager can verify credentials';
  elsif (new.kind, new.name, new.issuer, new.number, new.issuing_state, new.issue_date, new.expiry_date, new.file_path)
        is distinct from
        (old.kind, old.name, old.issuer, old.number, old.issuing_state, old.issue_date, old.expiry_date, old.file_path) then
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$$;

create trigger credentials_guard
  before insert or update on public.credentials
  for each row execute function public.credentials_guard();

alter table public.credentials enable row level security;

create policy "employees manage own credentials" on public.credentials
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff manage company credentials" on public.credentials
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));

-- ---------------------------------------------------------------------------
-- Documents to sign (PDF + typed electronic signature)
-- ---------------------------------------------------------------------------

create table public.sign_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  file_path text not null,
  file_name text not null,
  required_for_onboarding boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sign_documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  typed_name text not null check (length(trim(typed_name)) >= 2),
  document_sha256 text not null,
  user_agent text,
  signed_at timestamptz not null default now(),
  unique (document_id, user_id)
);

-- The server sets the signing time; it cannot be back-dated from the browser.
create or replace function public.signatures_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.signed_at := now();
  return new;
end;
$$;

create trigger signatures_stamp
  before insert on public.signatures
  for each row execute function public.signatures_stamp();

alter table public.sign_documents enable row level security;
alter table public.signatures enable row level security;

create policy "staff manage company sign documents" on public.sign_documents
  for all to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));
create policy "members read company sign documents" on public.sign_documents
  for select to authenticated using (company_id = my_company_id());

create policy "users read own signatures" on public.signatures
  for select to authenticated using (user_id = auth.uid());
create policy "users sign company documents" on public.signatures
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.sign_documents d
                          where d.id = document_id and d.company_id = my_company_id()));
create policy "staff read company signatures" on public.signatures
  for select to authenticated
  using (exists (select 1 from public.sign_documents d
                 where d.id = document_id and can_manage_company(d.company_id)));
create policy "admins remove signatures" on public.signatures
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_manager(), public.can_manage_company(uuid), public.company_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Employee file uploads: private bucket, folders <company_id>/<user_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('employee-files', 'employee-files', false)
on conflict (id) do nothing;

create policy "employee files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'employee-files'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

create policy "employee files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'employee-files'
              and (((storage.foldername(name))[1] = public.my_company_id()::text
                    and (storage.foldername(name))[2] = auth.uid()::text)
                   or public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

create policy "employee files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'employee-files'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

-- ---------------------------------------------------------------------------
-- SSN and direct deposit: encrypted, in a schema the website API cannot read.
-- Only the functions below can touch it.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;

create table private.employee_sensitive (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ssn_enc bytea,
  ssn_last4 text,
  bank_name text,
  account_holder text,
  routing_number text,
  account_number_enc bytea,
  account_last4 text,
  account_type text check (account_type in ('checking', 'savings')),
  updated_at timestamptz not null default now()
);

create table private.sensitive_access_log (
  id bigint generated always as identity primary key,
  viewer uuid not null,
  subject uuid not null,
  viewed_at timestamptz not null default now()
);

-- Encryption key lives in Supabase Vault, not in this table.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bc_hr_data_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'),
                                'bc_hr_data_key', 'Encrypts SSNs and bank account numbers');
  end if;
end;
$$;

create or replace function private.data_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bc_hr_data_key';
$$;

create or replace function private.mark_on_file(ssn boolean, bank boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('bc.trusted', 'on', true);
  insert into public.employee_profiles (user_id, ssn_on_file, bank_on_file)
  values (auth.uid(), coalesce(ssn, false), coalesce(bank, false))
  on conflict (user_id) do update
    set ssn_on_file = coalesce(ssn, public.employee_profiles.ssn_on_file),
        bank_on_file = coalesce(bank, public.employee_profiles.bank_on_file);
  perform set_config('bc.trusted', 'off', true);
end;
$$;

create or replace function public.save_my_ssn(ssn text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  digits text := regexp_replace(coalesce(ssn, ''), '\D', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Please sign in again';
  end if;
  if digits !~ '^\d{9}$' or left(digits, 3) in ('000', '666') or left(digits, 1) = '9'
     or substr(digits, 4, 2) = '00' or right(digits, 4) = '0000' then
    raise exception 'Please enter a valid 9-digit Social Security number';
  end if;
  insert into private.employee_sensitive (user_id, ssn_enc, ssn_last4, updated_at)
  values (auth.uid(), extensions.pgp_sym_encrypt(digits, private.data_key()), right(digits, 4), now())
  on conflict (user_id) do update
    set ssn_enc = excluded.ssn_enc, ssn_last4 = excluded.ssn_last4, updated_at = now();
  perform private.mark_on_file(true, null);
end;
$$;

create or replace function public.save_my_bank(
  bank_name text, account_holder text, routing_number text, account_number text, account_type text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r text := regexp_replace(coalesce(routing_number, ''), '\D', '', 'g');
  a text := regexp_replace(coalesce(account_number, ''), '\D', '', 'g');
  checksum int;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again';
  end if;
  if r !~ '^\d{9}$' then
    raise exception 'The routing number must be 9 digits';
  end if;
  -- ABA routing number checksum
  checksum := 3 * (substr(r,1,1)::int + substr(r,4,1)::int + substr(r,7,1)::int)
            + 7 * (substr(r,2,1)::int + substr(r,5,1)::int + substr(r,8,1)::int)
            +     (substr(r,3,1)::int + substr(r,6,1)::int + substr(r,9,1)::int);
  if checksum % 10 <> 0 then
    raise exception 'That routing number is not valid. Please check it against a cheque or your bank';
  end if;
  if a !~ '^\d{4,17}$' then
    raise exception 'The account number must be 4 to 17 digits';
  end if;
  if account_type not in ('checking', 'savings') then
    raise exception 'Choose checking or savings';
  end if;
  if coalesce(trim(bank_name), '') = '' or coalesce(trim(account_holder), '') = '' then
    raise exception 'Bank name and account holder are required';
  end if;
  insert into private.employee_sensitive
    (user_id, bank_name, account_holder, routing_number, account_number_enc, account_last4, account_type, updated_at)
  values
    (auth.uid(), trim(bank_name), trim(account_holder), r,
     extensions.pgp_sym_encrypt(a, private.data_key()), right(a, 4), account_type, now())
  on conflict (user_id) do update
    set bank_name = excluded.bank_name, account_holder = excluded.account_holder,
        routing_number = excluded.routing_number, account_number_enc = excluded.account_number_enc,
        account_last4 = excluded.account_last4, account_type = excluded.account_type, updated_at = now();
  perform private.mark_on_file(null, true);
end;
$$;

-- What an employee sees about their own details: only the last 4 digits.
create or replace function public.my_sensitive_summary()
returns table (ssn_last4 text, bank_name text, account_holder text, routing_number text,
               account_last4 text, account_type text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.ssn_last4, s.bank_name, s.account_holder, s.routing_number,
         s.account_last4, s.account_type, s.updated_at
  from private.employee_sensitive s
  where s.user_id = auth.uid();
$$;

-- BC HR admins only. Every call is written to private.sensitive_access_log.
create or replace function public.admin_reveal_sensitive(target uuid)
returns table (ssn text, bank_name text, account_holder text, routing_number text,
               account_number text, account_type text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only BC HR admins can view this information';
  end if;
  insert into private.sensitive_access_log (viewer, subject) values (auth.uid(), target);
  return query
    select extensions.pgp_sym_decrypt(s.ssn_enc, private.data_key()),
           s.bank_name, s.account_holder, s.routing_number,
           extensions.pgp_sym_decrypt(s.account_number_enc, private.data_key()),
           s.account_type, s.updated_at
    from private.employee_sensitive s
    where s.user_id = target;
end;
$$;

-- BC HR admins only: who has viewed an employee's sensitive details.
create or replace function public.admin_sensitive_log(target uuid)
returns table (viewer_email text, viewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only BC HR admins can view this information';
  end if;
  return query
    select p.email, l.viewed_at
    from private.sensitive_access_log l
    left join public.profiles p on p.id = l.viewer
    where l.subject = target
    order by l.viewed_at desc
    limit 20;
end;
$$;

revoke all on function private.data_key() from public;
revoke all on function private.mark_on_file(boolean, boolean) from public;
revoke all on function public.save_my_ssn(text) from public, anon;
revoke all on function public.save_my_bank(text, text, text, text, text) from public, anon;
revoke all on function public.my_sensitive_summary() from public, anon;
revoke all on function public.admin_reveal_sensitive(uuid) from public, anon;
revoke all on function public.admin_sensitive_log(uuid) from public, anon;
grant execute on function public.save_my_ssn(text) to authenticated;
grant execute on function public.save_my_bank(text, text, text, text, text) to authenticated;
grant execute on function public.my_sensitive_summary() to authenticated;
grant execute on function public.admin_reveal_sensitive(uuid) to authenticated;
grant execute on function public.admin_sensitive_log(uuid) to authenticated;
