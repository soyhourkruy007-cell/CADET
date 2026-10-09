import { requireAdmin } from '../lib/auth.js';
import { loadMember } from '../lib/members.js';
import { fail, str } from '../lib/util.js';
import { sendTelegram, reminderText } from '../lib/notify.js';
import { displayDate } from '../lib/dates.js';

// One member: send the expiry reminder on Telegram.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const row = await loadMember(Number(input && input.id));
  if (!row) throw fail('That member could not be found.', 'NOT_FOUND');
  if (!str(row.telegramId)) throw fail('This member has no Telegram ID on file.', 'NO_TG');

  const sent = await sendTelegram(row.telegramId, reminderText(str(row.memberName), str(row.cadetCode), displayDate(row.expiryDate)));
  return {
    sent,
    message: sent
      ? `Expiry reminder sent to ${str(row.memberName)} on Telegram.`
      : 'Could not send the Telegram reminder. The member may not have started the bot yet.',
  };
}
