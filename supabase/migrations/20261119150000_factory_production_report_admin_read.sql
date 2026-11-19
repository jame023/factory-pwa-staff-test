begin;

-- Admins may review all production photo reports. Submission stays restricted
-- to active employees assigned to the production group.
drop policy if exists factory_production_reports_select_owner_or_executive
  on public.factory_production_reports;
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
    or (auth.jwt()->'app_metadata'->>'role')='admin'
  )
);

commit;
