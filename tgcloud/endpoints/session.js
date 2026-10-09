import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers, users } from '../schema.js';
import { tgUser, getSession } from '../lib/auth.js';
import { TITLE } from '../lib/config.js';

// Called when the Mini App opens: who is signed in, and can this Telegram account sign in directly?
export default async function (input, ctx) {
  const u = tgUser(ctx);
  const out = { role: null, username: '', canTelegramLogin: false, title: TITLE, firstName: u.first_name || '' };

  const s = await getSession(u.id);
  if (s && s.kind === 'admin') {
    const row = await db.select().from(users).where(and(eq(users.id, s.refId), eq(users.isDel, false))).get();
    if (row) { out.role = 'admin'; out.username = row.username; return out; }
  } else if (s && s.kind === 'member') {
    const row = await db.select({ id: cadetMembers.id, telegramId: cadetMembers.telegramId })
      .from(cadetMembers).where(and(eq(cadetMembers.id, s.refId), eq(cadetMembers.isDel, false))).get();
    const linked = row && row.telegramId ? String(row.telegramId).trim() : '';
    if (row && (!linked || linked === String(u.id))) { out.role = 'member'; return out; }
  }

  const linkedMember = await db.select({ id: cadetMembers.id }).from(cadetMembers)
    .where(and(eq(cadetMembers.telegramId, String(u.id)), eq(cadetMembers.isDel, false))).get();
  out.canTelegramLogin = !!linkedMember;
  return out;
}
