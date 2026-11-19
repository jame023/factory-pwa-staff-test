begin;

create table if not exists public.factory_production_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_employee_id() references public.employees(id) on delete restrict,
  sender_name text not null,
  machine_id uuid not null references public.machines(id) on delete restrict,
  machine_name text not null,
  photo_path text not null unique,
  submitted_at timestamptz not null default now(),
  constraint factory_production_reports_photo_path_shape
    check (photo_path ~ '^productionReports/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
);

create index if not exists factory_production_reports_submitted_idx
  on public.factory_production_reports(submitted_at desc, id desc);
create index if not exists factory_production_reports_owner_idx
  on public.factory_production_reports(owner_id, submitted_at desc);

create or replace function public.factory_production_report_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_sender text;
  v_machine text;
begin
  v_owner := public.current_employee_id();
  if v_owner is null then
    raise exception using errcode='42501', message='PRODUCTION_REPORT_SESSION_REQUIRED';
  end if;

  select e.employee_name into v_sender
  from public.employees e
  where e.id=v_owner and e.active is true;
  if v_sender is null then
    raise exception using errcode='42501', message='PRODUCTION_REPORT_ACTIVE_EMPLOYEE_REQUIRED';
  end if;

  if not exists (
    select 1 from public.employee_groups eg
    where eg.employee_id=v_owner and eg.group_name='ผลิต' and eg.active is true
  ) then
    raise exception using errcode='42501', message='PRODUCTION_REPORT_PRODUCTION_GROUP_REQUIRED';
  end if;

  select m.machine_name into v_machine
  from public.machines m
  where m.id=new.machine_id and m.work_group='ผลิต' and m.active is true;
  if v_machine is null then
    raise exception using errcode='22023', message='PRODUCTION_REPORT_MACHINE_UNAVAILABLE';
  end if;

  new.owner_id := v_owner;
  new.sender_name := v_sender;
  new.machine_name := v_machine;
  new.submitted_at := now();
  return new;
end;
$$;

drop trigger if exists factory_production_report_stamp on public.factory_production_reports;
create trigger factory_production_report_stamp
before insert on public.factory_production_reports
for each row execute function public.factory_production_report_stamp();

alter table public.factory_production_reports enable row level security;
revoke all on public.factory_production_reports from public, anon, authenticated;
grant select, insert on public.factory_production_reports to authenticated;

drop policy if exists factory_production_reports_select_owner_or_executive on public.factory_production_reports;
create policy factory_production_reports_select_owner_or_executive
on public.factory_production_reports
for select to authenticated
using (
  public.current_employee_id() is not null
  and exists (
    select 1 from public.employees actor
    where actor.id=public.current_employee_id() and actor.active is true
  )
  and (
    (owner_id=public.current_employee_id()
      and (auth.jwt()->'app_metadata'->>'role')='employee')
    or (auth.jwt()->'app_metadata'->>'role')='executive'
  )
);

drop policy if exists factory_production_reports_insert_production_employee on public.factory_production_reports;
create policy factory_production_reports_insert_production_employee
on public.factory_production_reports
for insert to authenticated
with check (
  owner_id=public.current_employee_id()
  and (auth.jwt()->'app_metadata'->>'role')='employee'
  and exists (
    select 1 from public.employees actor
    where actor.id=public.current_employee_id() and actor.active is true
  )
  and exists (
    select 1 from public.employee_groups eg
    where eg.employee_id=public.current_employee_id()
      and eg.group_name='ผลิต' and eg.active is true
  )
  and exists (
    select 1 from public.machines m
    where m.id=machine_id and m.work_group='ผลิต' and m.active is true
  )
);

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id='factory-production-report-photos' and public is true
  ) then
    raise exception 'FACTORY_PRODUCTION_REPORT_BUCKET_MUST_REMAIN_PRIVATE';
  end if;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('factory-production-report-photos','factory-production-report-photos',false,524288,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists factory_production_report_photo_insert on storage.objects;
create policy factory_production_report_photo_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id='factory-production-report-photos'
  and (storage.foldername(name))[1]='productionReports'
  and (storage.foldername(name))[2]=public.current_employee_id()::text
  and name ~ '^productionReports/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and (auth.jwt()->'app_metadata'->>'role')='employee'
  and coalesce((metadata->>'size')::bigint,0) between 1 and 524288
  and metadata->>'mimetype'=any(array['image/jpeg','image/png','image/webp'])
  and exists (
    select 1 from public.employees actor
    where actor.id=public.current_employee_id() and actor.active is true
  )
  and exists (
    select 1 from public.employee_groups eg
    where eg.employee_id=public.current_employee_id()
      and eg.group_name='ผลิต' and eg.active is true
  )
);

drop policy if exists factory_production_report_photo_select on storage.objects;
create policy factory_production_report_photo_select
on storage.objects
for select to authenticated
using (
  bucket_id='factory-production-report-photos'
  and exists (
    select 1 from public.factory_production_reports r
    where r.photo_path=objects.name
  )
);

drop policy if exists factory_production_report_photo_delete_staged on storage.objects;
create policy factory_production_report_photo_delete_staged
on storage.objects
for delete to authenticated
using (
  bucket_id='factory-production-report-photos'
  and (storage.foldername(name))[1]='productionReports'
  and (storage.foldername(name))[2]=public.current_employee_id()::text
  and not exists (
    select 1 from public.factory_production_reports r
    where r.photo_path=objects.name
  )
);

commit;
