-- Rollback for migration 20261125065746_factory_leave_policy_v1_3_408.
-- Restores the private leave function definitions captured before the policy update.



CREATE OR REPLACE FUNCTION private.factory_leave_open_at(p_time timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (p_time at time zone 'Asia/Bangkok')::time >= time '05:00'
    and (p_time at time zone 'Asia/Bangkok')::time < time '21:00';
$function$;


CREATE OR REPLACE FUNCTION private.factory_leave_check_window()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not private.factory_leave_open_at(clock_timestamp()) then
    raise exception 'WINDOW_CLOSED: ระบบรับคำขอ แก้ไข และยกเลิกเวลา 05:00–ก่อน 21:00 น. เวลาไทย';
  end if;
end; $function$;


CREATE OR REPLACE FUNCTION private.factory_leave_normalize(p_input jsonb, p_actor uuid, p_group text, p_record uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a date; b date; reason text; days jsonb; total numeric; v_file jsonb; m text; n integer; existing public.factory_record_attachments%rowtype;
begin
  if p_group not in ('ออฟฟิศ','สกรีน','ผลิต','ขนส่ง') or not (
    (auth.jwt()->'app_metadata'->>'role'='admin' and public.is_admin() and p_actor=public.current_employee_id())
    or exists(select 1 from public.employee_groups where employee_id=p_actor and group_name=p_group and active is true)
  ) then raise exception 'FORBIDDEN: บัญชีนี้ยังไม่มีกลุ่มงานหลักที่ใช้งานได้' using errcode='42501'; end if;
  if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('type','startDate','endDate','dates','reason','attachments'))
    then raise exception 'VALIDATION_ERROR: ช่องข้อมูลไม่ตรงกับแบบฟอร์ม'; end if;
  if p_input->>'type' not in ('ลากิจ','ลาป่วย') or p_input->>'type' is null then raise exception 'VALIDATION_ERROR: ประเภทลาไม่ถูกต้อง'; end if;
  reason:=btrim(p_input->>'reason');
  if reason is null or length(reason) not between 1 and 500 then raise exception 'VALIDATION_ERROR: ระบุเหตุผล 1–500 ตัวอักษร'; end if;
  if coalesce(p_input->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_input->>'endDate','') !~ '^\d{4}-\d{2}-\d{2}$'
    then raise exception 'VALIDATION_ERROR: วันที่ไม่ถูกต้อง'; end if;
  a:=(p_input->>'startDate')::date; b:=(p_input->>'endDate')::date;
  if b<a or b-a>365 then raise exception 'VALIDATION_ERROR: ช่วงวันที่ต้องถูกต้องและไม่เกิน 366 วัน'; end if;
  if jsonb_typeof(p_input->'dates') is distinct from 'array' or jsonb_array_length(p_input->'dates')<>b-a+1
    then raise exception 'VALIDATION_ERROR: กรุณากำหนดช่วงเวลาให้ครบทุกวัน'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'dates') d where jsonb_typeof(d)<>'object'
      or coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(d->>'period','') not in ('full','morning','afternoon','none'))
    then raise exception 'VALIDATION_ERROR: ช่วงเวลารายวันไม่ถูกต้อง'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'dates') d where (d->>'date')::date<a or (d->>'date')::date>b)
    or (select count(distinct d->>'date') from jsonb_array_elements(p_input->'dates') d)<>b-a+1
    then raise exception 'VALIDATION_ERROR: วันที่ซ้ำหรืออยู่นอกช่วง'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',d->>'date','period',d->>'period',
    'amount',case d->>'period' when 'full' then 1 else .5 end,
    'label',case d->>'period' when 'full' then 'เต็มวัน' when 'morning' then 'ครึ่งวันเช้า' else 'ครึ่งวันบ่าย' end) order by d->>'date'),'[]')
  into days from jsonb_array_elements(p_input->'dates') d where d->>'period'<>'none'
    and not exists(select 1 from public.factory_records c where c.category='calendar' and c.group_name=p_group
      and c.payload->>'date'=d->>'date' and c.payload->>'status'='หยุด');
  select coalesce(sum((d->>'amount')::numeric),0) into total from jsonb_array_elements(days) d;
  if total=0 then raise exception 'VALIDATION_ERROR: เลือกวันและช่วงเวลาลาอย่างน้อยครึ่งวัน'; end if;
  if p_input->>'type'='ลากิจ' and total>2 then raise exception 'VALIDATION_ERROR: ลากิจได้ไม่เกิน 2 วันต่อครั้ง'; end if;
  if jsonb_typeof(p_input->'attachments') is distinct from 'array' or jsonb_array_length(p_input->'attachments')>5
    then raise exception 'VALIDATION_ERROR: แนบรูปได้สูงสุด 5 รูป'; end if;
  if (select count(distinct x->>'storage_path') from jsonb_array_elements(p_input->'attachments') x)<>jsonb_array_length(p_input->'attachments')
    then raise exception 'VALIDATION_ERROR: รูปแนบซ้ำ'; end if;
  for v_file in select value from jsonb_array_elements(p_input->'attachments') loop
    if v_file->>'mime_type' not in ('image/jpeg','image/png','image/webp') or v_file->>'mime_type' is null
      or coalesce(v_file->>'byte_size','') !~ '^[0-9]{1,7}$' or (v_file->>'byte_size')::int not between 1 and 1048576
      or coalesce(v_file->>'sha256','') !~ '^[0-9a-f]{64}$' or length(coalesce(v_file->>'original_name','')) not between 1 and 120
      or coalesce(v_file->>'storage_path','') !~ '^leaveRequests/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
      or split_part(v_file->>'storage_path','/',2)<>p_actor::text then raise exception 'VALIDATION_ERROR: metadata รูปแนบไม่ถูกต้อง'; end if;
    select * into existing from public.factory_record_attachments where storage_path=v_file->>'storage_path';
    if found then
      if existing.record_id is distinct from p_record or existing.original_name<>v_file->>'original_name'
        or existing.mime_type<>v_file->>'mime_type' or existing.byte_size<>(v_file->>'byte_size')::int or existing.sha256<>v_file->>'sha256'
        then raise exception 'FORBIDDEN: รูปแนบไม่ได้เป็นของคำขอนี้' using errcode='42501'; end if;
    elsif split_part(v_file->>'storage_path','/',3)<>p_request::text then
      raise exception 'FORBIDDEN: รูปใหม่ไม่ได้เป็นของการส่งครั้งนี้' using errcode='42501';
    end if;
  end loop;
  if exists(select 1 from public.factory_records r cross join lateral private.factory_leave_days(r.payload) d
    where r.category='leaveRequests' and r.id is distinct from p_record and r.payload->>'status' in ('pending','approved')
      and exists(select 1 from jsonb_array_elements(days) t where (t->>'date')::date=d.date and d.amount>0
        and (t->>'period'='full' or d.period='full' or t->>'period'=d.period)) )
    then raise exception 'VALIDATION_ERROR: มีคำขอลารออนุมัติหรืออนุมัติแล้วทับช่วงเวลาที่เลือก กรุณาติดต่อออฟฟิศ'; end if;
  for m in select distinct left(d->>'date',7) from jsonb_array_elements(days) d loop
    select count(*) into n from public.factory_records r where r.category='leaveRequests' and r.owner_id=p_actor
      and r.id is distinct from p_record and r.payload->>'status' in ('pending','approved') and r.payload->>'type'=p_input->>'type'
      and exists(select 1 from private.factory_leave_days(r.payload) d where to_char(d.date,'YYYY-MM')=m)
      and (p_input->>'type'='ลากิจ' or not(coalesce((r.payload->>'hasMedicalCertificate')::boolean,false)
        or coalesce(jsonb_array_length(r.payload->'attachments'),0)>0));
    if p_input->>'type'='ลากิจ' and n>=2 then raise exception 'VALIDATION_ERROR: ลากิจครบ 2 ครั้งในเดือน % แล้ว',m; end if;
    if p_input->>'type'='ลาป่วย' and jsonb_array_length(p_input->'attachments')=0 and n>=1 then
      raise exception 'VALIDATION_ERROR: ลาป่วยไม่มีใบรับรองครบ 1 คำขอต่อเดือนแล้ว (นับรวมทุกช่วงเวลา) เดือน %',m; end if;
  end loop;
  return jsonb_build_object('type',p_input->>'type','startDate',a,'endDate',b,'reason',reason,
    'leaveItems',days,'requestedDates',p_input->'dates','totalDays',total,'period',case when (select count(distinct d->>'period') from jsonb_array_elements(days) d)=1
      then days->0->>'label' else 'หลายช่วงเวลา' end,'hasMedicalCertificate',jsonb_array_length(p_input->'attachments')>0);
