-- BC HR & Compliance portal: add rubella to TB and measles screening
-- (run AFTER 007_health_screening.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.health_screenings drop constraint if exists health_screenings_screening_check;
alter table public.health_screenings add constraint health_screenings_screening_check
  check (screening in ('tb', 'measles', 'rubella'));
