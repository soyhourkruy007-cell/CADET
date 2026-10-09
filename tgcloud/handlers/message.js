import { api } from 'sdk';
import { APP_URL, APP_NAME } from '../lib/config.js';

export default async function (message) {
  const chatId = message.chat.id;

  // Only talk in private chats.
  if (message.chat.type !== 'private') return;

  await api.sendMessage({
    chat_id: chatId,
    text: `Welcome to ${APP_NAME}.\n\nOpen the app to register, see your rank and unit, and check in to events.`,
    reply_markup: {
      inline_keyboard: [[{ text: `Open ${APP_NAME}`, web_app: { url: APP_URL } }]],
    },
  });
}
