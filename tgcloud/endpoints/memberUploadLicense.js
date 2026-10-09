import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireMember } from '../lib/auth.js';
import { loadMember, publicMember } from '../lib/members.js';
import { cleanImage, fail } from '../lib/util.js';
import { ocrSpace } from '../lib/ocr.js';
import { validateLicenseOcr } from '../lib/ocr-text.js';
import { toIso, toKhmerDate } from '../lib/dates.js';

// Member uploads a license photo: OCR must find a registration number and an expiry date in the future.
export default async function (input, ctx) {
  const { memberId } = await requireMember(ctx);
  const image = cleanImage(input && input.image);

  const ocr = await ocrSpace(image);
  if (!ocr.configured) throw fail('OCR មិនទាន់ត្រូវបានកំណត់នៅលើម៉ាស៊ីនបម្រើ សូមទាក់ទងអ្នកគ្រប់គ្រង។ (OCR is not configured)', 'NO_OCR');
  const check = validateLicenseOcr(ocr.text);
  if (!check.ok) throw fail(check.error, 'BAD_LICENSE');

  await db.update(m)
    .set({ licensePhoto: image, expireLicense: toIso(check.expiry) })
    .where(and(eq(m.id, memberId), eq(m.isDel, false))).run();

  const row = await loadMember(memberId);
  return {
    message: 'បានផ្ទុករូបភាពអាជ្ញាប័ណ្ណដោយជោគជ័យ។ សុពលភាពដល់ ' + toKhmerDate(check.expiry),
    member: publicMember(row, { photos: true }),
  };
}
