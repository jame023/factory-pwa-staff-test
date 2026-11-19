import { request } from '../../js/api.js?v=1.3.396';
import { openDetailDialog } from '../../components/detail-dialog.js?v=1.3.396';
import { escapeHtml as e, bangkokToday } from '../../js/utils.js?v=1.3.396';

const labels={workSessions:'เริ่มงาน–จบงาน',production:'ข้อมูลผลิต',screenEntries:'ข้อมูลสกรีน',deliveries:'การขนส่ง',otRequests:'รายงาน OT',leaveRequests:'คำขอลา'};
const field=(key,label,type='text',value='',extra='')=>'<label class="field">'+e(label)+'<input name="'+key+'" type="'+type+'" value="'+e(value??'')+'" '+extra+'></label>';
const select=(key,label,options,value,disabled=false)=>'<label class="field">'+e(label)+'<select name="'+key+'" '+(disabled?'disabled':'')+'>'+options.map(([id,text])=>'<option value="'+e(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+e(text)+'</option>').join('')+'</select></label>';
const localTime=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T'):'';

export async function openOperationalEditor({category,id=null,context,onSaved=()=>{}}){
 const dialog=openDetailDialog({title:(id?'แก้ไข':'เพิ่ม')+' • '+labels[category],content:'<p role="status">กำลังโหลดแบบฟอร์ม…</p>'});
 let saving=false,dirty=false,pending=null;
 context.signal?.addEventListener('abort',()=>{if(!saving)dialog.close();},{once:true});
 try{
  const [options,record]=await Promise.all([request('package11','records.options'),id?request('package11','records.detail',{id,category}):null]);
  if(!dialog.content.isConnected||context.signal?.aborted)return;
  const p=record?.payload||{},today=bangkokToday();
  const key='factory-admin-record-pending:'+context.user.id+':'+category+':'+(id||'new');
  try{pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch{throw new Error('อ่านคำขอเดิมไม่สำเร็จ กรุณาติดต่อผู้ดูแล');}
  const groupChoices=category==='deliveries'?['ขนส่ง']:['production'].includes(category)?['ผลิต']:category==='screenEntries'?['สกรีน']:category==='otRequests'?['สกรีน','ผลิต','ขนส่ง']:category==='workSessions'?['สกรีน','ผลิต']:['สกรีน','ผลิต','ขนส่ง','ออฟฟิศ'];
  if(record?.group_name&&!groupChoices.includes(record.group_name))groupChoices.push(record.group_name);
  const employeesForGroup=g=>options.employees.filter(x=>Array.isArray(x.groups)&&x.groups.includes(g));
  const preferredGroup=options.employees.find(x=>x.id===(record?.owner_id||options.employees[0]?.id))?.group;
  let group=record?.group_name||(groupChoices.includes(preferredGroup)&&employeesForGroup(preferredGroup).length?preferredGroup:groupChoices.find(g=>employeesForGroup(g).length)||groupChoices[0]);
  let owner=record?.owner_id||employeesForGroup(group)[0]?.id;
  const itemChoices=[...options.items.map(i=>[i.id,i.name])];
  if(p.itemNameId&&!itemChoices.some(([value])=>value===p.itemNameId))itemChoices.unshift([p.itemNameId,(p.orderName||'รายการเดิม')+' (รายการเดิม)']);
  const machineOptions=g=>[['','เลือกเครื่องจักร'],...options.machines.filter(m=>m.active&&m.work_group===g).map(m=>[m.id,m.machine_name])];
  let fields='';
  if(['workSessions','production','screenEntries'].includes(category))fields+=select('machineId','เครื่องจักร',machineOptions(group),p.machineId||'');
  if(category==='workSessions')fields+=select('itemNameId','งาน/ออเดอร์',group==='สกรีน'?[['','เลือกงาน/ออเดอร์'],...itemChoices]:[['','ไม่ระบุสำหรับงานผลิต']],p.itemNameId||'');
  if(['production','screenEntries','otRequests'].includes(category))fields+=field('date','วันที่','date',p.date||today,'required');
  if(category==='workSessions')fields+=field('startedAt','เวลาเริ่มงาน (เวลาไทย)','datetime-local',localTime(p.startedAt),'required')+field('endedAt','เวลาจบงาน (เวลาไทย)','datetime-local',localTime(p.endedAt));
  if(category==='production')fields+=field('quantity','จำนวนผลิต (ใบ)','number',p.quantity??'','min="1" step="1" required')+field('defective','ของเสีย (ใบ)','number',p.defective??0,'min="0" step="1" required');
  if(category==='screenEntries')for(const [k,label] of [['enteredPack','จำนวนแพ็คดี'],['missingBottles','เสียจากสกรีน (ขวด)'],['productionDamagedBottles','เสียจากผลิต (ขวด)']])fields+=field(k,label,'number',p[k]??0,'min="0" step="1" required');
  if(category==='deliveries')fields+=select('itemNameId','สินค้า',[['','เลือกสินค้า'],...options.items.map(i=>[i.id,i.name])],record?.item_name_id||p.itemNameId)+field('billNumber','เลขบิล','text',record?.bill_number||p.billNumber||'','pattern="SD[0-9]{9}" required')+field('quantity','จำนวนสินค้า','number',record?.quantity||p.quantity||'','min="0.01" step="any" required')+field('dateTime','วันเวลาขนส่ง (เวลาไทย)','datetime-local',localTime(record?.event_at||p.dateTime),'required');
  if(category==='otRequests')fields+=field('otStart','เริ่ม OT','time',p.otStart||'','required')+field('otEnd','จบ OT','time',p.otEnd||'','required')+'<label class="field field-full">รายละเอียดงาน<textarea name="details" minlength="5" maxlength="1000" required>'+e(p.details||'')+'</textarea></label>';
  if(category==='leaveRequests')fields+=select('type','ประเภทลา',[['ลากิจ','ลากิจ'],['ลาป่วย','ลาป่วย']],p.type||'ลากิจ')+field('startDate','วันเริ่มลา','date',p.startDate||today,'required')+field('endDate','วันสิ้นสุด','date',p.endDate||today,'required')+select('period','ช่วงลา',[['full','เต็มวัน'],['morning','ครึ่งวันเช้า'],['afternoon','ครึ่งวันบ่าย']],p.leaveItems?.[0]?.period||'full')+'<div class="field field-full" data-leave-dates></div><label class="field field-full">เหตุผลการลา<textarea name="reason" maxlength="500" required>'+e(p.reason||'')+'</textarea></label>';
  else if(category!=='otRequests')fields+='<label class="field field-full">หมายเหตุ<textarea name="note" maxlength="500">'+e(p.note||'')+'</textarea></label>';
  const legacyItems=category==='screenEntries'&&Array.isArray(p.items)?p.items:[];
  if(legacyItems.length)fields+='<div class="field-full"><h3>รายการแพ็คเดิม</h3>'+legacyItems.map((item,index)=>field('legacyPack'+index,item.item_name_snapshot||'สินค้า','number',item.pack_count,'min="0" max="1000000000" step="1" required')).join('')+'<p>ยอดแพ็คดีต้องตรงกับผลรวมรายการย่อย</p></div>';
  const validGroups=groupChoices.filter(g=>employeesForGroup(g).length||g===record?.group_name);
  dialog.content.innerHTML='<p>เจ้าของรายการเป็นพนักงานที่ระบุ ผู้แก้ไขและเหตุผลจะบันทึกในประวัติ</p><form><div class="form-grid">'+select('owner','พนักงานเจ้าของรายการ',(id?options.employees.filter(x=>x.id===owner):employeesForGroup(group)).map(x=>[x.id,x.name]),owner,Boolean(id))+select('group','กลุ่มงาน',validGroups.map(g=>[g,g]),group,Boolean(id))+fields+'</div><label class="field">เหตุผลที่เพิ่มหรือแก้ไข<textarea name="auditReason" minlength="3" maxlength="300" required></textarea></label><p data-save-status role="status"></p><button class="button button-primary" type="submit">ตรวจสอบและบันทึก</button></form>';
  const form=dialog.content.querySelector('form'),status=form.querySelector('[data-save-status]'),button=form.querySelector('[type=submit]');
  if(id&&!options.employees.some(x=>x.id===owner)){const option=new Option('เจ้าของเดิม (ไม่ได้ใช้งาน)',owner,true,true);form.elements.owner.add(option);}
  form.elements.group.onchange=()=>{
   const selectedGroup=form.elements.group.value;
   if(form.elements.machineId)form.elements.machineId.innerHTML=machineOptions(selectedGroup).map(([v,t])=>'<option value="'+e(v)+'">'+e(t)+'</option>').join('');
   if(form.elements.itemNameId)form.elements.itemNameId.innerHTML=(selectedGroup==='สกรีน'?[['','เลือกงาน/ออเดอร์'],...itemChoices]:[['','ไม่ระบุสำหรับงานผลิต']]).map(([v,t])=>'<option value="'+e(v)+'" '+(v===p.itemNameId?'selected':'')+'>'+e(t)+'</option>').join('');
   if(!id){const members=employeesForGroup(selectedGroup);form.elements.owner.innerHTML=members.map(x=>'<option value="'+e(x.id)+'">'+e(x.name)+'</option>').join('');if(members.length)form.elements.owner.value=members[0].id;}
  };
  const drawLeaveDates=()=>{
   if(category!=='leaveRequests')return;
   const existing=new Map([...form.querySelectorAll('[data-leave-day]')].map(el=>[el.dataset.leaveDay,el.value]));
   const start=form.elements.startDate.value,end=form.elements.endDate.value,host=form.querySelector('[data-leave-dates]');host.replaceChildren();
   if(!start||!end||start>end)return;
   const days=(Date.parse(end)-Date.parse(start))/86400000+1;if(days>366)return;
   for(let i=0;i<days;i++){const date=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);const row=document.createElement('label');row.className='field';row.textContent=date;const el=document.createElement('select');el.dataset.leaveDay=date;for(const [v,t] of [['full','เต็มวัน'],['morning','ครึ่งวันเช้า'],['afternoon','ครึ่งวันบ่าย'],['none','ไม่ลา']])el.add(new Option(t,v));el.value=existing.get(date)||p.requestedDates?.find(x=>x.date===date)?.period||p.leaveItems?.find(x=>x.date===date)?.period||form.elements.period.value;row.append(el);host.append(row);}
  };
  if(category==='leaveRequests'){drawLeaveDates();form.elements.startDate.onchange=drawLeaveDates;form.elements.endDate.onchange=drawLeaveDates;form.elements.period.onchange=()=>{form.querySelectorAll('[data-leave-day]').forEach(el=>el.value=form.elements.period.value);};}
  form.addEventListener('input',()=>{dirty=true;});
  const freeze=()=>{form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);button.textContent='ตรวจสอบคำขอเดิม';};
  if(pending){if(pending.category!==category||pending.id!==id)throw new Error('ข้อมูลคำขอเดิมไม่ตรงกับรายการนี้');freeze();status.textContent='มีรายการที่ยังไม่ทราบผล กดตรวจสอบคำขอเดิมก่อนเริ่มใหม่';}
  form.onsubmit=async event=>{
   event.preventDefault();if(saving)return;
   if(!pending){
    const data=Object.fromEntries(new FormData(form));owner=id?record.owner_id:data.owner;group=id?record.group_name:data.group;
    const input={};for(const [k,v] of Object.entries(data))if(!['owner','group','auditReason','period'].includes(k)&&!k.startsWith('legacyPack'))input[k]=v;
    for(const k of ['quantity','defective','enteredPack','missingBottles','productionDamagedBottles'])if(k in input)input[k]=Number(input[k]);
    for(const k of ['startedAt','endedAt','dateTime'])if(input[k])input[k]+=':00+07:00';
    if(category==='leaveRequests')input.dates=[...form.querySelectorAll('[data-leave-day]')].map(el=>({date:el.dataset.leaveDay,period:el.value}));
    if(legacyItems.length)input.items=legacyItems.map((item,index)=>({item_name_id:item.item_name_id,pack_count:Number(data['legacyPack'+index]),work_period:item.work_period==='OT'?'OT':'REGULAR'}));
    pending={category,id,owner,group,expectedUpdatedAt:record?.updated_at||null,requestId:crypto.randomUUID(),input,reason:data.auditReason};
    try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;status.textContent='ไม่สามารถเก็บคำขอตรวจสอบการบันทึกซ้ำได้';return;}
   }
   saving=true;freeze();button.disabled=true;status.textContent='กำลังบันทึกและตรวจสอบประวัติ…';
   try{
    const result=await request('package11','records.correct',pending);
    if(result.owner_id!==pending.owner||result.audit_verified!==true)throw new Error('ยังตรวจผลบันทึกไม่ครบ กรุณาตรวจสอบคำขอเดิม');
    const current=await request('package11','records.detail',{id:result.id,category});
    if(current.owner_id!==pending.owner)throw new Error('เจ้าของรายการไม่ตรงกับคำขอ');
    sessionStorage.removeItem(key);pending=null;dirty=false;
    if(!context.signal?.aborted){context.showToast(current.updated_at===result.updated_at?'บันทึกแล้วและตรวจประวัติการแก้ไขสำเร็จ':'บันทึกแล้ว มีการแก้ไขใหม่หลังรายการนี้','success');await onSaved();}
    dialog.close();
   }catch(error){
    if(['REQUEST_REJECTED','PERMISSION_DENIED','VALIDATION_ERROR'].includes(error.code)){sessionStorage.removeItem(key);pending=null;form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=false);if(id){form.elements.owner.disabled=true;form.elements.group.disabled=true;}button.textContent='ตรวจสอบและบันทึก';}
    status.textContent=error.message||'ยังไม่ทราบผล กรุณาตรวจสอบคำขอเดิม';
  }finally{saving=false;if(button.isConnected)button.disabled=false;if(context.signal?.aborted)dialog.close();}
  };
  const guard=event=>{if(saving||(dirty&&!pending&&!window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการปิดแบบฟอร์มหรือไม่?'))){event.preventDefault();event.stopImmediatePropagation();}};
  const element=dialog.content.closest('dialog');element.addEventListener('cancel',guard);element.addEventListener('click',event=>{if(event.target===element||event.target.closest('.app-detail-dialog__close'))guard(event);},true);
 }catch(error){if(dialog.content.isConnected)dialog.content.innerHTML='<p role="alert">'+e(error.message||'โหลดแบบฟอร์มไม่สำเร็จ')+'</p>';}
}
