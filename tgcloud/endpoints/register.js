import { db, EndpointError } from 'sdk';
import { findMember, cleanText, now } from '../lib/auth.js';
import { tellAdmins } from '../lib/notify.js';
import { members } from '../schema.js';

export default async function (input, ctx) {
  const user = ctx.initData.user;
  const existing = await findMember(ctx);
  if (existing) return existing;

  const fullName = cleanText(input.fullName, 80);
  if (!fullName || fullName.length < 2) {
    throw new EndpointError('Please enter your full name.', { code: 'BAD_NAME' });
  }
  const phone = cleanText(input.phone, 30);
  const unit = cleanText(input.unit, 40);

  // The very first person to register becomes the active admin.
  const total = await db.$count(members);
  const first = total === 0;

  const [row] = await db.insert(members).values({
    tgId: user.id,
    username: user.username || null,
    fullName,
    phone,
    unit,
    role: first ? 'admin' : 'member',
    status: first ? 'active' : 'pending',
    approvedAt: first ? now() : null,
  }).returning().run();

  if (!first) {
    await tellAdmins(`New cadet waiting for approval: ${fullName}${unit ? ' (' + unit + ')' : ''}. Open the app > Members.`);
  }
  return row;
}
