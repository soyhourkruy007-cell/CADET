import { tgUser, endSession } from '../lib/auth.js';

export default async function (input, ctx) {
  await endSession(tgUser(ctx).id);
  return { ok: true };
}
