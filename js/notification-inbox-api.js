// Client for the draft inbox schema. Backend RLS remains the access authority.
export function createNotificationInboxApi({url,key,getToken,fetcher=globalThis.fetch}) {
  if (typeof url!=='string' || !/^https:\/\//.test(url) || typeof key!=='string' || !key || typeof getToken!=='function' || typeof fetcher!=='function') throw new Error('INBOX_NOT_CONFIGURED');
  const base=url.replace(/\/+$/,'')+'/rest/v1/factory_notification_inbox';
  async function request(query,options={}) {
    const token=await getToken();
    if (!token) throw new Error('SESSION_EXPIRED');
    const response=await fetcher(base+'?'+query,{...options,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
    if (!response.ok) throw new Error(response.status===401?'SESSION_EXPIRED':'INBOX_REQUEST_FAILED');
    const data=await response.json();
    if (!Array.isArray(data)) throw new Error('INBOX_RESPONSE_INVALID');
    return data;
  }
  async function list({limit=30}={}) {
    if (!Number.isInteger(limit) || limit<1 || limit>100) throw new Error('INBOX_LIMIT_INVALID');
    const query=new URLSearchParams({select:'id,kind,title,body,route,data,created_at,read_at',order:'created_at.desc,id.desc',limit:String(limit)});
    return request(query);
  }
  async function markRead(id) {
    if (typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('INBOX_ID_INVALID');
    const query=new URLSearchParams({id:'eq.'+id,select:'id,read_at'});
    const rows=await request(query,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({read_at:new Date().toISOString()})});
    if (rows.length!==1) throw new Error('INBOX_NOT_FOUND');
    return rows[0];
  }
  return {list,markRead};
}
