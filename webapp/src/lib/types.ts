export type Event = {
  id: string;
  slug: string;
  title: string;
  location: string;
  starts_at: string;
  delete_at: string;
  capacity: number;
  revision: number;
  purged_at: string | null;
  created_at: string;
};
export type Status = 'confirmed' | 'waitlisted' | 'declined';
export type Envelope = { v: 1; key: string; iv: string; data: string };
export type Details = {
  name: string;
  attendance: 'yes' | 'no' | 'friend';
  friend: string;
  comments: string;
  pronouns: string;
  email: string;
};
export type PrivatePayload = { details: Details; token: string };
export type Registration = {
  id: string;
  event_id: string;
  token_hash: string;
  encrypted: Envelope;
  seats: number;
  status: Status;
  has_email: boolean;
  created_at: string;
};
export type PublicState = {
  event: Event;
  available: number;
  waitlisted: number;
  closed: boolean;
  expired: boolean;
  registration: null | { status: Status; seats: number; hasEmail: boolean };
};
