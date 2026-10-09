import { api, db } from 'sdk';
import { and, eq } from 'sdk/db';
import { members } from '../schema.js';

// Send a message, never throwing (a user may have blocked the bot).
export async function tell(chatId, text) {
  try {
    await api.sendMessage({ chat_id: chatId, text });
  } catch (e) {
    console.warn('notify failed', chatId, e && e.description ? e.description : e);
  }
}

export async function tellAdmins(text) {
  const admins = await db.select().from(members)
    .where(and(eq(members.role, 'admin'), eq(members.status, 'active')))
    .all();
  for (const a of admins) await tell(a.tgId, text);
}
