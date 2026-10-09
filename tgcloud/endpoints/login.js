import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers, users } from '../schema.js';
import { tgUser, startSession, assertNotThrottled, recordLoginFailure, clearLoginFailures } from '../lib/auth.js';
import { verifyPassword, hashPassword } from '../lib/hash.js';
import { fail, str } from '../lib/util.js';

// "Username or CADET-CODE" + password. An admin username takes priority; otherwise the text is
// treated as a member's CADET code (members sign in with the code only, as before).
export default async function (input, ctx) {
  const u = tgUser(ctx);
  input = input || {};
  const entered = str(input.username);
  const password = str(input.password);

  await assertNotThrottled(u.id);

  if (!entered) throw fail('សូមបំពេញឈ្មោះដើម្បីចូលប្រើប្រាស់', 'EMPTY');
  const upper = entered.toUpperCase();

  // 1) admin account?
  const admins = await db.select().from(users).where(eq(users.isDel, false)).all();
  const admin = admins.find((a) => str(a.username).toUpperCase() === upper);
  if (admin) {
    const check = verifyPassword(admin.password, password);
    if (!check.ok) {
      await recordLoginFailure(u.id);
      throw fail('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ', 'BAD_PASSWORD');
    }
    if (check.needsUpgrade) {
      await db.update(users).set({ password: hashPassword(password) }).where(eq(users.id, admin.id)).run();
    }
    await clearLoginFailures(u.id);
    await startSession(u.id, 'admin', admin.id, admin.username);
    return { role: 'admin' };
  }

  // 2) member CADET code
  const members = await db.select({ id: cadetMembers.id, code: cadetMembers.cadetCode, telegramId: cadetMembers.telegramId })
    .from(cadetMembers).where(eq(cadetMembers.isDel, false)).all();
  const member = members.find((r) => str(r.code).toUpperCase() === upper);
  if (!member) {
    await recordLoginFailure(u.id);
    throw fail('ឈ្មោះរបស់អ្នកមិនមានក្នុងប្រព័ន្ធ', 'NOT_FOUND');
  }

  const linked = str(member.telegramId);
  if (linked && linked !== String(u.id)) {
    await recordLoginFailure(u.id);
    throw fail('Telegram របស់អ្នកខុសពី Telegram ភ្ជាប់ជាមួយគណនី CADET ។', 'TG_MISMATCH');
  }

  // Not linked yet: link this Telegram account right away (unless it is already on another member).
  if (!linked) {
    const taken = members.some((r) => r.id !== member.id && str(r.telegramId) === String(u.id));
    if (!taken) {
      await db.update(cadetMembers).set({ telegramId: String(u.id) }).where(eq(cadetMembers.id, member.id)).run();
    }
  }

  await clearLoginFailures(u.id);
  await startSession(u.id, 'member', member.id, null);
  return { role: 'member' };
}