end;
$function$;


CREATE OR REPLACE FUNCTION private.factory_leave_prepare(p_operation text, p_request_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=private.factory_leave_actor(); actor uuid:=(s->>'employee_id')::uuid; h text; op private.factory_leave_operations%rowtype;
  r public.factory_records%rowtype; normalized jsonb; rid uuid;
begin
  if p_request_id is null or p_operation not in ('create','edit','cancel','review') then raise exception 'VALIDATION_ERROR: request_id/operation ไม่ถูกต้อง'; end if;
  h:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'record',p_record_id,'expected',p_expected_updated_at,'input',p_input)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,43));
  select * into op from private.factory_leave_operations where actor_id=actor and request_id=p_request_id for update;
  if found then
    if op.input_hash<>h then raise exception 'IDEMPOTENCY_CONFLICT: request_id เดิมมีข้อมูลต่างกัน'; end if;
    if op.state='aborted' then raise exception 'OPERATION_ABORTED: การส่งครั้งก่อนถูกยุติแล้ว กรุณาส่งอีกครั้ง'; end if;
    return jsonb_build_object('state',op.state,'id',op.record_id,'request_id',op.request_id,'updated_at',op.result_updated_at,'audit_id',op.audit_id,'removed_paths',op.cleanup_paths,'committed_snapshot',op.committed_snapshot);
  end if;
  if p_operation<>'review' and not(p_operation='cancel' and s->>'role' in ('admin','executive')) then perform private.factory_leave_check_window(); end if;
  if p_operation='create' then
    if p_record_id is not null or p_expected_updated_at is not null then raise exception 'VALIDATION_ERROR: คำขอใหม่ห้ามระบุรายการเดิม'; end if;
    rid:=gen_random_uuid();
  else
    select * into r from public.factory_records where id=p_record_id and category='leaveRequests';
    if not found or not private.factory_leave_can_read(r.owner_id,r.group_name) then raise exception 'NOT_FOUND: ไม่พบคำขอ' using errcode='42501'; end if;
    if p_operation='review' then
      if not(s->>'role'='admin' or (s->>'role'='executive' and r.group_name=s->>'main_group')) then raise exception 'FORBIDDEN: ไม่มีสิทธิ์พิจารณา' using errcode='42501'; end if;
    elsif p_operation='cancel' and s->>'role' in ('admin','executive') then
      if not(s->>'role'='admin' or r.group_name=s->>'main_group') then raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยกเลิกคำขอในกลุ่มงานนี้' using errcode='42501'; end if;
      if r.owner_id=actor or r.created_by=actor then raise exception 'LEAVE_SELF_CANCEL_BLOCKED: ยกเลิกผ่านการจัดการไม่ได้เมื่อเป็นเจ้าของหรือผู้ยื่นแทน' using errcode='42501'; end if;
    elsif r.owner_id<>actor then raise exception 'FORBIDDEN: จัดการได้เฉพาะคำขอของตนเอง' using errcode='42501'; end if;
    if (p_operation in ('review','edit') and r.payload->>'status'<>'pending')
      or (p_operation='cancel' and r.payload->>'status' not in ('pending','approved')) then
      raise exception 'STATUS_CONFLICT: คำขอไม่อยู่ในสถานะที่ดำเนินการได้';
    end if;
    if p_expected_updated_at is null or r.updated_at<>p_expected_updated_at then raise exception 'VERSION_CONFLICT: คำขอเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด'; end if;
    rid:=r.id;
  end if;
  if p_operation in ('create','edit') then
    normalized:=private.factory_leave_normalize(p_input,actor,s->>'main_group',p_record_id,p_request_id);
    if p_operation='edit' and r.group_name is distinct from s->>'main_group' then raise exception 'GROUP_CHANGED: กลุ่มงานเปลี่ยน กรุณาติดต่อผู้ดูแล'; end if;
  else
    if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('reason','decision'))
      then raise exception 'VALIDATION_ERROR: ช่องข้อมูลไม่ถูกต้อง'; end if;
    if length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 500 then raise exception 'VALIDATION_ERROR: ระบุเหตุผล 1–500 ตัวอักษร'; end if;
    if p_operation='review' and coalesce(p_input->>'decision','') not in ('approved','rejected') then raise exception 'VALIDATION_ERROR: ผลพิจารณาไม่ถูกต้อง'; end if;
  end if;
  insert into private.factory_leave_operations(actor_id,request_id,operation,record_id,expected_updated_at,input,input_hash)
    values(actor,p_request_id,p_operation,rid,p_expected_updated_at,p_input,h);
  return jsonb_build_object('state','prepared','id',rid,'request_id',p_request_id,'summary',normalized);
