import { db } from 'sdk';
import { eq, inArray, asc } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { members, attendance } from '../schema.js';

// Admin: who checked in to an event. input: { eventId }
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const rows = await db.select().from(attendance)
    .where(eq(attendance.eventId, Number(input.eventId)))
    .orderBy(asc(attendance.checkedAt))
    .all();
  if (!rows.length) return { attendees: [] };

  const people = await db.select().from(members)
    .where(inArray(members.id, rows.map((r) => r.memberId)))
    .all();
  const byId = new Map(people.map((p) => [p.id, p]));

  return {
    attendees: rows.map((r) => {
      const p = byId.get(r.memberId);
      return {
        memberId: r.memberId,
        checkedAt: r.checkedAt,
        fullName: p ? p.fullName : '(removed)',
        rank: p ? p.rank : null,
        unit: p ? p.unit : null,
      };
    }),
  };
}
