begin;

create or replace function public.rsvp_purge_expired() returns integer
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
 with deleted as (
   delete from rsvp_events where delete_at <= now() returning 1
 )
 select count(*) into n from deleted;
 delete from rsvp_sessions where expires_at <= now();
 delete from rsvp_rate_limits where expires_at <= now();
 return n;
end $$;

notify pgrst, 'reload schema';
commit;
