import { z } from 'zod';
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const envelopeSchema = z.object({
  v: z.literal(1),
  key: z.string().max(1024),
  iv: z.string().length(16),
  data: z.string().min(16).max(24000),
});
export const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(160),
  attendance: z.enum(['yes', 'no', 'friend']),
  friend: z.string().trim().max(300),
  comments: z.string().trim().max(3000),
  pronouns: z.string().trim().max(100),
  email: z.union([z.literal(''), z.email().max(254)]),
});
export const payloadSchema = z.object({
  details: detailsSchema,
  token: tokenSchema,
});
export const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(300),
    starts_at: z.iso.datetime({ offset: true }),
    delete_at: z.iso.datetime({ offset: true }),
    capacity: z.number().int().min(1).max(500),
  })
  .refine((e) => new Date(e.delete_at) > new Date(e.starts_at), {
    message: 'Deletion must be after the event starts.',
  })
  .refine((e) => new Date(e.delete_at) > new Date(), {
    message: 'Deletion must be in the future.',
  });
