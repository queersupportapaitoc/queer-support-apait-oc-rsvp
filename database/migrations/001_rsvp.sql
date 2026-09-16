begin;

create table public.rsvp_events (
  id uuid primary key default gen_random_uuid(),
  slug uuid not null unique default gen_random_uuid(),
  title text not null default 'Queer Support' check (length(title) between 1 and 120),
  location text not null default 'APAIT · Garden Grove, CA' check (length(location) between 1 and 300),
  starts_at timestamptz not null,
  delete_at timestamptz not null check (delete_at > starts_at),
  capacity integer not null default 15 check (capacity between 1 and 500),
  revision integer not null default 1,
  purged_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.rsvp_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.rsvp_events on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  encrypted jsonb not null,
  seats integer not null check (seats between 0 and 2),
  status text not null check (status in ('confirmed','waitlisted','declined')),
  has_email boolean not null default false,
  created_at timestamptz not null default now(),
  check ((status = 'declined' and seats = 0) or (status <> 'declined' and seats > 0))
);
create index on public.rsvp_registrations (event_id, status);
create table public.rsvp_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.rsvp_registrations on delete cascade,
  kind text not null check (kind in ('confirmed','waitlisted','declined','opening','updated')),
  revision integer not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  lease_token uuid,
  unique (registration_id, kind, revision)
);
create table public.rsvp_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null
);
create table public.rsvp_sessions (
  token_hash text primary key,
  admin_id uuid not null references public.rsvp_admins on delete cascade,
  expires_at timestamptz not null
);
create table public.rsvp_rate_limits (
  key text primary key,
  hits integer not null default 1,
  expires_at timestamptz not null
);

-- Only the server's service-role credential can access these tables or RPCs.
do $$ declare t text; begin
 foreach t in array array['rsvp_events','rsvp_registrations','rsvp_mail_jobs','rsvp_admins','rsvp_sessions','rsvp_rate_limits'] loop
   execute format('alter table public.%I enable row level security', t);
   execute format('revoke all on public.%I from public, anon, authenticated', t);
   execute format('grant all on public.%I to service_role', t);
 end loop;
end $$;

