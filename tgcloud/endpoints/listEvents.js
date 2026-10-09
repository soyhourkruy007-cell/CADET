import { db } from 'sdk';
import { and, eq, inArray, desc, count } from 'sdk/db';
import { requireActive, now } from '../lib/auth.js';
import { events, attendance } from '../schema.js';

const EARLY_SEC = 3600; // check-in opens one hour before the start

// Active members: recent and upcoming events with my check-in state.
export default async function (input, ctx) {
  const me = await requireActive(ctx);

  const rows = await db.select().from(events).orderBy(desc(events.startsAt)).limit(60).all();
  const ids = rows.map((e) => e.id);

  let mine = new Set();
  let totals = new Map();
  if (ids.length) {
    const my = await db.select().from(attendance)
      .where(and(eq(attendance.memberId, me.id), inArray(attendance.eventId, ids)))
      .all();
    mine = new Set(my.map((a) => a.eventId));

    const cnt = await db.select({ eventId: attendance.eventId, n: count() })
      .from(attendance)
      .where(inArray(attendance.eventId, ids))
      .groupBy(attendance.eventId)
      .all();
    totals = new Map(cnt.map((c) => [c.eventId, c.n]));
  }

  const t = now();
  return {
    now: t,
    events: rows.map((e) => {
      const end = e.startsAt + e.durationMin * 60;
      return {
        ...e,
        endsAt: end,
        checkedIn: mine.has(e.id),
        attendees: totals.get(e.id) || 0,
        canCheckIn: !mine.has(e.id) && t >= e.startsAt - EARLY_SEC && t <= end,
        state: t > end ? 'past' : t >= e.startsAt ? 'live' : 'upcoming',
      };
    }),
  };
}
