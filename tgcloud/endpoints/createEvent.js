import { db, EndpointError } from 'sdk';
import { requireAdmin, cleanText } from '../lib/auth.js';
import { events } from '../schema.js';

// Admin: create an event. input: { title, description?, location?, startsAt (unix s), durationMin? }
export default async function (input, ctx) {
  const admin = await requireAdmin(ctx);

  const title = cleanText(input.title, 100);
  if (!title) throw new EndpointError('Title is required.', { code: 'BAD_TITLE' });

  const startsAt = Math.floor(Number(input.startsAt));
  if (!Number.isFinite(startsAt) || startsAt < 1_000_000_000) {
    throw new EndpointError('Pick a valid start time.', { code: 'BAD_TIME' });
  }
  let durationMin = Math.floor(Number(input.durationMin || 120));
  if (!Number.isFinite(durationMin) || durationMin < 10 || durationMin > 24 * 60) durationMin = 120;

  const [row] = await db.insert(events).values({
    title,
    description: cleanText(input.description, 500),
    location: cleanText(input.location, 120),
    startsAt,
    durationMin,
    createdBy: admin.id,
  }).returning().run();
  return row;
}
