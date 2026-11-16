create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table public.venues (
 id text primary key, name text not null, city text not null, province text not null,
 address text not null, timezone text not null, website text not null,
 regions text[] not null, point extensions.geography(Point,4326),
 location_evidence text
);
create index venues_point_idx on public.venues using gist(point);
create table public.hosts (id text primary key, name text not null, website text);
create table public.series (
 id text primary key, venue_id text not null references public.venues,
 host_id text references public.hosts, title text not null, kind text not null,
 schedule jsonb not null, valid_until date not null,
 fee text not null check(fee in ('free','paid','unknown')),
 prize text not null check(prize in ('cash','gift-card','other','unknown')),
 prize_cents int check(prize_cents>=0), currency char(3) not null default 'CAD',
 language text not null, team_max int check(team_max>0)
);
create table public.occurrences (
 id text primary key, series_id text not null references public.series,
 recurrence_key date not null, local_date date not null, starts_at timestamptz not null,
 ends_at timestamptz, status text not null check(status in ('scheduled','cancelled','rescheduled')),
 unique(series_id,recurrence_key)
);
create index occurrences_start_idx on public.occurrences(starts_at,series_id) where status<>'cancelled';
create table public.schedule_exceptions (
 series_id text not null references public.series, recurrence_key date not null,
 cancelled boolean not null default false, moved_to date, local_time time, source_url text not null,
 checked_at date not null, primary key(series_id,recurrence_key)
);
create table public.assertions (
 series_id text not null references public.series, field text not null,
 source_url text not null, observed_on date not null, value jsonb not null,
 primary key(series_id,field,source_url,observed_on)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), venue text not null, venue_id text,
 series_id text, source_url text not null, details text not null,
 client_fingerprint text not null, created_at timestamptz not null default now(),
 reviewed_at timestamptz, status text not null default 'pending' check(status in ('pending','resolved','dismissed'))
);
create index reports_limits_idx on public.reports(created_at,client_fingerprint);
alter table public.venues enable row level security;
alter table public.hosts enable row level security;
alter table public.series enable row level security;
alter table public.occurrences enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.assertions enable row level security;
alter table public.reports enable row level security;
grant usage on schema extensions to service_role;
grant select on public.venues, public.series, public.occurrences to service_role;
grant select,insert,update on public.reports to service_role;

create function public.search_radius(lat double precision, lon double precision, radius_m int,
  starts timestamptz, ends timestamptz)
returns table (occurrence_id text, distance_m double precision)
language sql stable set search_path = pg_catalog, extensions as $$
  select o.id, extensions.st_distance(v.point, centre.point)
  from public.venues v join public.series s on s.venue_id=v.id
  join public.occurrences o on o.series_id=s.id
  cross join lateral (select extensions.st_setsrid(extensions.st_makepoint(lon,lat),4326)::extensions.geography point) centre
  where lat between -90 and 90 and lon between -180 and 180 and radius_m between 1 and 100000
    and ends>starts and ends-starts<=interval '57 days'
    and o.starts_at>=starts and o.starts_at<ends and o.status<>'cancelled'
    and o.local_date<=s.valid_until and extensions.st_dwithin(v.point,centre.point,radius_m)
  order by o.starts_at, o.id limit 250;
$$;
revoke execute on function public.search_radius(double precision,double precision,int,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.search_radius(double precision,double precision,int,timestamptz,timestamptz) to service_role;

create function public.submit_report(p_venue text,p_details text,p_url text,p_client text,p_venue_id text,p_series_id text)
returns boolean language plpgsql set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(93842217);
 if char_length(p_venue) not between 2 and 140 or char_length(p_details) not between 12 and 1200
 or char_length(p_url)>500 or p_url not like 'https://%' or char_length(p_client)<>64 then return false; end if;
 if (select count(*) from public.reports where created_at>now()-interval '1 day')>=60
 or (select count(*) from public.reports where client_fingerprint=p_client and created_at>now()-interval '1 day')>=4 then return false; end if;
 insert into public.reports(venue,details,source_url,client_fingerprint,venue_id,series_id)
 values (p_venue,p_details,p_url,p_client,p_venue_id,p_series_id);
 return true;
end;
$$;
revoke execute on function public.submit_report(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_report(text,text,text,text,text,text) to service_role;
