begin;

create or replace function public.rsvp_signup(p_event uuid, p_token_hash text, p_encrypted jsonb, p_seats integer, p_has_email boolean)
returns public.rsvp_registrations language plpgsql set search_path = public, pg_temp as $$
declare e rsvp_events; r rsvp_registrations; free integer; state text;
begin
 select * into e from rsvp_events where id=p_event for update;
 if not found or e.starts_at <= now() or e.delete_at <= now() or e.purged_at is not null then raise exception 'EVENT_CLOSED'; end if;
 select * into r from rsvp_registrations where event_id=p_event and token_hash=p_token_hash;
 if found then return r; end if;
 select e.capacity-coalesce(sum(seats),0) into free from rsvp_registrations where event_id=p_event and status='confirmed';
 state := case when p_seats=0 then 'declined'
   when free >= p_seats then 'confirmed'
   else 'waitlisted' end;
 insert into rsvp_registrations(event_id,token_hash,encrypted,seats,status,has_email)
 values(p_event,p_token_hash,p_encrypted,p_seats,state,p_has_email) returning * into r;
 if p_has_email then insert into rsvp_mail_jobs(registration_id,kind,revision) values(r.id,state,e.revision); end if;
 return r;
end $$;

notify pgrst, 'reload schema';
commit;
