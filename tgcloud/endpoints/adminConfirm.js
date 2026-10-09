import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { loadMember } from '../lib/members.js';
import { fail, str } from '../lib/util.js';
import { ocrSpace } from '../lib/ocr.js';
import { looksLikeTransactionReceipt, extractTransactionDate } from '../lib/ocr-text.js';
import { addDays, toIso, toKhmerDate, parseStoredDate } from '../lib/dates.js';
import { MEMBERSHIP_VALIDITY_DAYS } from '../lib/config.js';
import { sendTelegram } from '../lib/notify.js';

// Confirm a membership payment.
//   - without paymentDate: read the date off the stored receipt photo (OCR). If it can't be read,
//     answers { needsManual: true, photo } so the app opens the "Manual Confirm" popup.
//   - with paymentDate: confirm with that date.
// Expiry = payment date + 365 days; the member is told on Telegram if they are linked.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  input = input || {};
  const id = Number(input.id);
  const row = await loadMember(id);
  if (!row) throw fail('That member could not be found.', 'NOT_FOUND');

  let payment = null;
  if (str(input.paymentDate)) {
    payment = parseStoredDate(input.paymentDate);
    if (!payment) throw fail('សូមជ្រើសរើសថ្ងៃបង់ប្រាក់ឱ្យបានត្រឹមត្រូវ។', 'BAD_DATE');
  } else {
    const proof = row.paymentProofPhoto;
    if (!proof) throw fail('មិនទាន់មានភស្តុតាងបង់ប្រាក់ទេ សូមផ្ទុករូបភាពមុននឹងបញ្ជាក់សមាជិកភាព។', 'NO_PROOF');
    const ocr = await ocrSpace(proof);
    if (ocr.configured && looksLikeTransactionReceipt(ocr.text)) payment = extractTransactionDate(ocr.text);
    if (!payment) return { needsManual: true, photo: proof };
  }

  const expiry = addDays(payment, MEMBERSHIP_VALIDITY_DAYS);
  await db.update(m)
    .set({ paymentDate: toIso(payment), expiryDate: toIso(expiry), statusConfirm: 'Confirmed' })
    .where(and(eq(m.id, id), eq(m.isDel, false))).run();

  const tg = str(row.telegramId);
  let notified = false;
  if (tg) {
    const text = `សួស្តី ${str(row.memberName)}, សមាជិកភាព CADET របស់អ្នក (${str(row.cadetCode)}) ត្រូវបានបញ្ជាក់ហើយ។ សូមអរគុណ!\n` +
      `ថ្ងៃបង់ប្រាក់៖ ${toKhmerDate(payment)}\nថ្ងៃផុតកំណត់៖ ${toKhmerDate(expiry)}`;
    notified = await sendTelegram(tg, text);
  }

  let message;
  if (!tg) message = 'Membership confirmed. Payment/expiry set. No Telegram ID on file, so no notification was sent.';
  else if (notified) message = 'Membership confirmed and the member was notified on Telegram with the payment/expiry dates.';
  else message = 'Membership confirmed, but the Telegram notification could not be sent.';
  return { message, notified };
}
