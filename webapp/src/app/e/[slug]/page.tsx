import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getEvent, publicState } from '@/lib/events';
import RsvpForm from '@/components/RsvpForm';
export const dynamic = 'force-dynamic';
export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!z.uuid().safeParse(slug).success) notFound();
  let event;
  try {
    event = await getEvent(slug);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') notFound();
    throw e;
  }
  const state = await publicState(event);
  return <RsvpForm initial={state} />;
}