create function public.rsvp_queue_openings(p_event uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; free integer;
begin
 select * into e from rsvp_events where id = p_event;
 if e.starts_at <= now() or e.delete_at <= now() or e.purged_at is not null then return; end if;
 select e.capacity - coalesce(sum(seats),0) into free from rsvp_registrations where event_id=p_event and status='confirmed';
 insert into rsvp_mail_jobs(registration_id,kind,revision)
 select id,'opening',e.revision from rsvp_registrations
 where event_id=p_event and status='waitlisted' and has_email and seats <= free
 on conflict do nothing;
end $$;

create function public.rsvp_signup(p_event uuid, p_token_hash text, p_encrypted jsonb, p_seats integer, p_has_email boolean)
returns public.rsvp_registrations language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; r rsvp_registrations; free integer; state text;
begin
 select * into e from rsvp_events where id=p_event for update;
 if not found or e.starts_at <= now() or e.delete_at <= now() or e.purged_at is not null then raise exception 'EVENT_CLOSED'; end if;
 select * into r from rsvp_registrations where event_id=p_event and token_hash=p_token_hash;
 if found then return r; end if;
 select e.capacity-coalesce(sum(seats),0) into free from rsvp_registrations where event_id=p_event and status='confirmed';
 state := case when p_seats=0 then 'declined'
   when free >= p_seats and not exists(select 1 from rsvp_registrations where event_id=p_event and status='waitlisted' and seats <= free) then 'confirmed'
   else 'waitlisted' end;
 insert into rsvp_registrations(event_id,token_hash,encrypted,seats,status,has_email)
 values(p_event,p_token_hash,p_encrypted,p_seats,state,p_has_email) returning * into r;
 if p_has_email then insert into rsvp_mail_jobs(registration_id,kind,revision) values(r.id,state,e.revision); end if;
 return r;
end $$;

create function public.rsvp_cancel(p_event uuid, p_registration uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; r rsvp_registrations;
begin
 select * into e from rsvp_events where id=p_event for update;
 if not found or e.delete_at <= now() then raise exception 'EVENT_EXPIRED'; end if;
 delete from rsvp_registrations where event_id=p_event and id=p_registration returning * into r;
 if not found then return false; end if;
 if r.status='confirmed' then
   update rsvp_events set revision=revision+1 where id=p_event;
   perform rsvp_queue_openings(p_event);
 end if;
 return true;
end $$;

create function public.rsvp_claim(p_event uuid, p_registration uuid) returns public.rsvp_registrations
language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; r rsvp_registrations; free integer;
begin
 select * into e from rsvp_events where id=p_event for update;
 if not found or e.starts_at <= now() or e.delete_at <= now() or e.purged_at is not null then raise exception 'EVENT_CLOSED'; end if;
 select * into r from rsvp_registrations where event_id=p_event and id=p_registration;
 if not found then raise exception 'RSVP_NOT_FOUND'; end if;
 if r.status='confirmed' then return r; end if;
 if r.status <> 'waitlisted' then raise exception 'NOT_WAITLISTED'; end if;
 select e.capacity-coalesce(sum(seats),0) into free from rsvp_registrations where event_id=p_event and status='confirmed';
 if free < r.seats then raise exception 'NO_SEATS'; end if;
 update rsvp_registrations set status='confirmed' where id=r.id returning * into r;
 delete from rsvp_mail_jobs where registration_id=r.id;
 if r.has_email then insert into rsvp_mail_jobs(registration_id,kind,revision) values(r.id,'confirmed',e.revision); end if;
 return r;
end $$;

create function public.rsvp_update_event(p_event uuid, p_title text, p_location text, p_starts_at timestamptz, p_delete_at timestamptz, p_capacity integer)
returns public.rsvp_events language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; old_e rsvp_events;
begin
 select * into old_e from rsvp_events where id=p_event for update;
 if not found or old_e.purged_at is not null or old_e.delete_at <= now() then raise exception 'EVENT_EXPIRED'; end if;
 if p_delete_at <= now() then raise exception 'INVALID_DELETION_TIME'; end if;
 update rsvp_events set title=p_title, location=p_location, starts_at=p_starts_at, delete_at=p_delete_at, capacity=p_capacity, revision=revision+1
 where id=p_event returning * into e;
 if e.starts_at is distinct from old_e.starts_at or e.location is distinct from old_e.location or e.title is distinct from old_e.title then
   insert into rsvp_mail_jobs(registration_id,kind,revision)
   select id,'updated',e.revision from rsvp_registrations where event_id=p_event and has_email and status <> 'declined';
 end if;
 if e.capacity > old_e.capacity then perform rsvp_queue_openings(p_event); end if;
 return e;
end $$;

create function public.rsvp_purge_expired() returns integer language plpgsql set search_path = public, pg_temp as $$
declare e record; n integer := 0;
begin
 for e in select id from rsvp_events where delete_at <= now() and purged_at is null for update loop
   delete from rsvp_registrations where event_id=e.id;
   update rsvp_events set purged_at=now() where id=e.id;
   n:=n+1;
 end loop;
 delete from rsvp_sessions where expires_at <= now();
 delete from rsvp_rate_limits where expires_at <= now();
 return n;
end $$;

create function public.rsvp_rate_limit(p_key text, p_limit integer, p_window integer) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
 insert into rsvp_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_window))
 on conflict(key) do update set
 hits=case when rsvp_rate_limits.expires_at<=now() then 1 else rsvp_rate_limits.hits+1 end,
 expires_at=case when rsvp_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_window) else rsvp_rate_limits.expires_at end
 returning hits into n;
 return n <= p_limit;
end $$;

create function public.rsvp_lease_mail() returns setof public.rsvp_mail_jobs
language sql set search_path = public, pg_temp as $$
 update rsvp_mail_jobs set leased_until=now()+interval '2 minutes', lease_token=gen_random_uuid(), attempts=attempts+1
 where id in (
   select j.id from rsvp_mail_jobs j
   join rsvp_registrations r on r.id=j.registration_id join rsvp_events e on e.id=r.event_id
   where j.available_at <= now() and (j.leased_until is null or j.leased_until < now())
     and j.attempts < 8 and e.delete_at > now() and e.purged_at is null
   order by j.available_at for update of j skip locked limit 10
 ) returning *;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; remove it explicitly.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'rsvp_%' loop
   execute format('revoke all on function %s from public, anon, authenticated', f.signature);
   execute format('grant execute on function %s to service_role', f.signature);
 end loop;
end $$;

create extension if not exists pg_cron;
select cron.schedule('rsvp-retention', '* * * * *', 'select public.rsvp_purge_expired()');
notify pgrst, 'reload schema';
commit;
