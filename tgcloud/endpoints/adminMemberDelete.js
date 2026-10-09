import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m, sessions } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

// Soft delete (IsDel = 1), like before. Also signs the member out.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const id = Number(input && input.id);
  await db.update(m).set({ isDel: true }).where(eq(m.id, id)).run();
  await db.delete(sessions).where(and(eq(sessions.kind, 'member'), eq(sessions.refId, id))).run();
  return { message: 'Member removed.' };
}
