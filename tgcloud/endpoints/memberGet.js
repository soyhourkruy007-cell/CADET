import { loadMember, publicMember } from '../lib/members.js';
import { requireMember } from '../lib/auth.js';
import { fail } from '../lib/util.js';

export default async function (input, ctx) {
  const { memberId } = await requireMember(ctx);
  const row = await loadMember(memberId);
  if (!row) throw fail('រកមិនឃើញ', 'NOT_FOUND');
  return publicMember(row, { photos: true });
}
