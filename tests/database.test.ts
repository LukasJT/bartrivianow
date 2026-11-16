import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

test('PostGIS search and private correction queue work on the production migration',async()=>{
 const db=await PGlite.create({extensions:{postgis}});
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const migration=await readFile(new URL('../supabase/migrations/202611160001_catalog.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const sql=execFileSync(process.execPath,['tools/export-sql.ts'],{encoding:'utf8'});
  await db.exec(sql);
  // Fixed dates exercise the actual spatial join regardless of when the pilot catalog expires.
  await db.exec(`insert into public.occurrences (id,series_id,recurrence_key,local_date,starts_at,status) values
    ('db-near-test','stout-event','2026-12-03','2026-12-03','2026-12-03T19:00:00-05:00','scheduled'),
    ('db-far-test','irenes-event','2026-12-03','2026-12-03','2026-12-03T19:00:00-05:00','scheduled'),
    ('db-cancelled-test','stout-event','2026-12-04','2026-12-04','2026-12-04T19:00:00-05:00','cancelled')
    on conflict do nothing;`);
  const matches=await db.query<{occurrence_id:string}>(`select occurrence_id from public.search_radius(43.6532,-79.3832,3000,'2026-12-03T00:00:00Z','2026-12-05T00:00:00Z')`);
  const ids=matches.rows.map(row=>row.occurrence_id);
  assert.ok(ids.includes('db-near-test'));
  assert.ok(!ids.includes('db-far-test')&&!ids.includes('db-cancelled-test'));
  const submit=()=>db.query<{accepted:boolean}>(`select public.submit_report('Test venue','Correction for a schedule','https://example.com/evidence',repeat('a',64),null,null) as accepted`);
  for(let i=0;i<4;i++)assert.equal((await submit()).rows[0].accepted,true);
  assert.equal((await submit()).rows[0].accepted,false);
  await db.exec('grant select on public.reports to anon; set role anon;');
  const anonymous=await db.query('select id from public.reports');
  assert.equal(anonymous.rows.length,0);
  await assert.rejects(submit(),/permission denied/);
 }finally{await db.close();}
});
