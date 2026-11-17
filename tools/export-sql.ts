import { readFile } from 'node:fs/promises';
import type { Catalog } from '../src/lib/events.ts';
import {localDate, normalize, plusDays, search} from '../src/lib/events.ts';

// Export a transaction for the reviewer's SQL client. Run check:catalog before this command.
const c=JSON.parse(await readFile('src/data/catalog.json','utf8')) as Catalog;
const lit=(value:string|number|boolean|null|undefined)=>value===null||value===undefined?'null':typeof value==='string'?"'"+value.replaceAll("'","''")+"'":String(value);
const asJson=(value:unknown)=>lit(JSON.stringify(value))+'::jsonb';
function upsert(table:string,columns:string[],key:string[],rows:string[][]){
 if(!rows.length)return;
 console.log('insert into public.'+table+' ('+columns.join(',')+') values\n'+rows.map(row=>'('+row.join(',')+')').join(',\n')
  +'\non conflict ('+key.join(',')+') do update set '+columns.filter(col=>!key.includes(col)).map(col=>col+'=excluded.'+col).join(',')+';');
}
const today=localDate();
const occurrences=search(c,normalize(new URLSearchParams({type:'all',from:today,to:plusDays(today,55)})),new Date(today+'T00:00:00Z'));
console.log('begin;\nset local standard_conforming_strings=on;');
upsert('venues',['id','name','city','province','address','timezone','website','regions','point','location_evidence'],['id'],
 c.venues.map(v=>[...([v.id,v.name,v.city,v.province,v.address,v.timezone,v.website].map(lit)),
 'array['+v.regions.map(lit).join(',')+']::text[]',v.point?'extensions.st_setsrid(extensions.st_makepoint('+v.point[1]+','+v.point[0]+'),4326)::extensions.geography':'null',lit(v.locationEvidence)]));
upsert('hosts',['id','name','website'],['id'],c.hosts.map(v=>[v.id,v.name,v.website].map(lit)));
upsert('series',['id','venue_id','host_id','title','kind','schedule','valid_until','fee','prize','prize_cents','language','team_max'],['id'],
 c.series.map(s=>[lit(s.id),lit(s.venueId),lit(s.hostId),lit(s.name),lit(s.kind),asJson({days:s.days,time:s.time,end:s.end,date:s.date,anchor:s.anchor,interval:s.interval,monthWeeks:s.monthWeeks}),
 ...[s.validUntil,s.fee,s.prize,s.prizeCents,s.language,s.teamMax].map(lit)]));
upsert('schedule_exceptions',['series_id','recurrence_key','cancelled','moved_to','local_time','source_url','checked_at'],['series_id','recurrence_key'],
 c.exceptions.map(e=>[e.seriesId,e.date,!!e.cancelled,e.movedTo,e.time,e.evidence.url,e.evidence.checked].map(lit)));
const fields=['days','date','time','end','fee','prize','prizeCents','language','teamMax','monthWeeks','anchor','interval'] as const;
upsert('assertions',['series_id','field','source_url','observed_on','value'],['series_id','field','source_url','observed_on'],
 c.series.flatMap(s=>fields.filter(key=>s[key]!==undefined&&s[key]!=='unknown').map(key=>[...([s.id,key,s.evidence.url,s.evidence.checked].map(lit)),asJson(s[key])])));
const targetIds=c.series.map(s=>lit(s.id));
if(targetIds.length){
  // Obsolete generated rows cease matching the SQL search while their identities remain available.
  console.log('update public.occurrences set status=\'cancelled\' where local_date>='+lit(today)
    +' and series_id in ('+targetIds.join(',')+')'
    +(occurrences.length?' and id not in ('+occurrences.map(o=>lit(o.id)).join(',')+')':'')+';');
}
upsert('occurrences',['id','series_id','recurrence_key','local_date','starts_at','ends_at','status'],['id'],
 occurrences.map(o=>[o.id,o.series.id,o.id.split('--').at(-1),o.date,o.startsAt,o.endsAt,o.changed?'rescheduled':'scheduled'].map(lit)));
console.log('commit;');
