-- BC HR & Compliance portal: agency compliance (run AFTER 002_onboarding.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Management-level records for each client agency, visible to BC HR admins and
-- that agency's managers only (never employees):
--   * state licenses, plant / facility documents, policies & procedures
--   * license revisions (corrections requested by the Department of Health)
--   * every attachment version is kept, and every change is logged
-- Only BC HR admins can delete anything, so the documentation trail stays complete.

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  category text not null check (category in ('state_license', 'plant', 'policy_procedure')),
  doc_type text not null,
  title text not null,
  number text,
  issuing_agency text,
  state text,
  version text,
  effective_date date,
  expiry_date date,
  notes text,
  archived boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index compliance_documents_company_idx on public.compliance_documents (company_id, category, expiry_date);

create table public.license_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  license_id uuid references public.compliance_documents (id) on delete set null,
  title text not null,
  description text,
  requested_by text not null default 'Department of Health',
  requested_date date,
  due_date date,
  submitted_date date,
  closed_date date,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'submitted', 'accepted', 'closed')),
  resolution text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index license_revisions_company_idx on public.license_revisions (company_id, status, due_date);

-- Attachments for a document or a revision. Files are never overwritten: a new upload
-- becomes the current version and older ones stay as history.
create table public.compliance_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_id uuid references public.compliance_documents (id) on delete cascade,
  revision_id uuid references public.license_revisions (id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  size bigint,
  note text,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  check ((document_id is null) <> (revision_id is null))
);

-- Who did what, when. Written only by the triggers below; nobody can edit it.
create table public.compliance_activity (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  document_id uuid,
  revision_id uuid,
  actor uuid default auth.uid(),
  action text not null,
  at timestamptz not null default now()
);

create index compliance_activity_document_idx on public.compliance_activity (document_id, at);
create index compliance_activity_revision_idx on public.compliance_activity (revision_id, at);

-- ---------------------------------------------------------------------------
-- Integrity and activity log
-- ---------------------------------------------------------------------------

-- Stamp who changed a record and keep linked rows in the same company.
create or replace function public.compliance_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.company_id := old.company_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_table_name = 'license_revisions' then
    if new.license_id is not null
       and not exists (select 1 from compliance_documents d
                       where d.id = new.license_id and d.company_id = new.company_id and d.category = 'state_license') then
      raise exception 'A revision must be linked to a state license of the same agency';
    end if;
  end if;
  return new;
end;
$$;

create trigger compliance_documents_stamp
  before insert or update on public.compliance_documents
  for each row execute function public.compliance_stamp();
create trigger license_revisions_stamp
  before insert or update on public.license_revisions
  for each row execute function public.compliance_stamp();

create or replace function public.compliance_files_check() returns trigger
language plpgsql set search_path = public as $$
begin
  new.uploaded_by := auth.uid();
  new.uploaded_at := now();
  if not exists (
    select 1 from compliance_documents d where d.id = new.document_id and d.company_id = new.company_id
    union all
    select 1 from license_revisions r where r.id = new.revision_id and r.company_id = new.company_id
  ) then
    raise exception 'Attachment must belong to a record of the same agency';
  end if;
  return new;
end;
$$;

create trigger compliance_files_check
  before insert on public.compliance_files
  for each row execute function public.compliance_files_check();

-- Changed field names, for the activity log.
create or replace function public.changed_fields(old_row jsonb, new_row jsonb) returns text
language sql immutable as $$
  select string_agg(replace(n.key, '_', ' '), ', ' order by n.key)
  from jsonb_each(new_row) n
  where n.value is distinct from old_row -> n.key
    and n.key not in ('updated_at', 'updated_by');
$$;

create or replace function public.compliance_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  msg text;
begin
  -- Saves that changed nothing are not worth logging.
  if tg_op = 'UPDATE' and changed_fields(to_jsonb(old), to_jsonb(new)) is null then
    return null;
  end if;
  if tg_table_name = 'compliance_documents' then
    msg := case when tg_op = 'INSERT' then 'Created'
                else 'Updated ' || coalesce(changed_fields(to_jsonb(old), to_jsonb(new)), 'record') end;
    insert into compliance_activity (company_id, document_id, action) values (new.company_id, new.id, msg);
  elsif tg_table_name = 'license_revisions' then
    msg := case when tg_op = 'INSERT' then 'Revision opened'
                when new.status is distinct from old.status then 'Status changed to ' || replace(new.status, '_', ' ')
                else 'Updated ' || coalesce(changed_fields(to_jsonb(old), to_jsonb(new)), 'record') end;
    insert into compliance_activity (company_id, revision_id, document_id, action)
    values (new.company_id, new.id, new.license_id, msg);
  elsif tg_table_name = 'compliance_files' then
    insert into compliance_activity (company_id, document_id, revision_id, action)
    values (new.company_id, new.document_id, new.revision_id,
            'Uploaded ' || new.file_name || coalesce(' (' || new.note || ')', ''));
  end if;
  return null;
end;
$$;

create trigger compliance_documents_log
  after insert or update on public.compliance_documents
  for each row execute function public.compliance_log();
create trigger license_revisions_log
  after insert or update on public.license_revisions
  for each row execute function public.compliance_log();
create trigger compliance_files_log
  after insert on public.compliance_files
  for each row execute function public.compliance_log();

-- ---------------------------------------------------------------------------
-- Row level security: admins and the agency's managers. Only admins delete.
-- ---------------------------------------------------------------------------

alter table public.compliance_documents enable row level security;
alter table public.license_revisions enable row level security;
alter table public.compliance_files enable row level security;
alter table public.compliance_activity enable row level security;

create policy "staff read agency compliance" on public.compliance_documents
  for select to authenticated using (can_manage_company(company_id));
create policy "staff add agency compliance" on public.compliance_documents
  for insert to authenticated with check (can_manage_company(company_id));
create policy "staff update agency compliance" on public.compliance_documents
  for update to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));
create policy "admins delete agency compliance" on public.compliance_documents
  for delete to authenticated using (is_admin());

create policy "staff read revisions" on public.license_revisions
  for select to authenticated using (can_manage_company(company_id));
create policy "staff add revisions" on public.license_revisions
  for insert to authenticated with check (can_manage_company(company_id));
create policy "staff update revisions" on public.license_revisions
  for update to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));
create policy "admins delete revisions" on public.license_revisions
  for delete to authenticated using (is_admin());

create policy "staff read compliance files" on public.compliance_files
  for select to authenticated using (can_manage_company(company_id));
create policy "staff add compliance files" on public.compliance_files
  for insert to authenticated with check (can_manage_company(company_id));
create policy "admins delete compliance files" on public.compliance_files
  for delete to authenticated using (is_admin());

create policy "staff read compliance activity" on public.compliance_activity
  for select to authenticated using (can_manage_company(company_id));

grant select, insert, update, delete on public.compliance_documents, public.license_revisions,
  public.compliance_files to authenticated;
grant select on public.compliance_activity to authenticated;

-- ---------------------------------------------------------------------------
-- File storage: private bucket, folders <company_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('compliance-files', 'compliance-files', false)
on conflict (id) do nothing;

create policy "compliance files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'compliance-files'
         and (public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

create policy "compliance files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compliance-files'
              and (public.is_admin()
                   or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

create policy "compliance files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'compliance-files' and public.is_admin());
