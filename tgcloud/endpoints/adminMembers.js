import { requireAdmin } from '../lib/auth.js';
import { listActiveMembers, publicMember, sortByExpiry } from '../lib/members.js';
import { str } from '../lib/util.js';

// Members list with search (name or phone), soonest expiry first.
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const q = str(input && input.search).toUpperCase();
  let rows = await listActiveMembers();
  if (q) {
    rows = rows.filter((r) => str(r.memberName).toUpperCase().includes(q) || str(r.phone).toUpperCase().includes(q) || str(r.cadetCode).toUpperCase().includes(q));
  }
  rows = sortByExpiry(rows);
  const total = rows.length;
  return { total, members: rows.slice(0, 1000).map((r) => publicMember(r, { admin: true })) };
}
