import { db, EndpointError } from 'sdk';
import { and, eq } from 'sdk/db';
import { requireActive, now } from '../lib/auth.js';
import { events, attendance } from '../schema.js';

const EARLY_SEC = 3600;

// Active member checks in to an event (one hour before start until it ends).
export default async function (input, ctx) {
  const me = await requireActive(ctx);
  const ev = await db.select().from(events).where(eq(events.id, Number(input.eventId))).get();
  if (!ev) throw new EndpointError('Event not found.', { code: 'NOT_FOUND' });

  const t = now();
  const end = ev.startsAt + ev.durationMin * 60;
  if (t < ev.startsAt - EARLY_SEC) throw new EndpointError('Check-in is not open yet.', { code: 'TOO_EARLY' });
  if (t > end) throw new EndpointError('This event has ended.', { code: 'ENDED' });

  const already = await db.select().from(attendance)
    .where(and(eq(attendance.eventId, ev.id), eq(attendance.memberId, me.id)))
    .get();
  if (already) return already;

  try {
    const [row] = await db.insert(attendance)
      .values({ eventId: ev.id, memberId: me.id, checkedAt: t })
      .returning().run();
    return row;
  } catch (e) {
    // The unique index caught a double tap; treat as success.
    const again = await db.select().from(attendance)
      .where(and(eq(attendance.eventId, ev.id), eq(attendance.memberId, me.id)))
      .get();
    if (again) return again;
    throw e;
  }
}
