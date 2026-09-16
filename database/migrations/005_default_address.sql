begin;

alter table public.rsvp_events
  alter column location set default 'APAIT · 12832 Garden Grove Blvd., Suite E, Garden Grove, CA 92843';

commit;
