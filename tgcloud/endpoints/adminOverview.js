import { requireAdmin } from '../lib/auth.js';
import { listActiveMembers } from '../lib/members.js';
import { parseStoredDate, daysUntil, displayDate } from '../lib/dates.js';
import { EXPIRY_WARNING_DAYS } from '../lib/config.js';
import { str } from '../lib/util.js';

// Dashboard cards + the "Needs Attention" lists.
export default async function (input, ctx) {
  const { user } = await requireAdmin(ctx);
  const rows = await listActiveMembers();

  let expired = 0;
  const expiring = [];
  const pending = [];

  for (const r of rows) {
    const name = str(r.memberName) || '(no name)';
    const code = str(r.cadetCode);
    const exp = parseStoredDate(r.expiryDate);
    if (exp) {
      const d = daysUntil(exp);
      if (d < 0) expired++;
      else if (d <= EXPIRY_WARNING_DAYS) {
        expiring.push({ id: r.id, code, name, daysLeft: d, expiryText: displayDate(r.expiryDate) });
      }
    }
    if (str(r.statusConfirm).toLowerCase() === 'pending') {
      pending.push({ id: r.id, code, name });
    }
  }

  expiring.sort((a, b) => a.daysLeft - b.daysLeft);
  pending.sort((a, b) => a.name.localeCompare(b.name));

  return {
    username: user.username,
    total: rows.length,
    expiringCount: expiring.length,
    expiredCount: expired,
    pendingCount: pending.length,
    warningDays: EXPIRY_WARNING_DAYS,
    expiring,
    pending,
  };
}
