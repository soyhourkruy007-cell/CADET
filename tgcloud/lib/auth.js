import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { sessions, users, cadetMembers, loginAttempts } from '../schema.js';
import { SESSION_HOURS, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS } from './config.js';
import { nowSec } from './util.js';

const deny = (msg, code) => new EndpointError(msg, { code });

// The platform has already verified Telegram's init data, so this id cannot be spoofed.
export function tgUser(ctx) {
  const u = ctx && ctx.initData && ctx.initData.user;
  if (!u || !u.id) throw deny('សូមបើកកម្មវិធីនេះក្នុង Telegram', 'NO_TELEGRAM');
  return u;
}

export async function getSession(tgId) {
  const s = await db.select().from(sessions).where(eq(sessions.tgId, tgId)).get();
  if (!s) return null;
  if (s.expiresAt <= nowSec()) {
    await db.delete(sessions).where(eq(sessions.tgId, tgId)).run();
    return null;
  }
  return s;
}

export async function startSession(tgId, kind, refId, username) {
  const expiresAt = nowSec() + SESSION_HOURS * 3600;
  await db.insert(sessions)
    .values({ tgId, kind, refId, username: username || null, expiresAt })
    .onConflictDoUpdate({ target: sessions.tgId, set: { kind, refId, username: username || null, expiresAt } })
    .run();
}

export async function endSession(tgId) {
  await db.delete(sessions).where(eq(sessions.tgId, tgId)).run();
}

export async function requireAdmin(ctx) {
  const u = tgUser(ctx);
  const s = await getSession(u.id);
  if (!s || s.kind !== 'admin') throw deny('សូមចូលប្រើប្រាស់ម្តងទៀត', 'UNAUTHENTICATED');
  const row = await db.select().from(users).where(and(eq(users.id, s.refId), eq(users.isDel, false))).get();
  if (!row) {
    await endSession(u.id);
    throw deny('សូមចូលប្រើប្រាស់ម្តងទៀត', 'UNAUTHENTICATED');
  }
  return { tgId: u.id, user: row };
}

// Returns the member id for the logged-in member; also enforces the "Telegram must match" rule.
export async function requireMember(ctx) {
  const u = tgUser(ctx);
  const s = await getSession(u.id);
  if (!s || s.kind !== 'member') throw deny('សូមចូលប្រើប្រាស់ម្តងទៀត', 'UNAUTHENTICATED');
  const row = await db.select({ id: cadetMembers.id, telegramId: cadetMembers.telegramId })
    .from(cadetMembers).where(and(eq(cadetMembers.id, s.refId), eq(cadetMembers.isDel, false))).get();
  if (!row) {
    await endSession(u.id);
    throw deny('រកមិនឃើញ', 'UNAUTHENTICATED');
  }
  const linked = row.telegramId == null ? '' : String(row.telegramId).trim();
  if (linked && linked !== String(u.id)) {
    await endSession(u.id);
    throw deny('Telegram របស់អ្នកខុសពី Telegram ភ្ជាប់ជាមួយគណនី CADET ។', 'TG_MISMATCH');
  }
  return { tgId: u.id, memberId: row.id };
}

// ---- login throttling -------------------------------------------------------------------

export async function assertNotThrottled(tgId) {
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.tgId, tgId)).get();
  if (row && nowSec() - row.windowStart <= LOGIN_WINDOW_SECONDS && row.count >= MAX_LOGIN_ATTEMPTS) {
    throw deny('ព្យាយាមចូលច្រើនដងពេក សូមរង់ចាំប្រហែល ១០ នាទី រួចសាកល្បងម្តងទៀត។', 'TOO_MANY');
  }
}

export async function recordLoginFailure(tgId) {
  const now = nowSec();
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.tgId, tgId)).get();
  const fresh = !row || now - row.windowStart > LOGIN_WINDOW_SECONDS;
  const count = fresh ? 1 : row.count + 1;
  const windowStart = fresh ? now : row.windowStart;
  await db.insert(loginAttempts)
    .values({ tgId, count, windowStart })
    .onConflictDoUpdate({ target: loginAttempts.tgId, set: { count, windowStart } })
    .run();
}

export async function clearLoginFailures(tgId) {
  await db.delete(loginAttempts).where(eq(loginAttempts.tgId, tgId)).run();
}
