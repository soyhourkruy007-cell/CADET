import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { events, attendance } from '../schema.js';

// Admin: delete an event and its attendance rows (children first: there are no foreign keys).
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const id = Number(input.id);
  const ev = await db.select().from(events).where(eq(events.id, id)).get();
  if (!ev) throw new EndpointError('Event not found.', { code: 'NOT_FOUND' });
  await db.delete(attendance).where(eq(attendance.eventId, id)).run();
  await db.delete(events).where(eq(events.id, id)).run();
  return { ok: true };
}
