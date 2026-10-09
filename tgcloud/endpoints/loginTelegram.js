import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers } from '../schema.js';
import { tgUser, startSession } from '../lib/auth.js';
import { fail } from '../lib/util.js';

// "Login with Telegram": works only if this Telegram account is already linked to a member.
export default async function (input, ctx) {
  const u = tgUser(ctx);
  const row = await db.select({ id: cadetMembers.id }).from(cadetMembers)
    .where(and(eq(cadetMembers.telegramId, String(u.id)), eq(cadetMembers.isDel, false))).get();
  if (!row) {
    throw fail('គណនី Telegram នេះមិនទាន់ភ្ជាប់ជាមួយសមាជិកទេ សូមចូលដោយប្រើឈ្មោះ ឬលេខកូដជាមុនសិន', 'NOT_LINKED');
  }
  await startSession(u.id, 'member', row.id, null);
  return { role: 'member' };
}
