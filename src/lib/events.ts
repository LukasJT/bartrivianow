import { Temporal } from '@js-temporal/polyfill';
import { zones, isRegion, type Region } from '../data/regions.ts';

export type Kind = 'trivia' | 'comedy' | 'games';
export type Fee = 'free' | 'paid' | 'unknown';
export type Prize = 'cash' | 'gift-card' | 'other' | 'unknown';
export type Evidence = { url: string; checked: string };
export type Point = [number, number];
export interface Venue {
  id: string; name: string; city: string; province: string; address: string;
  regions: Region[]; point: Point | null; locationEvidence?: string;
  timezone: string; website: string;
}
export interface Series {
  id: string; venueId: string; hostId?: string; name: string; kind: Kind;
  days: number[]; time: string; end?: string; date?: string; anchor?: string;
  interval?: 2; monthWeeks?: number[];
  fee: Fee; prize: Prize; prizeCents?: number; language: 'en'|'fr'|'bilingual'|'unknown';
  teamMax?: number; evidence: Evidence; validUntil: string;
  buyIn?: {
    currency: 'CAD' | 'USD'; checked: string; sourceUrl: string; note?: string;
    terms: {type: 'entry' | 'minimum-spend'; unit: 'person' | 'table' | 'team' | 'unspecified'; amountCents?: number; capacity?: number}[];
  };
}
export interface Exception { seriesId: string; date: string; cancelled?: boolean; movedTo?: string; time?: string; evidence: Evidence }
export interface Catalog {
  venues: Venue[]; series: Series[]; exceptions: Exception[];
  hosts: {id:string; name:string; website?:string}[];
}
export interface Match { id:string; venue:Venue; series:Series; date:string; time:string; startsAt:string; endsAt?:string; distance?:number; changed:boolean }
export const localDate = (now = new Date(), tz = 'America/Toronto') =>
  Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(tz).toPlainDate().toString();
const validDate = (v: string | null) => {
  if (!v || !/^\d{4}-\d\d-\d\d$/.test(v)) return undefined;
  try { return Temporal.PlainDate.from(v).toString(); } catch { return undefined; }
};
export const plusDays = (day:string, n:number) => Temporal.PlainDate.from(day).add({days:n}).toString();
export const weekday = (day:string) => Temporal.PlainDate.from(day).dayOfWeek;
const zoned = (date:string, time:string, timezone:string) =>
  Temporal.PlainDateTime.from(date+'T'+time).toZonedDateTime(timezone, {disambiguation:'reject'}).toInstant();
