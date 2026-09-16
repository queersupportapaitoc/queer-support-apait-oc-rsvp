begin;
create or replace function public.rsvp_lease_mail() returns setof public.rsvp_mail_jobs
language sql set search_path=public,pg_temp as $$
 update rsvp_mail_jobs set leased_until=now()+interval '2 minutes', lease_token=gen_random_uuid(), attempts=attempts+1
 where id in (
   select j.id from rsvp_mail_jobs j
   join rsvp_registrations r on r.id=j.registration_id join rsvp_events e on e.id=r.event_id
   where j.available_at <= now() and (j.leased_until is null or j.leased_until < now())
     and j.attempts < 8 and e.delete_at > now() and e.purged_at is null
   order by j.available_at for update of j skip locked limit 5
 ) returning *;
$$;
create function public.rsvp_retry_mail(p_event uuid) returns void
language sql set search_path=public,pg_temp as $$
 update rsvp_mail_jobs set attempts=0, available_at=now()
 where attempts>=8 and (leased_until is null or leased_until < now())
 and registration_id in(select id from rsvp_registrations where event_id=p_event);
$$;
revoke all on function public.rsvp_retry_mail(uuid) from public,anon,authenticated;
grant execute on function public.rsvp_retry_mail(uuid) to service_role;
notify pgrst,'reload schema';
commit;
