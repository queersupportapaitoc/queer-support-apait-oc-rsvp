begin;
-- Materialize the selected batch: an IN subquery can be re-evaluated by the
-- planner as updated rows stop matching the lease predicate.
create or replace function public.rsvp_lease_mail() returns setof public.rsvp_mail_jobs
language sql set search_path=public,pg_temp as $$
 with picked as materialized (
   select j.id from rsvp_mail_jobs j
   join rsvp_registrations r on r.id=j.registration_id join rsvp_events e on e.id=r.event_id
   where j.available_at <= now() and (j.leased_until is null or j.leased_until < now())
     and j.attempts < 8 and e.delete_at > now() and e.purged_at is null
   order by j.available_at, j.id for update of j skip locked limit 5
 )
 update rsvp_mail_jobs j set leased_until=now()+interval '2 minutes', lease_token=gen_random_uuid(), attempts=attempts+1
 from picked where j.id=picked.id returning j.*;
$$;
notify pgrst,'reload schema';
commit;
