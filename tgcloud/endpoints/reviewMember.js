import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { requireAdmin, now } from '../lib/auth.js';
import { tell } from '../lib/notify.js';
import { isRank, STATUSES, ROLES } from '../lib/ranks.js';
import { members } from '../schema.js';

// Admin: change one member's status, rank, role or unit.
// input: { id, status?, rank?, role?, unit? }
export default async function (input, ctx) {
  const admin = await requireAdmin(ctx);

  const target = await db.select().from(members).where(eq(members.id, Number(input.id))).get();
  if (!target) throw new EndpointError('Member not found.', { code: 'NOT_FOUND' });

  const set = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new EndpointError('Bad status.', { code: 'BAD_STATUS' });
    if (target.id === admin.id && input.status !== 'active') {
      throw new EndpointError('You cannot suspend yourself.', { code: 'SELF' });
    }
    set.status = input.status;
    if (input.status === 'active' && !target.approvedAt) set.approvedAt = now();
  }
  if (input.rank !== undefined) {
    if (!isRank(input.rank)) throw new EndpointError('Unknown rank.', { code: 'BAD_RANK' });
    set.rank = input.rank;
  }
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role)) throw new EndpointError('Bad role.', { code: 'BAD_ROLE' });
    if (target.id === admin.id && input.role !== 'admin') {
      throw new EndpointError('You cannot remove your own admin role.', { code: 'SELF' });
    }
    set.role = input.role;
  }
  if (input.unit !== undefined) set.unit = String(input.unit).trim().slice(0, 40) || null;

  if (!Object.keys(set).length) return target;

  const [row] = await db.update(members).set(set).where(eq(members.id, target.id)).returning().run();

  if (set.status === 'active' && target.status !== 'active') {
    await tell(target.tgId, 'Your membership was approved. Open the app to see upcoming events.');
  } else if (set.status === 'suspended' && target.status !== 'suspended') {
    await tell(target.tgId, 'Your membership has been suspended. Please contact an officer.');
  } else if (set.rank && set.rank !== target.rank) {
    await tell(target.tgId, `Your rank is now: ${set.rank.replace(/_/g, ' ')}.`);
  }
  return row;
}
