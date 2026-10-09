import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { loadMember, publicMember } from '../lib/members.js';
import { cleanImage, fail } from '../lib/util.js';
import { ocrSpace } from '../lib/ocr.js';
import { looksLikeTransactionReceipt, extractTransactionDate, validateLicenseOcr } from '../lib/ocr-text.js';
import { addDays, toIso, formatEnglish } from '../lib/dates.js';
import { MEMBERSHIP_VALIDITY_DAYS } from '../lib/config.js';

// kind: 'payment' | 'license'. Same OCR rules as the member screens.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  input = input || {};
  const id = Number(input.id);
  if (!(await loadMember(id))) throw fail('That member could not be found.', 'NOT_FOUND');
  const image = cleanImage(input.image);
  const where = and(eq(m.id, id), eq(m.isDel, false));
  let message;

  if (input.kind === 'payment') {
    await db.update(m).set({ paymentProofPhoto: image }).where(where).run();
    const ocr = await ocrSpace(image);
    const date = ocr.configured && looksLikeTransactionReceipt(ocr.text) ? extractTransactionDate(ocr.text) : null;
    if (!ocr.configured) {
      message = 'Photo saved (OCR is not configured) - please set the expiry date manually.';
    } else if (!looksLikeTransactionReceipt(ocr.text)) {
      message = "Photo saved, but it doesn't look like a payment receipt - please set the expiry date manually if needed.";
    } else if (!date) {
      message = 'Photo saved, but no transaction date could be detected - please set the expiry date manually.';
    } else {
      const expiry = addDays(date, MEMBERSHIP_VALIDITY_DAYS);
      await db.update(m).set({ paymentDate: toIso(date), expiryDate: toIso(expiry) }).where(where).run();
      message = `Payment proof saved. Detected transaction date ${formatEnglish(date)} - expiry set to ${formatEnglish(expiry)}.`;
    }
  } else if (input.kind === 'license') {
    const ocr = await ocrSpace(image);
    if (!ocr.configured) throw fail('OCR is not configured (see lib/config.js).', 'NO_OCR');
    const check = validateLicenseOcr(ocr.text);
    if (!check.ok) throw fail(check.error, 'BAD_LICENSE');
    await db.update(m).set({ licensePhoto: image, expireLicense: toIso(check.expiry) }).where(where).run();
    message = `License photo saved (expires ${formatEnglish(check.expiry)}).`;
  } else {
    throw fail('Unknown photo type', 'BAD_KIND');
  }

  return { message, member: publicMember(await loadMember(id), { admin: true, photos: true }) };
}
