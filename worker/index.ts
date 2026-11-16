import data from '../src/data/catalog.json';
import { calendar, normalize, plusDays, search, type Catalog } from '../src/lib/events';

interface Store {
  fetch(input: Request): Promise<Response>;
}
interface Env {
  ASSETS:Store; SUPABASE_URL?:string; SUPABASE_SERVER_KEY?:string; ADMIN_TOKEN?:string;
}
const catalog=data as unknown as Catalog;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const available=(env:Env)=>env.SUPABASE_URL&&env.SUPABASE_SERVER_KEY;
function storage(env:Env,path:string,init:RequestInit={}){
  return fetch(env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/'+path,{
    ...init,headers:{apikey:env.SUPABASE_SERVER_KEY!,Authorization:'Bearer '+env.SUPABASE_SERVER_KEY,
      'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(5000)
  });
}
async function body(req:Request,max=4096){
  if(!req.body || !req.headers.get('Content-Type')?.startsWith('application/json'))return null;
  const reader=req.body.getReader(), decoder=new TextDecoder();
  let size=0,text='';
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>max){await reader.cancel();return null;}
      text+=decoder.decode(value,{stream:true});
    }
    const parsed=JSON.parse(text+decoder.decode());
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;
  }catch{return null;}
}
const bounded=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
const keyPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;
function validUrl(value:unknown){
  const raw=bounded(value,10,500);
  if(!raw)return null;
  try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
async function reports(req:Request,env:Env){
  if(!available(env))return json({error:'submissions-unavailable'},503);
  const input=await body(req);
  const venue=bounded(input?.venue,2,140), details=bounded(input?.details,12,1200), url=validUrl(input?.url);
  if(!venue||!details||!url)return json({error:'invalid-report'},400);
  const sourceIp=req.headers.get('CF-Connecting-IP')??'local';
  if(!env.ADMIN_TOKEN)return json({error:'submissions-unavailable'},503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(sourceIp)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const id=(v:unknown)=>typeof v==='string'&&keyPattern.test(v)?v:null;
  const res=await storage(env,'rpc/submit_report',{method:'POST',body:JSON.stringify({
    p_venue:venue,p_details:details,p_url:url,p_client:fingerprint,p_venue_id:id(input?.venueId),p_series_id:id(input?.seriesId)
  })});
  if(!res.ok)return json({error:'submissions-unavailable'},503);
  return await res.json()===true?json({status:'pending'},202):json({error:'limit-reached'},429);
}
async function admin(req:Request,env:Env){
  const auth=req.headers.get('Authorization')??'';
  if(!env.ADMIN_TOKEN||auth.length>1024)return json({error:'unauthorized'},401);
  const digest=async (value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(auth),digest('Bearer '+env.ADMIN_TOKEN)]);
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  if(difference)return json({error:'unauthorized'},401);
  if(!available(env))return json({error:'storage-unavailable'},503);
  if(req.method==='GET'){
    const res=await storage(env,'reports?select=id,venue,details,source_url,series_id,created_at,status&status=eq.pending&order=created_at.desc&limit=50');
    return res.ok?json(await res.json()):json({error:'storage-unavailable'},503);
  }
  if(req.method==='PATCH'){
    const input=await body(req);
    const id=bounded(input?.id,36,36), status=input?.status;
    if(!id||!/^[a-f0-9-]{36}$/.test(id)||!['resolved','dismissed'].includes(String(status)))return json({error:'invalid-review'},400);
    const res=await storage(env,'reports?id=eq.'+id+'&status=eq.pending',{method:'PATCH',body:JSON.stringify({status,reviewed_at:new Date().toISOString()})});
    return res.ok?json({status}):json({error:'storage-unavailable'},503);
  }
  return json({error:'method-not-allowed'},405);
}
function searchRequest(req:Request){
  const q=new URL(req.url).searchParams;
  if(req.url.length>1800)return json({error:'query-too-long'},414);
  const p=normalize(q);
  const offset=Math.max(0,Math.min(1000,Math.trunc(Number(q.get('offset'))||0)));
  const events=search(catalog,p);
  return json({total:events.length,results:events.slice(offset,offset+25),nextOffset:offset+25<events.length?offset+25:null,source:'reviewed-snapshot'});
}
function calendarFile(id:string){
  const match=/^([a-z0-9-]{1,80})--(\d{4}-\d\d-\d\d)\.ics$/.exec(id);
  if(!match)return json({error:'not-found'},404);
  const [,seriesId,key]=match;
  const series=catalog.series.find(s=>s.id===seriesId);
  if(!series)return json({error:'not-found'},404);
  const edit=catalog.exceptions.find(e=>e.seriesId===seriesId&&e.date===key);
  const day=edit?.movedTo??key;
  let p;
  try{p=normalize(new URLSearchParams({type:'all',from:plusDays(day,0),to:day}));}catch{return json({error:'invalid-date'},400);}
  const event=search({...catalog,series:[series]},p).find(e=>e.id===seriesId+'--'+key);
  if(!event)return json({error:'not-found'},404);
  return new Response(calendar(event),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="'+id+'"','Cache-Control':'no-store'}});
}
export default {async fetch(req:Request,env:Env){
  const path=new URL(req.url).pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
  try{
    if(path==='/api/v1/health'&&req.method==='GET')return json({status:'ok',reportsConfigured:!!(available(env)&&env.ADMIN_TOKEN)});
    if(path==='/api/v1/search'&&req.method==='GET')return searchRequest(req);
    if(path==='/api/v1/reports'&&req.method==='POST')return await reports(req,env);
    if(path==='/api/v1/admin/reports')return await admin(req,env);
    if(path.startsWith('/api/v1/calendar/')&&req.method==='GET')return calendarFile(path.split('/').at(-1)!);
    return json({error:'not-found'},404);
  }catch{return json({error:'service-unavailable'},503);}
}};
