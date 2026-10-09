import { db } from 'sdk';
import { and, eq, like, or, asc } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { STATUSES } from '../lib/ranks.js';
import { members } from '../schema.js';

// Admin: list members, optionally filtered by status and a search string.
export default async function (input, ctx) {
  await requireAdmin(ctx);

  const conds = [];
  if (input.status && STATUSES.includes(input.status)) conds.push(eq(members.status, input.status));
  const q = input.q ? String(input.q).trim().slice(0, 40) : '';
  if (q) {
    const pat = `%${q}%`;
    conds.push(or(like(members.fullName, pat), like(members.unit, pat), like(members.username, pat)));
  }

  const rows = await db.select().from(members)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(members.fullName))
    .limit(200)
    .all();

  const pending = await db.$count(members, eq(members.status, 'pending'));
  return { members: rows, pending };
}
