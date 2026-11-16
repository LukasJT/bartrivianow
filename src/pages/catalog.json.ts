import type { APIRoute } from 'astro';
import catalog from '../data/catalog.json';
export const GET:APIRoute=()=>new Response(JSON.stringify(catalog),{headers:{'Content-Type':'application/json; charset=utf-8'}});
