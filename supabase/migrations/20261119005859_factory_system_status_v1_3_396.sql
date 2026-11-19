begin;

create or replace function private.factory_admin_system_status_read()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode='42501',message='ADMIN_REQUIRED';
  end if;
  return jsonb_build_object(
    'checked_at',now(),
    'rfid',(select jsonb_build_object('registered',count(*),'active',count(*) filter(where active),'last_seen_at',max(last_seen_at),'last_received_at',(select max(received_at) from public.employee_rfid_scan_events)) from private.factory_rfid_devices),
    'reports',(select jsonb_build_object('daily_at',max(created_at) filter(where kind='daily_report'),'weekly_at',max(created_at) filter(where kind='weekly_report')) from public.factory_notification_inbox where kind in ('daily_report','weekly_report')),
    'push',(select jsonb_build_object('pending',count(*) filter(where status='pending'),'processing',count(*) filter(where status='processing'),'stale',count(*) filter(where status='processing' and locked_at<now()-interval '5 minutes'),'failed',count(*) filter(where status='failed'),'processed',count(*) filter(where status='sent'),'active_subscriptions',(select count(*) from private.factory_notification_push_subscriptions where active),'last_provider_accept_at',(select max(last_success_at) from private.factory_notification_push_subscriptions)) from private.factory_notification_push_queue),
    'scheduler',jsonb_build_object('active',exists(select 1 from cron.job where jobname='factory-notification-tick' and active),'last_at',(select max(start_time) from cron.job_run_details where jobid in (select jobid from cron.job where jobname='factory-notification-tick')),'last_status',(select status from cron.job_run_details where jobid in (select jobid from cron.job where jobname='factory-notification-tick') order by start_time desc limit 1))
  );
end;
$$;
revoke all on function private.factory_admin_system_status_read() from public,anon;
grant execute on function private.factory_admin_system_status_read() to authenticated;

create or replace function public.factory_admin_system_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.factory_admin_system_status_read();
$$;
revoke all on function public.factory_admin_system_status() from public,anon;
grant execute on function public.factory_admin_system_status() to authenticated;

-- Preserve all inbox rows. Old ambiguous sends must not be replayed automatically.
update private.factory_notification_push_queue
set status='failed',last_error_code='DELIVERY_UNCONFIRMED',locked_at=null
where status='processing' and locked_at<now()-interval '10 minutes';

-- Extend the existing scheduler without changing its schedule, recipients, or reports.
-- The worker already supports recovery of expired leases; tick must also wake it.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('private.factory_notification_tick()'::regprocedure) into definition;
  if position('q.status=''pending'' and q.next_attempt_at<=now()' in definition)=0 then
    raise exception 'NOTIFICATION_TICK_SHAPE_CHANGED';
  end if;
  definition:=replace(definition,
    'q.status=''pending'' and q.next_attempt_at<=now()',
    '(q.status=''pending'' and q.next_attempt_at<=now()) or (q.status=''processing'' and q.locked_at<now()-interval ''5 minutes'')');
  if position(E'begin\n' in definition)=0 then raise exception 'NOTIFICATION_TICK_BODY_CHANGED'; end if;
  definition:=replace(definition,E'begin\n',E'begin\n  update private.factory_notification_push_queue set status=''failed'',last_error_code=''DELIVERY_UNCONFIRMED'',locked_at=null where status=''processing'' and attempts>=6 and locked_at<now()-interval ''5 minutes'';\n');
  execute definition;
end;
$patch$;

do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.factory_notification_claim_push_batch(integer)'::regprocedure) into definition;
  if position('(q.status=''processing'' and q.locked_at<' in definition)=0 then raise exception 'NOTIFICATION_CLAIM_SHAPE_CHANGED'; end if;
  definition:=replace(definition,'(q.status=''processing'' and q.locked_at<','(q.status=''processing'' and q.attempts<6 and q.locked_at<');
  execute definition;
end;
$patch$;

commit;