end; $function$;


CREATE OR REPLACE FUNCTION private.factory_leave_apply(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=private.factory_leave_actor(); actor uuid:=(s->>'employee_id')::uuid; op private.factory_leave_operations%rowtype;
  r public.factory_records%rowtype; v jsonb; v_file jsonb; n text; stamp timestamptz:=clock_timestamp(); aid uuid; removed jsonb; snapshot jsonb;
begin
  select * into op from private.factory_leave_operations where actor_id=actor and request_id=p_request_id for update;
  if not found then raise exception 'NOT_FOUND: ไม่พบการเตรียมคำขอ'; end if;
  if op.state='committed' then return jsonb_build_object('state','committed','id',op.record_id,'updated_at',op.result_updated_at,'audit_id',op.audit_id,'removed_paths',op.cleanup_paths,'committed_snapshot',op.committed_snapshot,'duplicate',true); end if;
  if op.state<>'prepared' then raise exception 'OPERATION_ABORTED: การส่งนี้ถูกยุติแล้ว'; end if;
  -- Serialize overlapping-date and monthly-quota validation with the actual write.
  perform pg_advisory_xact_lock(43030001);
  if op.operation<>'review' and not(op.operation='cancel' and s->>'role' in ('admin','executive')) then perform private.factory_leave_check_window(); end if;
  if op.operation<>'create' then
    select * into r from public.factory_records where id=op.record_id and category='leaveRequests' for update;
    if not found or not private.factory_leave_can_read(r.owner_id,r.group_name) then raise exception 'NOT_FOUND: ไม่พบคำขอ' using errcode='42501'; end if;
    if (op.operation in ('review','edit') and r.payload->>'status'<>'pending')
      or (op.operation='cancel' and r.payload->>'status' not in ('pending','approved')) then
      raise exception 'STATUS_CONFLICT: คำขอไม่อยู่ในสถานะที่ดำเนินการได้';
    end if;
    if r.updated_at<>op.expected_updated_at then raise exception 'VERSION_CONFLICT: มีผู้แก้ไขหรือพิจารณาคำขอแล้ว'; end if;
    if op.operation='review' then
      if not(s->>'role'='admin' or (s->>'role'='executive' and r.group_name=s->>'main_group')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
    elsif op.operation='cancel' and s->>'role' in ('admin','executive') then
      if not(s->>'role'='admin' or r.group_name=s->>'main_group') then raise exception 'FORBIDDEN: ไม่มีสิทธิ์ยกเลิกคำขอในกลุ่มงานนี้' using errcode='42501'; end if;
      if r.owner_id=actor or r.created_by=actor then raise exception 'LEAVE_SELF_CANCEL_BLOCKED: ยกเลิกผ่านการจัดการไม่ได้เมื่อเป็นเจ้าของหรือผู้ยื่นแทน' using errcode='42501'; end if;
    elsif r.owner_id<>actor then raise exception 'FORBIDDEN: จัดการได้เฉพาะคำขอของตนเอง' using errcode='42501'; end if;
  end if;
  if op.operation in ('create','edit') then
    if op.operation='edit' and r.group_name is distinct from s->>'main_group' then raise exception 'GROUP_CHANGED: กลุ่มงานเปลี่ยน'; end if;
    v:=private.factory_leave_normalize(op.input,actor,s->>'main_group',case when op.operation='edit' then r.id end,op.request_id);
    select employee_name into n from public.employees where id=actor and active is true;
    v:=v||jsonb_build_object('employee',n,'status','pending');
    for v_file in select value from jsonb_array_elements(op.input->'attachments') loop
      if not exists(select 1 from public.factory_record_attachments a where a.record_id=op.record_id and a.storage_path=v_file->>'storage_path') then
        if not exists(select 1 from storage.objects o where o.bucket_id='factory-record-attachments' and o.name=v_file->>'storage_path'
          and o.owner_id=auth.uid()::text and (o.metadata->>'size')::bigint=(v_file->>'byte_size')::bigint
          and o.metadata->>'mimetype'=v_file->>'mime_type' and o.user_metadata->>'sha256'=v_file->>'sha256') then
          raise exception 'UPLOAD_INCOMPLETE: รูป % ยังอัปโหลดไม่ครบหรือ metadata ไม่ตรง',v_file->>'original_name';
        end if;
      end if;
    end loop;
  end if;
  if op.operation<>'review' and not(op.operation='cancel' and s->>'role' in ('admin','executive')) then perform private.factory_leave_check_window(); end if;
  stamp:=clock_timestamp();
  update private.factory_leave_operations set state='applying',apply_tx=txid_current() where actor_id=actor and request_id=p_request_id;
  if op.operation='create' then
    insert into public.factory_records(id,category,owner_id,group_name,payload,request_id,created_by,updated_by,created_at,updated_at,reason)
      values(op.record_id,'leaveRequests',actor,s->>'main_group',v,op.request_id,actor,actor,stamp,stamp,'ส่งคำขอลา') returning * into r;
  elsif op.operation='edit' then
    update public.factory_records set payload=v,updated_by=actor,updated_at=stamp,reason='แก้ไขคำขอลา pending'
      where id=op.record_id returning * into r;
  elsif op.operation='cancel' then
    update public.factory_records set payload=payload||jsonb_build_object('status','cancelled','cancellationReason',btrim(op.input->>'reason'),'cancelledAt',stamp),
      updated_by=actor,updated_at=stamp,reason=btrim(op.input->>'reason') where id=op.record_id returning * into r;
  else
    select employee_name into n from public.employees where id=actor;
    update public.factory_records set payload=payload||jsonb_build_object('status',op.input->>'decision','reviewedAt',stamp,'reviewedBy',n,
      'rejectionReason',case when op.input->>'decision'='rejected' then btrim(op.input->>'reason') else '' end),
      reviewed_by=actor,reviewed_at=stamp,updated_by=actor,updated_at=stamp,reason=btrim(op.input->>'reason') where id=op.record_id returning * into r;
  end if;
  removed:='[]'::jsonb;
  if op.operation in ('create','edit') then
    select coalesce(jsonb_agg(a.storage_path),'[]') into removed from public.factory_record_attachments a where a.record_id=r.id
      and not exists(select 1 from jsonb_array_elements(op.input->'attachments') x where x->>'storage_path'=a.storage_path);
    delete from public.factory_record_attachments a where a.record_id=r.id
      and not exists(select 1 from jsonb_array_elements(op.input->'attachments') x where x->>'storage_path'=a.storage_path);
    insert into public.factory_record_attachments(record_id,storage_path,original_name,mime_type,byte_size,sha256,created_by,created_at)
      select r.id,x->>'storage_path',x->>'original_name',x->>'mime_type',(x->>'byte_size')::int,x->>'sha256',actor,stamp
      from jsonb_array_elements(op.input->'attachments') x where not exists(select 1 from public.factory_record_attachments a where a.storage_path=x->>'storage_path');
  end if;
  select id into aid from public.audit_logs where table_name='factory_records:leaveRequests' and record_id=r.id and actor_employee_id=actor
    and (new_value->>'updated_at')::timestamptz=r.updated_at order by created_at desc limit 1;
  if aid is null then raise exception 'AUDIT_MISSING: ยังยืนยัน Audit ไม่ได้'; end if;
  select jsonb_build_object('record',to_jsonb(r),'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id)
    from public.factory_record_attachments a where a.record_id=r.id),'[]'),
    'audit',(select jsonb_build_object('id',id,'actor_employee_id',actor_employee_id,'action',action,'created_at',created_at) from public.audit_logs where id=aid)) into snapshot;
  update private.factory_leave_operations set state='committed',apply_tx=null,result_updated_at=r.updated_at,audit_id=aid,updated_at=stamp,cleanup_paths=removed,committed_snapshot=snapshot
    where actor_id=actor and request_id=p_request_id;
  return jsonb_build_object('state','committed','id',r.id,'updated_at',r.updated_at,'audit_id',aid,'removed_paths',removed,'committed_snapshot',snapshot,'duplicate',false);
end; $function$;
