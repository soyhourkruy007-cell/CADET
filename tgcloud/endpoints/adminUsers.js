import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users, sessions } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { hashPassword } from '../lib/hash.js';
import { fail, str } from '../lib/util.js';

const MIN_PASSWORD = 6;

async function activeUsers() {
  const rows = await db.select().from(users).where(eq(users.isDel, false)).all();
  return rows.sort((a, b) => str(a.username).toUpperCase().localeCompare(str(b.username).toUpperCase()));
}
const dup = (rows, name, exceptId) => rows.some((r) => r.id !== exceptId && str(r.username).toUpperCase() === name.toUpperCase());

// action: list | add | update | delete   (every account here is an Admin, as before)
export default async function (input, ctx) {
  const { user: me } = await requireAdmin(ctx);
  input = input || {};
  const rows = await activeUsers();
  let message = '';

  if (input.action === 'add') {
    const username = str(input.username), password = String(input.password || '');
    if (!username || !password) throw fail('Please fill in all fields.', 'EMPTY');
    if (password.length < MIN_PASSWORD) throw fail(`Password must be at least ${MIN_PASSWORD} characters.`, 'WEAK');
    if (dup(rows, username, null)) throw fail('ឈ្មោះនេះមានរួចហើយ / That username already exists.', 'DUP');
    await db.insert(users).values({ username, password: hashPassword(password), roles: 'Admin', isDel: false }).run();
    message = 'User added successfully.';
  } else if (input.action === 'update') {
    const id = Number(input.id), username = str(input.username), password = String(input.password || '');
    if (!username) throw fail('Please fill in all required fields.', 'EMPTY');
    if (!rows.some((r) => r.id === id)) throw fail('That user could not be found - it may have already been removed.', 'NOT_FOUND');
    if (dup(rows, username, id)) throw fail('ឈ្មោះនេះមានរួចហើយ / That username already exists.', 'DUP');
    const set = { username };
    if (password) {
      if (password.length < MIN_PASSWORD) throw fail(`Password must be at least ${MIN_PASSWORD} characters.`, 'WEAK');
      set.password = hashPassword(password);
    }
    await db.update(users).set(set).where(eq(users.id, id)).run();
    message = 'User updated successfully.';
  } else if (input.action === 'delete') {
    const id = Number(input.id);
    if (id === me.id) throw fail('You cannot remove the account you are signed in with.', 'SELF');
    if (rows.length <= 1) throw fail('You cannot remove the last admin account.', 'LAST');
    await db.update(users).set({ isDel: true }).where(eq(users.id, id)).run();
    await db.delete(sessions).where(eq(sessions.refId, id)).run();   // (also signs that admin out)
    message = 'User removed.';
  } else if (input.action !== 'list') {
    throw fail('Unknown action', 'BAD_ACTION');
  }

  const fresh = await activeUsers();
  return { message, users: fresh.map((r, i) => ({ n: i + 1, id: r.id, username: r.username, roles: r.roles || 'Admin' })) };
}
