import { calendar, formatDate, formatTime, normalize, search, type Catalog, type Match, type Point } from '../lib/events';
import { findLocations, type SearchLocation } from '../lib/locations';
import { labels, money } from '../lib/labels';
import { regionLabel, type Locale } from '../data/regions';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const lang = get('directory').dataset.lang as Locale;
const fr = lang==='fr';
const form=get<HTMLFormElement>('filters'), results=get<HTMLOListElement>('results');
const count=get('count'), empty=get('empty'), status=get('search-status');
const mapPanel=get('map-panel'), mapStatus=get('map-status'), showMap=get<HTMLButtonElement>('show-map');
const more=get<HTMLButtonElement>('more'), clearLocation=get<HTMLButtonElement>('clear-location');
const locationStatus=get('location-status');
const locations=get('locations'), addLocation=get<HTMLButtonElement>('add-location');
const locationTemplate=get<HTMLTemplateElement>('location-template');
const findButton=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const maxLocations=5;
let params = new URLSearchParams(location.search);
let origin:Point|undefined, centres:SearchLocation[]=[], current:Match[]=[];
let lookup:AbortController|undefined;
const resolved = new Map<HTMLElement,{query:string; options:SearchLocation[]}>();
let limit=25, sequence=0;
let snapshot:Promise<Catalog>|undefined;
let map:import('maplibre-gl').Map|undefined;
let markerClass:typeof import('maplibre-gl').Marker|undefined;
let boundsClass:typeof import('maplibre-gl').LngLatBounds|undefined;
let markers:import('maplibre-gl').Marker[]=[];
let selected:string|undefined;
let mapLoading=false;

