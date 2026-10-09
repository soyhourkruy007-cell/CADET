import { requireAdmin } from '../lib/auth.js';
import { listActiveMembers } from '../lib/members.js';
import { parseStoredDate, daysUntil, displayDate } from '../lib/dates.js';
import { EXPIRY_WARNING_DAYS } from '../lib/config.js';
import { sendTelegram, reminderText } from '../lib/notify.js';
import { str } from '../lib/util.js';

// Remind every member who expires within the warning window and has a Telegram id on file.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const rows = await listActiveMembers();
  let sent = 0, skipped = 0;

  for (const r of rows) {
    const exp = parseStoredDate(r.expiryDate);
    if (!exp) continue;
    const d = daysUntil(exp);
    if (d < 0 || d > EXPIRY_WARNING_DAYS) continue;
    if (!str(r.telegramId)) { skipped++; continue; }
    const ok = await sendTelegram(r.telegramId, reminderText(str(r.memberName), str(r.cadetCode), displayDate(r.expiryDate)));
    if (ok) sent++; else skipped++;
  }

  let message = `Sent ${sent} expiry reminder(s).`;
  if (skipped > 0) message += ` ${skipped} skipped (no Telegram ID or send failed).`;
  return { sent, skipped, message };
}
