import { readFile } from 'node:fs/promises';
import type { Catalog } from '../src/lib/events.ts';
const catalog=JSON.parse(await readFile('src/data/catalog.json','utf8')) as Catalog;
const bySource=new Map<string,{id:string;validUntil:string}[]>();
for(const item of catalog.series){
 const checks=bySource.get(item.evidence.url)??[];
 checks.push({id:item.id,validUntil:item.validUntil});
 bySource.set(item.evidence.url,checks);
}
// The initial registry is manual-only. This command records review due dates without fetching or refreshing evidence.
for(const [url,items] of bySource)console.log(JSON.stringify({url,access:'manual-review',items}));