function node<K extends keyof HTMLElementTagNameMap>(tag:K, value?:string, css?:string) {
  const el=document.createElement(tag);
  if(value!==undefined) el.textContent=value;
  if(css) el.className=css;
  return el;
}
function link(text:string, path:string, css?:string){
  const a=node('a',text,css);a.href=path;return a;
}
function row(event:Match){
  const s=event.series,v=event.venue;
  const item=node('li',undefined,'event');item.dataset.venue=v.id;
  const when=node('div',undefined,'when');
  when.append(node('span',formatDate(event.date,lang,{weekday:'short'})),node('strong',event.date.slice(-2)),node('span',formatTime(event.time,lang)));
  const copy=node('div',undefined,'event-copy');
  const title=node('h3');
  title.append(link(s.name,'/'+lang+'/series/'+s.id+'/'));
  copy.append(node('span',labels[lang][s.kind],'event-kind'), title,link(v.name+' · '+v.city,'/'+lang+'/venues/'+v.id+'/','venue-link'));
  const facts=node('div',undefined,'facts');
  facts.append(node('span',s.fee==='unknown'?(fr?'Tarif non indiqué':'Fee not listed'):labels[lang][s.fee]));
  if(s.prize!=='unknown')facts.append(node('span',(s.prizeCents?money(s.prizeCents,lang)+' ':'')+labels[lang][s.prize]));
  if(event.distance!==undefined)facts.append(node('span',new Intl.NumberFormat(lang,{maximumFractionDigits:1}).format(event.distance)+' km'));
  if(event.changed)facts.append(node('span',fr?'Horaire modifié':'Schedule changed'));
  copy.append(facts);
  const actions=node('div',undefined,'facts');
  const cal=node('button',fr?'Ajouter au calendrier':'Add to calendar','text-button calendar');cal.type='button';cal.onclick=()=>{
    const url=URL.createObjectURL(new Blob([calendar(event)],{type:'text/calendar;charset=utf-8'}));
    const a=link('',url);a.download=event.id+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  actions.append(cal);
  if(v.point) {
    const pin=node('button',fr?'Voir sur la carte':'Show on map','text-button calendar');pin.type='button';
    pin.onclick=()=>{ selected=v.id; void openMap(); markSelected(); };
    actions.append(pin);
  }
  copy.append(actions); item.append(when,copy);return item;
}
function markSelected(){
  results.querySelectorAll<HTMLElement>('.event').forEach(el=>el.classList.toggle('active',el.dataset.venue===selected));
  markers.forEach(m=>m.getElement().classList.toggle('selected',m.getElement().dataset.venue===selected));
}
function renderRows(){
  results.replaceChildren(...current.slice(0,limit).map(row));
  more.hidden=current.length<=limit; empty.hidden=current.length>0; markSelected();
}
function updateUrl(){
  const next = location.pathname+(params.size?'?'+params.toString():'')+'#agenda';
  if (next!==location.pathname+location.search+location.hash) history.pushState(null,'',next);
}
function syncForm(){
  for(const control of Array.from(form.elements)) {
    if(control instanceof HTMLInputElement||control instanceof HTMLSelectElement){
      if(!control.name)continue;
      if(control instanceof HTMLInputElement&&control.type==='checkbox'){
        control.checked=params.getAll(control.name).includes(control.value);
        continue;
      }
      const fallback=control instanceof HTMLInputElement?control.defaultValue:[...control.options].find(o=>o.defaultSelected)?.value??control.options[0]?.value;
      control.value=params.get(control.name)??fallback??'';
    }
  }
}
async function run(){
  const token=++sequence;limit=25;
  const p=normalize(params);
  const points=centres.map(centre=>centre.point);
  if(origin)points.push(origin);
  results.setAttribute('aria-busy','true');
  status.textContent=fr?'Recherche en cours…':'Searching…';
  try{
    // The public snapshot is a complete, bounded fallback with the same filter rules as the API.
    snapshot??=fetch('/catalog.json').then(res=>{
      if(!res.ok)throw Error('snapshot');return res.json() as Promise<Catalog>;
    }).catch(error=>{snapshot=undefined;throw error;});
    const data=await snapshot;
    const all=search(data,p,new Date(),points);
    if(token!==sequence)return;
    current=all;
    if(!current.some(e=>e.venue.id===selected))selected=undefined;
    count.textContent=fr?current.length+' événements annoncés':current.length+' advertised events';
    renderRows();renderMarkers();
    status.textContent=fr?'Horaires publiés par les organisateurs. Vérifiez avant de partir.':'Schedules come from venues and hosts. Check with them before heading out.';
    const names=centres.map(centre=>centre.label);
    if(origin) names.push(fr?'votre position':'your location');
    if(!names.length && p.place!=='all') names.push(regionLabel(p.place,lang));
    locationStatus.textContent=names.length
      ?(fr?'Rayon de ':'Radius of ')+p.radius+' km '+(fr?'autour de ':'around ')+new Intl.ListFormat(lang).format(names)+'.'
      :(fr?'Saisissez un lieu pour limiter le rayon de recherche.':'Enter a location to apply a search radius.');
  }catch{
    if(token===sequence)status.textContent=fr?'Recherche indisponible. Rechargez la page pour réessayer.':'Search is unavailable. Reload to try again.';
  }finally{if(token===sequence)results.removeAttribute('aria-busy');}
}
function renderMarkers(){
  if(!map||!markerClass||!boundsClass||mapPanel.hidden)return;
  markers.forEach(marker=>marker.remove());markers=[];
  const pubs=new Map(current.filter(e=>e.venue.point).map(e=>[e.venue.id,e.venue]));
  const bounds=new boundsClass();
  for(const v of pubs.values()){
    const [lat,lon]=v.point!;
    const pin=node('button','?', 'map-pin');pin.type='button';pin.setAttribute('aria-label',v.name);pin.dataset.venue=v.id;
    pin.onclick=()=>{
      selected=v.id;
      const index=current.findIndex(e=>e.venue.id===v.id);
      if(index>=limit){limit=index+1;renderRows();}
      markSelected();
      const item=Array.from(results.children).find(el=>(el as HTMLElement).dataset.venue===v.id);
      item?.querySelector('a')?.focus();
    };
    markers.push(new markerClass({element:pin}).setLngLat([lon,lat]).addTo(map));
    bounds.extend([lon,lat]);
  }
  if(!bounds.isEmpty())map.fitBounds(bounds,{padding:45,maxZoom:13,duration:0});
  mapStatus.textContent=pubs.size?(fr?'Choisissez un repère pour consulter le lieu.':'Choose a pin to jump to its event.'):(fr?'Aucun lieu géolocalisé pour cette recherche.':'No mapped venues match this search.');
  markSelected();
}
async function openMap(){
  mapPanel.hidden=false;showMap.setAttribute('aria-expanded','true');showMap.textContent=fr?'Masquer la carte':'Hide map';
  if(map){map.resize();renderMarkers();return;}
  if(mapLoading)return;
  mapLoading=true;
  mapStatus.textContent=fr?'Chargement de la carte…':'Loading map…';
  try{
    const [lib]=await Promise.all([import('maplibre-gl'),import('maplibre-gl/dist/maplibre-gl.css')]);
    markerClass=lib.Marker;boundsClass=lib.LngLatBounds;
    lib.setWorkerUrl(mapWorkerUrl);
    map=new lib.Map({container:get('map'),style:'https://tiles.openfreemap.org/styles/positron',center:[-79.38,43.65],zoom:6,scrollZoom:false,dragRotate:false});
    map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
    map.once('load',renderMarkers);
    map.on('error',()=>{mapStatus.textContent=fr?'Certaines données cartographiques sont indisponibles. Le programme demeure accessible.':'Some map data is unavailable. The event list is still available.';});
  }catch{mapStatus.textContent=fr?'Carte indisponible. Consultez le programme.':'Map unavailable. Use the event list.';}
  finally{mapLoading=false;}
}
showMap.onclick=()=>{
 if(mapPanel.hidden){void openMap();return;}
 mapPanel.hidden=true;showMap.setAttribute('aria-expanded','false');showMap.textContent=fr?'Afficher la carte':'Show map';
};
more.onclick=()=>{limit+=25;renderRows();results.children[limit-25]?.querySelector('a')?.focus();};
function locationEntries(){
  return Array.from(locations.querySelectorAll<HTMLElement>('[data-location-entry]'));
}
function wireLocation(entry:HTMLElement) {
  const field=entry.querySelector<HTMLInputElement>('[data-location-query]')!;
  const choice=entry.querySelector<HTMLElement>('[data-location-choice]')!;
  field.addEventListener('input',()=>{
    lookup?.abort();
    resolved.delete(entry);
    choice.hidden=true;
    choice.querySelector('select')!.replaceChildren();
  });
  entry.querySelector('button')?.addEventListener('click',()=>{
    lookup?.abort();
    resolved.delete(entry);
    entry.remove();
    addLocation.disabled=false;
    addLocation.focus();
  });
}
wireLocation(locationEntries()[0]);
addLocation.onclick=()=>{
  if(locationEntries().length>=maxLocations)return;
  const entry=locationTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  locations.append(entry);
  wireLocation(entry);
  entry.querySelector('input')!.focus();
  addLocation.disabled=locationEntries().length>=maxLocations;
};

async function resolveEntry(entry:HTMLElement, signal:AbortSignal) {
  const field=entry.querySelector<HTMLInputElement>('[data-location-query]')!;
  const container=entry.querySelector<HTMLElement>('[data-location-choice]')!;
  const choice=container.querySelector('select')!;
  const query=field.value.trim();
  if(!query)return {};
  let found=resolved.get(entry);
  if(!found || found.query!==query){
    const options=await findLocations(query,lang,signal);
    if(signal.aborted)return {};
    found={query,options};
    if(options.length)resolved.set(entry,found);
    if(options.length>1){
      choice.replaceChildren(new Option(fr?'Sélectionner un résultat':'Select a match',''),
        ...options.map((option,index)=>new Option(option.label,String(index))));
      container.hidden=false;
    }
  }
  if(!found.options.length)return {field,query};
  if(found.options.length>1&&choice.value==='')return {choice};
  return {location:found.options[Number(choice.value)]};
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  lookup?.abort();
  const request=new AbortController();
  lookup=request;
  findButton.disabled=true;
  locationStatus.textContent=fr?'Recherche des lieux…':'Looking up locations…';
  const timeout=setTimeout(()=>request.abort('timeout'),8000);
  try{
    const entries=await Promise.all(locationEntries().map(entry=>resolveEntry(entry,request.signal)));
    if(request.signal.aborted)return;
    const unresolved=entries.find(entry=>entry.choice||entry.field);
    if(unresolved){
      locationStatus.textContent=unresolved.choice
        ?(fr?'Choisissez le lieu qui correspond à votre recherche.':'Choose the location you meant, then search again.')
        :(fr?'Lieu introuvable. Précisez la ville et la province.':'Location not found. Add the city and province, then try again.');
      (unresolved.choice??unresolved.field)?.focus();
      return;
    }
    centres=entries.flatMap(entry=>entry.location?[entry.location]:[]);
    const next=new URLSearchParams();
    for(const [name,value] of new FormData(form))if(typeof value==='string'&&value)next.append(name,value);
    if(!centres.length&&!origin&&params.has('place'))next.set('place',params.get('place')!);
    params=next;updateUrl();await run();
  }catch{
    if(!request.signal.aborted||request.signal.reason==='timeout')
      locationStatus.textContent=fr?'La recherche de lieux est indisponible. Réessayez ou choisissez une ville suggérée.':'Address lookup is unavailable. Try again or choose a suggested city.';
  }finally{
    clearTimeout(timeout);
    if(lookup===request){findButton.disabled=false;lookup=undefined;}
  }
});
get('locate').onclick=()=>{
  const fail=()=>{locationStatus.textContent=fr?'Position indisponible. Saisissez une ville ou une adresse.':'Location unavailable. Enter a city or address.';};
  if(!navigator.geolocation){fail();return;}
  navigator.geolocation.getCurrentPosition(({coords})=>{
    origin=[coords.latitude,coords.longitude];params.delete('place');clearLocation.hidden=false;
    locationStatus.textContent=fr?'Distance mesurée depuis votre position.':'Distance uses your current location.';
    void run();
  },fail,{timeout:8000,maximumAge:60000});
};
clearLocation.onclick=()=>{origin=undefined;clearLocation.hidden=true;void run();};
window.addEventListener('popstate',()=>{params=new URLSearchParams(location.search);syncForm();void run();});
syncForm();void run();
