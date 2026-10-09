import { api, db, BotApiError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { APP_URL, TITLE, BOOTSTRAP_ADMIN_TG_IDS } from '../lib/config.js';
import { hashPassword } from '../lib/hash.js';

async function reply(chatId, text, extra) {
  try { await api.sendMessage({ chat_id: chatId, text, ...(extra || {}) }); }
  catch (e) { if (!(e instanceof BotApiError)) throw e; }
}

export default async function (message) {
  const chatId = message.chat.id;
  if (message.chat.type !== 'private') return;          // the bot only talks in private chats
  const text = (message.text || '').trim();
  const fromId = message.from && message.from.id;

  // /myid - handy for filling BOOTSTRAP_ADMIN_TG_IDS in lib/config.js
  if (text === '/myid') {
    await reply(chatId, 'Your Telegram ID: ' + fromId);
    return;
  }

  // /setup <username> <password> - create the FIRST admin (only while there are no admins at all,
  // and only for ids listed in BOOTSTRAP_ADMIN_TG_IDS).
  if (text.startsWith('/setup')) {
    if (!BOOTSTRAP_ADMIN_TG_IDS.map(String).includes(String(fromId))) {
      await reply(chatId, 'Not allowed.');
      return;
    }
    const parts = text.split(/\s+/);
    const username = parts[1], password = parts.slice(2).join(' ');
    // remove the message that contains the password, if possible
    try { await api.deleteMessage({ chat_id: chatId, message_id: message.message_id }); } catch (e) { /* ignore */ }
    if (!username || !password || password.length < 6) {
      await reply(chatId, 'Usage: /setup <username> <password>   (password: at least 6 characters)');
      return;
    }
    const existing = await db.select().from(users).where(eq(users.isDel, false)).all();
    if (existing.length > 0) {
      await reply(chatId, 'Setup is already done - an admin account exists.');
      return;
    }
    await db.insert(users).values({ username, password: hashPassword(password), roles: 'Admin', isDel: false }).run();
    await reply(chatId, 'Admin "' + username + '" created. Open the app and sign in. Your /setup message was deleted.');
    return;
  }

  // everything else (including /start): open the Mini App
  await reply(chatId, TITLE, {
    reply_markup: { inline_keyboard: [[{ text: 'បើកកម្មវិធី CADET', web_app: { url: APP_URL } }]] },
  });
}
