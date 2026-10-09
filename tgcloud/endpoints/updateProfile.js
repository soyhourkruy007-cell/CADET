import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { requireMember, cleanText } from '../lib/auth.js';
import { members } from '../schema.js';

// A member edits their own name, phone and unit. Rank/status/role are admin-only.
export default async function (input, ctx) {
  const me = await requireMember(ctx);
  const fullName = cleanText(input.fullName, 80);
  if (!fullName || fullName.length < 2) {
    throw new EndpointError('Please enter your full name.', { code: 'BAD_NAME' });
  }
  const [row] = await db.update(members)
    .set({
      fullName,
      phone: cleanText(input.phone, 30),
      unit: cleanText(input.unit, 40),
      username: ctx.initData.user.username || null,
    })
    .where(eq(members.id, me.id))
    .returning()
    .run();
  return row;
}
