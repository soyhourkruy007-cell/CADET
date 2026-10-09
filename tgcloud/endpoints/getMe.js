import { findMember } from '../lib/auth.js';
import { RANKS } from '../lib/ranks.js';

// Returns the caller's member record (or registered:false) plus the rank ladder.
export default async function (input, ctx) {
  const me = await findMember(ctx);
  const user = ctx.initData.user;
  return {
    registered: !!me,
    member: me,
    ranks: RANKS,
    tgUser: { id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username },
  };
}
