begin;
create function public.rsvp_event_summary(p_event uuid) returns jsonb
language sql set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'confirmed',coalesce(sum(seats) filter(where status='confirmed'),0),
 'waitlisted',count(*) filter(where status='waitlisted'),
 'waiting_people',coalesce(sum(seats) filter(where status='waitlisted'),0),
 'pending_mail',(select count(*) from rsvp_mail_jobs j join rsvp_registrations r on r.id=j.registration_id where r.event_id=p_event),
 'failed_mail',(select count(*) from rsvp_mail_jobs j join rsvp_registrations r on r.id=j.registration_id where r.event_id=p_event and j.attempts>=8)
 ) from rsvp_registrations where event_id=p_event;
$$;
revoke all on function public.rsvp_event_summary(uuid) from public,anon,authenticated;
grant execute on function public.rsvp_event_summary(uuid) to service_role;
notify pgrst,'reload schema';
commit;
