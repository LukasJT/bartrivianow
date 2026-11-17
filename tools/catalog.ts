import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { Temporal } from '@js-temporal/polyfill';
import { isRegion, regionIds } from '../src/data/regions.ts';
import { localDate, normalize, plusDays, search, type Catalog } from '../src/lib/events.ts';

const canonical='src/data/catalog.json';
const stage='private/staged-catalog.json';
const https=(s:string)=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const date=(s:string)=>{try{return /^\d{4}-\d\d-\d\d$/.test(s)&&Temporal.PlainDate.from(s).toString()===s;}catch{return false;}};
const clock=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const key=(s:string)=>/^[a-z0-9][a-z0-9-]{0,79}$/.test(s);
const fail=(message:string):never=>{throw Error(message);};
async function read(path:string):Promise<Catalog>{return JSON.parse(await readFile(path,'utf8'));}
function check(c:Catalog){
  if(!Array.isArray(c.venues)||!Array.isArray(c.series)||!Array.isArray(c.hosts)||!Array.isArray(c.exceptions))fail('Missing catalog collections');
  for(const [label,items] of [['venue',c.venues],['series',c.series],['host',c.hosts]] as const){
    if(new Set(items.map(i=>i.id)).size!==items.length||items.some(i=>!key(i.id)))fail('Invalid/duplicate '+label+' ID');
  }
  for(const v of c.venues){
    if(!v.name?.trim()||!v.city?.trim()||!v.address?.trim()||!v.regions?.length||v.regions.some(r=>!isRegion(r))||!https(v.website))fail('Invalid venue '+v.id);
    Temporal.Now.zonedDateTimeISO(v.timezone);
    if(v.point&&(!https(v.locationEvidence??'')||v.point.length!==2||!v.point.every(Number.isFinite)||Math.abs(v.point[0])>90||Math.abs(v.point[1])>180))fail('Invalid map point '+v.id);
  }
  for(const s of c.series){
    if(!s.name?.trim()||!c.venues.some(v=>v.id===s.venueId)||(s.hostId&&!c.hosts.some(h=>h.id===s.hostId))
      ||!s.evidence||!https(s.evidence.url)||!date(s.evidence.checked)||!date(s.validUntil)
      ||s.validUntil<s.evidence.checked||s.validUntil>plusDays(s.evidence.checked,60)
      ||s.evidence.checked>localDate()||!clock(s.time)||(s.end&&!clock(s.end))
      ||(s.date?!date(s.date)||s.date>s.validUntil:(!s.days?.length||s.days.some(day=>!Number.isInteger(day)||day<1||day>7)))
      ||(s.interval&&(!s.anchor||!date(s.anchor)||s.interval!==2))
      ||(s.monthWeeks&&s.monthWeeks.some(n=>!Number.isInteger(n)||n<1||n>5))
      ||!['trivia','comedy','games'].includes(s.kind)||!['free','paid','unknown'].includes(s.fee)
      ||!['cash','gift-card','other','unknown'].includes(s.prize)||!['en','fr','bilingual','unknown'].includes(s.language)
      ||(s.prizeCents!==undefined&&(!Number.isSafeInteger(s.prizeCents)||s.prizeCents<=0||s.prize==='unknown')))fail('Invalid series '+s.id);
  }
  const exceptions=new Set<string>();
  for(const e of c.exceptions){
    const id=e.seriesId+':'+e.date;
    if(exceptions.has(id)||!c.series.some(s=>s.id===e.seriesId)||!date(e.date)||!e.evidence
      ||!date(e.evidence.checked)||!https(e.evidence.url)||(e.time&&!clock(e.time))||(e.movedTo&&!date(e.movedTo))
      ||(!e.cancelled&&!e.time&&!e.movedTo))fail('Invalid exception '+id);
    exceptions.add(id);
  }
}
function summary(c:Catalog){
  const t=localDate(), venues=new Map(c.venues.map(v=>[v.id,v]));
  return {venues:c.venues.length,series:c.series.length,trivia:c.series.filter(s=>s.kind==='trivia').length,
    expiring:c.series.filter(s=>s.validUntil>=t&&s.validUntil<=plusDays(t,7)).map(s=>s.id),
    expired:c.series.filter(s=>s.validUntil<t).map(s=>s.id),
    byRegion:Object.fromEntries(regionIds.map(r=>[r,c.series.filter(s=>s.kind==='trivia'&&s.validUntil>=t&&venues.get(s.venueId)?.regions.includes(r)).length]))};
}
const [command='check',path]=process.argv.slice(2);
const current=await read(canonical);
if(command==='stage'){
  if(!path)fail('Pass a proposed catalog JSON file');
  const candidate=await read(path);check(candidate);
  await mkdir('private',{recursive:true});
  await writeFile(stage,JSON.stringify(candidate,null,2)+'\n');
  console.log(JSON.stringify(summary(candidate),null,2));
}else if(command==='review'){
  const candidate=await read(stage);check(candidate);
  const list=(c:Catalog)=>[...c.venues,...c.hosts,...c.series,...c.exceptions];
  const next=new Set(list(candidate).map(v=>JSON.stringify(v)));
  const prev=new Set(list(current).map(v=>JSON.stringify(v)));
  for(const v of prev)if(!next.has(v))console.log('- '+v);
  for(const v of next)if(!prev.has(v))console.log('+ '+v);
}else if(command==='approve'){
  const candidate=await read(stage);check(candidate);
  await writeFile(canonical+'.tmp',JSON.stringify(candidate,null,2)+'\n');
  await rename(canonical+'.tmp',canonical);
  console.log('Approved local catalog. Review the Git diff and deploy a new build.');
}else if(command==='occurrences'){
  check(current);
  const from=localDate();
  const p=normalize(new URLSearchParams({type:'all',from,to:plusDays(from,55)}));
  console.log(JSON.stringify(search(current,p),null,2));
}else if(command==='check'){
  check(current);
  console.log(JSON.stringify(summary(current),null,2));
}else fail('Expected check, stage, review, approve, or occurrences');
