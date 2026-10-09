import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireMember } from '../lib/auth.js';
import { loadMember, publicMember } from '../lib/members.js';
import { cleanImage, fail } from '../lib/util.js';
import { ocrSpace } from '../lib/ocr.js';
import { looksLikeTransactionReceipt } from '../lib/ocr-text.js';

// Member submits a payment-proof photo. It must look like a bank receipt (OCR check);
// it is then stored and the payment is flagged "Pending" for an admin to confirm.
export default async function (input, ctx) {
  const { memberId } = await requireMember(ctx);
  const image = cleanImage(input && input.image);

  const ocr = await ocrSpace(image);
  if (!ocr.configured) throw fail('OCR មិនទាន់ត្រូវបានកំណត់នៅលើម៉ាស៊ីនបម្រើ សូមទាក់ទងអ្នកគ្រប់គ្រង។ (OCR is not configured)', 'NO_OCR');
  if (!looksLikeTransactionReceipt(ocr.text)) {
    throw fail('រូបភាពនេះមើលទៅមិនដូចជាវិក្កយបត្រប្រតិបត្តិការទេ សូមប្រាកដថាបានឆាប់យករូបថតវិក្កយបត្របង់ប្រាក់ពេញលេញ ហើយសាកល្បងម្តងទៀត។', 'NOT_RECEIPT');
  }

  await db.update(m)
    .set({ paymentProofPhoto: image, statusConfirm: 'Pending', expiryDate: null })
    .where(and(eq(m.id, memberId), eq(m.isDel, false))).run();

  const row = await loadMember(memberId);
  return { message: 'បានផ្ទុករូបភាពជោគជ័យ។ កំពុងរង់ចាំការបញ្ជាក់។', member: publicMember(row, { photos: true }) };
}
