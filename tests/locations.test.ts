import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citySuggestions,findLocations} from '../src/lib/locations.ts';

test('new Ontario and New York cities resolve without a geocoder request',async()=>{
 // An aborted signal would reject a network request; built-in centres remain available offline.
 const signal=AbortSignal.abort();
 for(const city of ['Barrie, ON','Peterborough, ON','Kingston, ON','Sarnia, ON','Windsor, ON','Buffalo, NY','Williamsville, NY','Amherst, NY']){
  assert.ok(citySuggestions.includes(city));
  const hits=await findLocations(city,'en',signal);
  assert.equal(hits.length,1);
  assert.equal(hits[0].label,city);
  assert.ok(hits[0].point.every(Number.isFinite));
 }
 const [buffalo]=await findLocations('buffalo','fr',signal);
 assert.equal(buffalo.label,'Buffalo, NY');
});
