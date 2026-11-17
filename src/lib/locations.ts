import { zones, type Locale } from '../data/regions.ts';
import type { Point } from './events.ts';

export interface SearchLocation {
  label: string;
  point: Point;
}

const key = (value:string) => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
const streetKey = (value:string) => key(value).replace(/[.,]/g,' ').replace(/\bst\b/g,'street')
  .replace(/\bave\b/g,'avenue').replace(/\brd\b/g,'road').replace(/\s+/g,' ').trim();
const supportedCities = [
  ['Toronto', 'ON', zones.gta[2], zones.gta[3]],
  ['Hamilton', 'ON', zones.horseshoe[2], zones.horseshoe[3]],
  ['Kitchener', 'ON', 43.4516, -80.4925],
  ['Waterloo', 'ON', 43.4643, -80.5204],
  ['London', 'ON', zones.london[2], zones.london[3]],
  ['Ottawa', 'ON', zones.ottawa[2], zones.ottawa[3]],
  ['Montréal', 'QC', zones.montreal[2], zones.montreal[3]],
  ['Thunder Bay', 'ON', zones.thunderbay[2], zones.thunderbay[3]],
  ['Sudbury', 'ON', zones.sudbury[2], zones.sudbury[3]],
  ['North Bay', 'ON', zones.northbay[2], zones.northbay[3]],
  ['Timmins', 'ON', zones.timmins[2], zones.timmins[3]],
  ['Barrie', 'ON', zones.simcoe[2], zones.simcoe[3]],
  ['Peterborough', 'ON', zones.kawarthas[2], zones.kawarthas[3]],
  ['Kingston', 'ON', zones.kingston[2], zones.kingston[3]],
  ['Sarnia', 'ON', zones.sarnia[2], zones.sarnia[3]],
  ['Petrolia', 'ON', 42.8821, -82.1513],
  ['Windsor', 'ON', zones.windsor[2], zones.windsor[3]],
  ['Tecumseh', 'ON', 42.3111, -82.8831],
  ['Emeryville', 'ON', 42.2989, -82.7572],
  ['Harrow', 'ON', 42.0334, -82.9165],
  ['Buffalo', 'NY', zones.buffalo[2], zones.buffalo[3]],
  ['Williamsville', 'NY', 42.9639, -78.7378],
  ['Amherst', 'NY', 42.9784, -78.7998],
] as const;

export const citySuggestions = supportedCities.map(([name, province]) => name+', '+province);
const locality = /^(?:city|ville|town|municipalit|municipal|village|community|communaut|hamlet|hameau|populated|lieu habit|suburb|quartier|neighbou|arrondissement|borough)/i;

export async function findLocations(query:string, lang:Locale, signal:AbortSignal):Promise<SearchLocation[]> {
  const [city, province] = key(query).split(',').map(part=>part.trim());
  const local = supportedCities.find(([name, code])=>key(name)===city&&(!province||key(code)===province));
  if (local) return [{label:local[0]+', '+local[1],point:[local[2],local[3]]}];

  const addressNumber = /^\d+\b/.exec(query)?.[0];
  const provider = new URL('https://geolocator.api.geo.ca/');
  provider.search = new URLSearchParams({q:query, lang, keys:addressNumber?'locate,nominatim':'geonames,locate,nominatim'}).toString();
  const response = await fetch(provider, {signal, referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error('Location lookup unavailable');
  const raw:unknown = await response.json();
  if (!Array.isArray(raw)) throw new Error('Invalid geolocator response');

  const candidates:SearchLocation[] = [];
  for (const item of raw) {
    if (typeof item?.name!=='string'||typeof item.category!=='string'
        ||!Number.isFinite(item.lat)||!Number.isFinite(item.lng)
        ||Math.abs(item.lat)>90||Math.abs(item.lng)>180) continue;
    if (addressNumber ? !new RegExp('^'+addressNumber+'\\b').test(item.name)
      : !locality.test(item.category)) continue;
    if (!addressNumber && !key(item.name).startsWith(city)) continue;
    const name:string = item.name;
    const region = typeof item.province==='string' ? item.province : '';
    const label = region&&!key(name).includes(key(region)) ? name+', '+region : name;
    candidates.push({label, point:[item.lat,item.lng]});
  }
  const street = streetKey(query.split(',')[0]);
  const exactStreet = addressNumber && candidates.filter(option=>streetKey(option.label).startsWith(street+' '));
  const results:SearchLocation[] = [];
  for (const option of exactStreet&&exactStreet.length?exactStreet:candidates) {
    if (results.some(result=>key(result.label)===key(option.label)
        ||(Math.abs(result.point[0]-option.point[0])<.001&&Math.abs(result.point[1]-option.point[1])<.001))) continue;
    results.push(option);
    if (results.length===5) break;
  }
  return results;
}
