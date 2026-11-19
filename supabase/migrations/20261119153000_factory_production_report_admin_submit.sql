begin;

-- Permit active Admin accounts to submit only against active production
-- machines. Employee submission remains restricted to active production staff.
drop policy if exists factory_production_reports_insert_production_employee
  on public.factory_production_reports;
create policy factory_production_reports_insert_production_employee
on public.factory_production_reports
for insert to authenticated
with check (
  owner_id=public.current_employee_id()
  and exists (
    select 1 from public.employees actor
    where actor.id=public.current_employee_id() and actor.active is true
  )
  and exists (
    select 1 from public.machines m
    where m.id=machine_id and m.work_group='ผลิต' and m.active is true
  )
  and (
    (auth.jwt()->'app_metadata'->>'role')='admin'
    or (
      (auth.jwt()->'app_metadata'->>'role')='employee'
      and exists (
        select 1 from public.employee_groups eg
        where eg.employee_id=public.current_employee_id()
          and eg.group_name='ผลิต' and eg.active is true
      )
    )
  )
);

-- Admin uploads are limited to their own staged report path and allowed images.
drop policy if exists factory_production_report_photo_insert on storage.objects;
create policy factory_production_report_photo_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id='factory-production-report-photos'
  and (storage.foldername(name))[1]='productionReports'
  and (storage.foldername(name))[2]=public.current_employee_id()::text
  and name ~ '^productionReports/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and coalesce((metadata->>'size')::bigint,0) between 1 and 524288
  and metadata->>'mimetype'=any(array['image/jpeg','image/png','image/webp'])
  and exists (
    select 1 from public.employees actor
    where actor.id=public.current_employee_id() and actor.active is true
  )
  and (
    (auth.jwt()->'app_metadata'->>'role')='admin'
    or (
      (auth.jwt()->'app_metadata'->>'role')='employee'
      and exists (
        select 1 from public.employee_groups eg
        where eg.employee_id=public.current_employee_id()
          and eg.group_name='ผลิต' and eg.active is true
      )
    )
  )
);

commit;
