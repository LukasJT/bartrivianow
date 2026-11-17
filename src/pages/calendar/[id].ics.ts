import type { APIRoute, GetStaticPaths } from 'astro';
import data from '../../data/catalog.json';
import { calendar, localDate, normalize, plusDays, search, type Catalog, type Match } from '../../lib/events';

export const getStaticPaths: GetStaticPaths = () => {
  if (import.meta.env.PUBLIC_STATIC_HOST !== 'github-pages') return [];
  const today = localDate();
  const query = normalize(new URLSearchParams({ type: 'all', from: today, to: plusDays(today, 55) }));
  return search(data as Catalog, query).map(event => ({ params: { id: event.id }, props: { event } }));
};

export const GET: APIRoute = ({ props }) => new Response(calendar(props.event as Match), {
  headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
});
