import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { loadMember, publicMember, normSex, nextCadetCode, codeInUse } from '../lib/members.js';
import { normalizeToIso } from '../lib/dates.js';
import { fail, str, firstRow } from '../lib/util.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const orNull = (v) => (str(v) === '' ? null : str(v));

// Add (no id) or edit (id) a member. New members start "Pending" with no expiry date; the code is
// generated unless one is supplied.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  input = input || {};
  const id = input.id ? Number(input.id) : null;
  const memberName = str(input.memberName);
  if (!memberName) throw fail("សូមបំពេញឈ្មោះសមាជិក / Please enter the member's name.", 'EMPTY_NAME');

  const values = {
    title: orNull(input.title),
    memberName,
    dob: normalizeToIso(input.dob),
    sex: normSex(input.sex) || null,
    phone: orNull(input.phone),
  };
  if (has(input, 'licenseNo')) values.licenseNo = orNull(input.licenseNo);
  if (has(input, 'paymentDate')) values.paymentDate = normalizeToIso(input.paymentDate);
  if (has(input, 'expiryDate')) values.expiryDate = normalizeToIso(input.expiryDate);
  if (has(input, 'expireLicense')) values.expireLicense = normalizeToIso(input.expireLicense);

  if (id) {
    const existing = await loadMember(id);
    if (!existing) throw fail('That member could not be found.', 'NOT_FOUND');
    const code = str(input.cadetCode);
    if (code && code !== str(existing.cadetCode)) {
      if (await codeInUse(code, id)) throw fail('អត្តលេខនេះមានរួចហើយ / That code already exists.', 'DUP_CODE');
      values.cadetCode = code;
    }
    await db.update(m).set(values).where(and(eq(m.id, id), eq(m.isDel, false))).run();
    return { message: 'Member updated successfully.', member: publicMember(await loadMember(id), { admin: true, photos: true }) };
  }

  let code = str(input.cadetCode);
  if (code) {
    if (await codeInUse(code, null)) throw fail('អត្តលេខនេះមានរួចហើយ / That code already exists.', 'DUP_CODE');
  } else {
    code = await nextCadetCode();
  }
  const res = await db.insert(m).values({ ...values, cadetCode: code, statusConfirm: 'Pending', expiryDate: values.expiryDate || null, isDel: false }).returning().run();
  const created = firstRow(res);
  const newId = created ? created.id : res && res.lastInsertRowid;
  return {
    message: `Member added (code ${code}). You can now attach a payment proof / license photo.`,
    member: publicMember(await loadMember(Number(newId)), { admin: true, photos: true }),
    created: true,
  };
}
