import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { members } from '../schema.js';

export function now() {
  return Math.floor(Date.now() / 1000);
}

// The member row for the verified Telegram user, or null if not registered.
export async function findMember(ctx) {
  const user = ctx.initData.user;
  if (!user) throw new EndpointError('Open this app from Telegram.', { code: 'NO_USER' });
  const row = await db.select().from(members).where(eq(members.tgId, user.id)).get();
  return row || null;
}

export async function requireMember(ctx) {
  const me = await findMember(ctx);
  if (!me) throw new EndpointError('Please register first.', { code: 'NOT_REGISTERED' });
  return me;
}

export async function requireActive(ctx) {
  const me = await requireMember(ctx);
  if (me.status !== 'active') {
    throw new EndpointError('Your membership is not active.', { code: 'NOT_ACTIVE', status: me.status });
  }
  return me;
}

export async function requireAdmin(ctx) {
  const me = await requireActive(ctx);
  if (me.role !== 'admin') {
    throw new EndpointError('Admins only.', { code: 'FORBIDDEN' });
  }
  return me;
}

export function cleanText(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}
