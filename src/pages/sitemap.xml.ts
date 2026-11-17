import type {APIRoute} from 'astro';
import data from '../data/catalog.json';
import { regionIds } from '../data/regions';
export const GET:APIRoute=()=>{
 const urls=['en','fr'].flatMap(lang=>['','coverage/',...regionIds.map(id=>'areas/'+id+'/'),...data.venues.map(v=>'venues/'+v.id+'/'),...data.series.map(s=>'series/'+s.id+'/')].map(path=>'https://bartrivianow.com/'+lang+'/'+path));
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml'}});
};
