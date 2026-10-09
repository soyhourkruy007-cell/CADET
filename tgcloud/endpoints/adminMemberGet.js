import { requireAdmin } from '../lib/auth.js';
import { loadMember, publicMember } from '../lib/members.js';
import { fail } from '../lib/util.js';

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const row = await loadMember(Number(input && input.id));
  if (!row) throw fail('That member could not be found.', 'NOT_FOUND');
  return publicMember(row, { admin: true, photos: true });
}
