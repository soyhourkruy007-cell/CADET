import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireMember } from '../lib/auth.js';
import { loadMember, publicMember } from '../lib/members.js';
import { fail, str } from '../lib/util.js';

// action: 'connect' | 'disconnect'. The Telegram id is the verified one from the platform.
export default async function (input, ctx) {
  const { tgId, memberId } = await requireMember(ctx);
  const action = input && input.action;
  const current = await loadMember(memberId);
  const stored = str(current.telegramId);
  let message;

  if (action === 'connect') {
    if (stored) throw fail('Telegram ត្រូវបានភ្ជាប់រួចហើយ', 'ALREADY');
    const others = await db.select({ id: m.id }).from(m)
      .where(and(eq(m.telegramId, String(tgId)), eq(m.isDel, false))).all();
    if (others.some((r) => r.id !== memberId)) {
      throw fail('Telegram នេះត្រូវបានភ្ជាប់ជាមួយសមាជិកផ្សេងរួចហើយ', 'TAKEN');
    }
    await db.update(m).set({ telegramId: String(tgId) }).where(eq(m.id, memberId)).run();
    message = 'Telegram connected successfully.';
  } else if (action === 'disconnect') {
    if (!stored) throw fail('Telegram មិនត្រូវបានភ្ជាប់', 'NOT_LINKED');
    if (stored !== String(tgId)) throw fail('អ្នកមិនអាចប្រើ Telegram ដើម្បីផ្ដាច់បានទេ ។', 'TG_MISMATCH');
    await db.update(m).set({ telegramId: null }).where(eq(m.id, memberId)).run();
    message = 'Telegram disconnected បានជោគជ័យ';
  } else {
    throw fail('Unknown action', 'BAD_ACTION');
  }

  const row = await loadMember(memberId);
  return { message, member: publicMember(row, { photos: true }) };
}
