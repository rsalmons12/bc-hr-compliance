-- BC HR & Compliance portal: employee training (run AFTER 003_agency_compliance.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Adds:
--   * training modules with content, optional video / PDF and a multiple-choice quiz
--     (modules can be for every agency, or for one agency)
--   * quiz answers that only staff can read; employees' quizzes are graded in the database
--   * completion records with score, date and renewal date, plus training done elsewhere

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade, -- null = every agency
  title text not null,
  description text,
  content text,
  video_url text,
  file_path text,
  file_name text,
  passing_score int not null default 80 check (passing_score between 0 and 100),
  renew_months int check (renew_months is null or renew_months between 1 and 120),
  required_for text[] not null default '{employee}' check (required_for <@ array['employee', 'manager']),
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules (id) on delete cascade,
  position int not null default 0,
  question text not null,
  options jsonb not null
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
);

-- Kept apart from the questions so employees can read questions but never the answers.
create table public.training_answer_keys (
  question_id uuid primary key references public.training_questions (id) on delete cascade,
  correct_index int not null check (correct_index between 0 and 5)
);

create table public.training_completions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.training_modules (id) on delete set null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  title text not null, -- kept even if the module is later deleted
  source text not null check (source in ('portal', 'external')),
  score int check (score between 0 and 100),
  passed boolean not null default true,
  completed_at date not null default current_date,
  expires_at date,
  provider text,
  file_path text,
  file_name text,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index training_completions_user_idx on public.training_completions (user_id, module_id, completed_at);
create index training_completions_company_idx on public.training_completions (company_id, expires_at);

-- Global modules belong to BC HR admins; agency modules also to that agency's managers.
create or replace function public.can_manage_training(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (target is not null and is_manager() and target = my_company_id());
$$;

create or replace function public.training_module_company(target uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from training_modules where id = target;
$$;

create or replace function public.can_see_training(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_modules m
                 where m.id = target and (m.company_id is null or m.company_id = my_company_id() or is_admin()));
$$;

create or replace function public.training_modules_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger training_modules_stamp
  before insert or update on public.training_modules
  for each row execute function public.training_modules_stamp();

-- Quiz completions can only come from submit_training_quiz(); outside training can be
-- recorded by the employee or by staff.
create or replace function public.training_completions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('bc.trusted', true), '') = 'on' then
    new.company_id := company_of(new.user_id);
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Staff may correct dates, provider or the certificate, not who, what or the result.
    new.user_id := old.user_id;
    new.company_id := old.company_id;
    -- module_id may only be cleared, which happens when a module is deleted.
    if new.module_id is not null then
      new.module_id := old.module_id;
    end if;
    new.source := old.source;
    new.score := old.score;
    new.passed := old.passed;
    new.recorded_by := old.recorded_by;
    new.created_at := old.created_at;
    return new;
  end if;
  new.company_id := company_of(new.user_id);
  new.created_at := now();
  new.recorded_by := auth.uid();
  if new.source = 'portal' then
    raise exception 'Training in the portal is recorded by completing the module';
  end if;
  new.score := null;
  new.passed := true;
  return new;
end;
$$;

create trigger training_completions_guard
  before insert or update on public.training_completions
  for each row execute function public.training_completions_guard();

-- Grades a quiz and records the attempt. answers is {"<question id>": <chosen option index>}.
create or replace function public.submit_training_quiz(module uuid, answers jsonb)
returns table (result_score int, result_passed boolean, result_correct int, result_total int,
               completion_id uuid, result_expires date)
language plpgsql security definer set search_path = '' as $$
declare
  m public.training_modules%rowtype;
  total int;
  correct int;
  pct int;
  ok boolean;
  exp date;
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again';
  end if;
  select * into m from public.training_modules t
  where t.id = module and t.active and (t.company_id is null or t.company_id = public.my_company_id());
  if not found then
    raise exception 'This training is not available to you';
  end if;

  select count(*), count(*) filter (where k.correct_index = (answers ->> q.id::text)::int)
    into total, correct
  from public.training_questions q
  left join public.training_answer_keys k on k.question_id = q.id
  where q.module_id = module;

  pct := case when total = 0 then 100 else round(100.0 * correct / total)::int end;
  ok := pct >= m.passing_score;
  exp := case when ok and m.renew_months is not null
              then (current_date + make_interval(months => m.renew_months))::date end;

  perform set_config('bc.trusted', 'on', true);
  insert into public.training_completions (module_id, user_id, title, source, score, passed, expires_at, recorded_by)
  values (module, auth.uid(), m.title, 'portal', pct, ok, exp, auth.uid())
  returning id into cid;
  perform set_config('bc.trusted', 'off', true);

  return query select pct, ok, correct, total, cid, exp;
end;
$$;

revoke all on function public.submit_training_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_training_quiz(uuid, jsonb) to authenticated;
grant execute on function public.can_manage_training(uuid), public.training_module_company(uuid),
  public.can_see_training(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.training_modules enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_answer_keys enable row level security;
alter table public.training_completions enable row level security;

create policy "people read their training" on public.training_modules
  for select to authenticated using (company_id is null or company_id = my_company_id() or is_admin());
create policy "staff manage training" on public.training_modules
  for all to authenticated using (can_manage_training(company_id)) with check (can_manage_training(company_id));

create policy "people read training questions" on public.training_questions
  for select to authenticated using (can_see_training(module_id));
create policy "staff manage training questions" on public.training_questions
  for all to authenticated
  using (can_manage_training(training_module_company(module_id)))
  with check (can_manage_training(training_module_company(module_id)));

create policy "staff manage answer keys" on public.training_answer_keys
  for all to authenticated
  using (can_manage_training(training_module_company((select q.module_id from public.training_questions q where q.id = question_id))))
  with check (can_manage_training(training_module_company((select q.module_id from public.training_questions q where q.id = question_id))));

create policy "people read own training records" on public.training_completions
  for select to authenticated using (user_id = auth.uid());
create policy "staff read company training records" on public.training_completions
  for select to authenticated using (can_manage_company(company_id));
create policy "people record outside training" on public.training_completions
  for insert to authenticated
  with check (user_id = auth.uid() or can_manage_company(company_of(user_id)));
create policy "staff correct training records" on public.training_completions
  for update to authenticated using (can_manage_company(company_id)) with check (can_manage_company(company_id));
create policy "admins delete training records" on public.training_completions
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on public.training_modules, public.training_questions,
  public.training_answer_keys, public.training_completions to authenticated;

-- ---------------------------------------------------------------------------
-- Training files (PDFs for modules): folders "all/..." or "<company_id>/..."
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('training-files', 'training-files', false)
on conflict (id) do nothing;

create policy "training files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'training-files'
         and ((storage.foldername(name))[1] = 'all'
              or (storage.foldername(name))[1] = public.my_company_id()::text
              or public.is_admin()));

create policy "training files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'training-files'
              and (public.is_admin()
                   or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));

create policy "training files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'training-files'
         and (public.is_admin()
              or (public.is_manager() and (storage.foldername(name))[1] = public.my_company_id()::text)));
