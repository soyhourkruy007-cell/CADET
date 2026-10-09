import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { requireMember } from '../lib/auth.js';
import { loadMember, publicMember, normSex } from '../lib/members.js';
import { normalizeToIso } from '../lib/dates.js';
import { fail, str } from '../lib/util.js';

// "Update Information" popup. The CADET code is intentionally not editable here.
export default async function (input, ctx) {
  const { memberId } = await requireMember(ctx);
  input = input || {};
  const memberName = str(input.memberName);
  if (!memberName) throw fail('ឈ្មោះត្រូវតែបំពេញ', 'EMPTY_NAME');

  await db.update(m).set({
    title: str(input.title),
    memberName,
    sex: normSex(input.sex) || null,
    dob: normalizeToIso(input.dob),
    phone: str(input.phone),
    licenseNo: str(input.licenseNo),
  }).where(and(eq(m.id, memberId), eq(m.isDel, false))).run();

  const row = await loadMember(memberId);
  return { message: 'ធ្វើបច្ចុប្បន្នភាពព័ត៌មានបានជោគជ័យ', member: publicMember(row, { photos: true }) };
}
