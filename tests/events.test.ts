import {test} from 'node:test';
import assert from 'node:assert/strict';
import {search, normalize, calendar, type Catalog} from '../src/lib/events.ts';
const now=new Date('2026-03-01T00:00:00Z');
const evidence={url:'https://example.com/calendar',checked:'2026-03-01'};
const catalog:Catalog={venues:[{id:'pub',name:'Test Pub',city:'Toronto',province:'ON',address:'1 Test Street',regions:['gta','horseshoe'],point:[43.6532,-79.3832],timezone:'America/Toronto',website:'https://example.com'}],hosts:[],series:[
 {id:'quiz',name:'Test Quiz',venueId:'pub',kind:'trivia',days:[3],time:'19:00',end:'21:00',fee:'unknown',prize:'gift-card',prizeCents:5000,language:'bilingual',evidence,validUntil:'2026-04-01'}
],exceptions:[]};
const run=(query:string,data=catalog)=>search(data,normalize(new URLSearchParams(query),'2026-03-01'),now);
test('recurs at the venue wall time across daylight saving',()=>{
 const hits=run('from=2026-03-04&to=2026-03-11');
 assert.deepEqual(hits.map(e=>e.startsAt),['2026-03-05T00:00:00Z','2026-03-11T23:00:00Z']);
 assert.match(calendar(hits[0]),/DTSTART:20260305T000000Z/);
});
test('combines exact date, range, fee, prize, and language without guessing unknown fees',()=>{
 assert.equal(run('from=2026-03-04&to=2026-03-04&place=gta&km=1&prize=gift-card&minPrize=50&language=fr').length,1);
 assert.equal(run('from=2026-03-04&place=gta&fee=free').length,0);
 assert.equal(run('from=2026-03-04&place=ottawa&km=100').length,0);
 assert.equal(run('from=2026-03-04&minPrize=51').length,0);
});
test('cancellation and reschedule preserve original recurrence identity',()=>{
 const data={...catalog,exceptions:[
  {seriesId:'quiz',date:'2026-03-04',cancelled:true,evidence},
  {seriesId:'quiz',date:'2026-03-11',movedTo:'2026-03-12',time:'20:00',evidence}
 ]};
 assert.equal(run('from=2026-03-04&to=2026-03-11',data).length,0);
 const [match]=run('from=2026-03-12&to=2026-03-12&day=4',data);
 assert.equal(match.id,'quiz--2026-03-11');
 assert.equal(match.time,'20:00');
});
test('a stale recurrence stops generating dates',()=>{
 assert.equal(run('from=2026-04-02').length,0);
});
test('validates and bounds the requested search window',()=>{
 const p=normalize(new URLSearchParams('from=2026-02-30&to=2028-05-01&day=1.5&km=500'),'2026-03-01');
 assert.deepEqual([p.from,p.to,p.day,p.radius],['2026-03-01','2026-04-25',0,25]);
});
test('filters by any selected weekday and uses the closest search location',()=>{
 const nearby:[number,number]=[43.6532,-79.3832];
 const distant:[number,number]=[45.4215,-75.6972];
 const base='from=2026-03-04&to=2026-03-11&km=5';
 const get=(suffix:string)=>search(catalog,normalize(new URLSearchParams(base+suffix),'2026-03-01'),now,[distant,nearby,nearby]);
 assert.deepEqual(get('&day=1&day=3&day=7').map(event=>event.distance),[0,0]);
 assert.equal(get('&day=1&day=7').length,0);
 assert.equal(get('').length,2);
});