export const distanceKm = (a:[number,number], b:[number,number]) => {
  const rad = Math.PI / 180;
  const h = Math.sin((b[0]-a[0])*rad/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin((b[1]-a[1])*rad/2)**2;
  return 12742*Math.asin(Math.sqrt(Math.min(1,h)));
};
export function normalize(params:URLSearchParams, today = localDate()) {
  const p = params.get('place') ?? '';
  const place:Region | 'all' = isRegion(p) ? p : 'all';
  const from = validDate(params.get('from')) ?? today;
  const until = validDate(params.get('to')) ?? plusDays(from, 6);
  const to = until < from ? from : until > plusDays(from,55) ? plusDays(from,55) : until;
  const radius = Number(params.get('km') ?? 25);
  const days = [...new Set(params.getAll('day').map(Number).filter(day=>Number.isInteger(day)&&day>=1&&day<=7))];
  return {place, from, to, radius:[1,5,10,25,50,100].includes(radius)?radius:25,
    day:days[0]??0, days,
    kind:params.get('type') || 'trivia', fee:params.get('fee') || '',
    prize:params.get('prize') || '', language:params.get('language') || '',
    minPrize:Math.min(100000,Math.max(0,Number(params.get('minPrize')) || 0)),
    sort:params.get('sort') || 'soon', after:/^\d\d:\d\d$/.test(params.get('after')??'')?params.get('after')!:''};
}
export function search(catalog:Catalog, p:ReturnType<typeof normalize>, now = new Date(), origins:readonly Point[] = []): Match[] {
  const venues = new Map(catalog.venues.map(v=>[v.id,v]));
  const edits = new Map(catalog.exceptions.map(e=>[e.seriesId+':'+e.date,e]));
  const result:Match[] = [];
  const centres:readonly Point[] = origins.length || p.place==='all' ? origins : [[zones[p.place][2],zones[p.place][3]]];
  for(const s of catalog.series){
    const v=venues.get(s.venueId);
    if(!v || (p.kind!=='all'&&s.kind!==p.kind) || (p.fee&&s.fee!==p.fee)
      || (p.prize==='any'&&s.prize==='unknown') || (p.prize&&p.prize!=='any'&&s.prize!==p.prize)
      || (p.minPrize&&(!s.prizeCents||s.prizeCents<p.minPrize*100))
      || (p.language&&s.language!==p.language&&(s.language!=='bilingual'||!['en','fr'].includes(p.language)))) continue;
    const point = v.point;
    const distance = centres.length&&point ? Math.min(...centres.map(centre=>distanceKm(centre,point))) : undefined;
    if (centres.length && (distance===undefined || distance>p.radius)) continue;
    function add(key:string, edit?:Exception) {
      const date=edit?.movedTo??key, time=edit?.time??s.time;
      if(edit?.cancelled || date<p.from || date>p.to || date>s.validUntil
        || (s.anchor&&key<s.anchor) || (p.days.length&&!p.days.includes(weekday(date))) || (p.after&&time<p.after)) return;
      try {
        const start=zoned(date,time,v!.timezone);
        const end=s.end&&!edit?.time ? zoned(s.end<=time?plusDays(date,1):date,s.end,v!.timezone) : undefined;
        if ((end??start).epochMilliseconds<=now.getTime()) return;
        result.push({id:s.id+'--'+key,venue:v!,series:s,date,time,startsAt:start.toString(),endsAt:end?.toString(),distance,changed:!!edit});
      } catch { /* An ambiguous local time needs a reviewed override. */ }
    }
    const moved=catalog.exceptions.filter(e=>e.seriesId===s.id&&e.movedTo);
    for(let date=p.from;date<=p.to;date=plusDays(date,1)){
      const d=Temporal.PlainDate.from(date);
      const week=1+Math.floor((d.day-1)/7);
      const eligible=s.date? s.date===date : s.days.includes(d.dayOfWeek)
        &&(!s.monthWeeks||s.monthWeeks.includes(week))
        &&(!s.interval||(s.anchor&&Math.floor(Temporal.PlainDate.from(s.anchor).until(d).days/7)%2===0));
      if(eligible) add(date,edits.get(s.id+':'+date));
    }
    for(const edit of moved) if(edit.date<p.from||edit.date>p.to) add(edit.date,edit);
  }
  return result.sort((a,b)=>(p.sort==='near'?(a.distance??Infinity)-(b.distance??Infinity):0)
    || a.startsAt.localeCompare(b.startsAt) || (a.distance??Infinity)-(b.distance??Infinity) || a.id.localeCompare(b.id));
}
export const formatDate = (date:string, lang:string, options:Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(lang,{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));
export const formatTime = (time:string, lang:string) => new Intl.DateTimeFormat(lang,{
  timeZone:'UTC',hour:'numeric',minute:'2-digit'
}).format(new Date('2000-01-01T'+time+':00Z'));
export function calendar(event:Match) {
  const safe=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m);
  const stamp=(s:string)=>s.replace(/[-:]/g,'').replace(/\.\d+/,'');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Bar Trivia Now//Events//EN','BEGIN:VEVENT',
    'UID:'+event.id+'@bartrivianow.com','DTSTAMP:'+stamp(new Date().toISOString()),'DTSTART:'+stamp(event.startsAt),
    ...(event.endsAt?['DTEND:'+stamp(event.endsAt)]:[]),'SUMMARY:'+safe(event.series.name),
    'LOCATION:'+safe(event.venue.name+', '+event.venue.address),'URL:'+event.series.evidence.url,
    'END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
