import { db } from 'sdk';
import { users, cadetMembers } from '../schema.js';
import { getSession, tgUser } from '../lib/auth.js';
import { hashPassword } from '../lib/hash.js';
import { fail, str } from '../lib/util.js';
import { BOOTSTRAP_ADMIN_TG_IDS } from '../lib/config.js';
import { normalizeToIso } from '../lib/dates.js';
import { normSex } from '../lib/members.js';

// One-time data import from the old SQL Server database (see migration/ and public/import.html).
// Allowed for a signed-in admin OR a Telegram id listed in BOOTSTRAP_ADMIN_TG_IDS.
// Rows are upserted by id, so running it twice is safe.
export default async function (input, ctx) {
  const u = tgUser(ctx);
  const s = await getSession(u.id);
  const allowed = (s && s.kind === 'admin') || BOOTSTRAP_ADMIN_TG_IDS.map(String).includes(String(u.id));
  if (!allowed) throw fail('Not allowed.', 'FORBIDDEN');

  input = input || {};
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length > 200) throw fail('Too many rows in one request (max 200).', 'TOO_MANY');
  let count = 0;

  if (input.table === 'users') {
    for (const r of rows) {
      const id = Number(r.id), username = str(r.username);
      if (!id || !username) continue;
      const raw = r.password == null ? '' : String(r.password);
      const password = raw.startsWith('s1$') ? raw : hashPassword(raw);
      const set = { username, password, roles: str(r.roles) || 'Admin', isDel: !!r.isDel };
      await db.insert(users).values({ id, ...set }).onConflictDoUpdate({ target: users.id, set }).run();
      count++;
    }
  } else if (input.table === 'members') {
    for (const r of rows) {
      const id = Number(r.id);
      if (!id) continue;
      const nz = (v) => (v == null || str(v) === '' ? null : str(v));
      const set = {
        cadetCode: nz(r.cadetCode), title: nz(r.title), memberName: nz(r.memberName),
        dob: nz(r.dob), sex: normSex(r.sex) || nz(r.sex), phone: nz(r.phone),
        paymentDate: nz(r.paymentDate), expiryDate: nz(r.expiryDate),
        licenseNo: nz(r.licenseNo), expireLicense: nz(r.expireLicense),
        paymentProofPhoto: nz(r.paymentProofPhoto), licensePhoto: nz(r.licensePhoto),
        statusConfirm: nz(r.statusConfirm), telegramId: nz(r.telegramId),
        isDel: !!r.isDel,
      };
      // Dates are kept as they were (Khmer or ISO text); the app reads both formats.
      await db.insert(cadetMembers).values({ id, ...set }).onConflictDoUpdate({ target: cadetMembers.id, set }).run();
      count++;
    }
  } else {
    throw fail('Unknown table', 'BAD_TABLE');
  }
  return { imported: count };
}
