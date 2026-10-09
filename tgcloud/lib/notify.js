import { api, BotApiError } from 'sdk';
import { str } from './util.js';

// Plain-text Telegram message to a member's chat. Returns true/false (never throws).
// The member must have started the bot at least once (a Telegram rule).
export async function sendTelegram(chatId, text) {
  const id = str(chatId);
  if (!id) return false;
  try {
    await api.sendMessage({ chat_id: id, text });
    return true;
  } catch (e) {
    if (!(e instanceof BotApiError)) console.error('sendTelegram failed', e);
    return false;
  }
}

export const reminderText = (name, code, expiryText) =>
  `Hello ${name}, your CADET membership (${code}) will expire on ${expiryText}. Please renew soon.`;
