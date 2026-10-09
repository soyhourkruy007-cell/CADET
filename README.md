# Cadet Member

A Telegram Mini App for running a cadet unit, built on [Telegram Serverless](https://core.telegram.org/bots/serverless). No server to host: the bot, endpoints, database and front-end all live on Telegram's infrastructure.

## What it does

- **Register**: a cadet opens the app from the bot and submits name, unit and phone.
- **Approve**: admins see pending cadets, approve or suspend them, set rank and promote other admins. Cadets get a bot message when approved or promoted.
- **Events**: admins create drills and meetings; active cadets check in (opens 1 hour before the start, closes at the end); admins see attendance.
- The **first person to register becomes the admin**, so register yourself first.

## Layout

```
tgcloud/
  schema.js            members, events, attendance tables
  handlers/message.js  /start (any private message) -> "Open Cadet Member" button
  endpoints/           getMe, register, updateProfile, listMembers, reviewMember,
                       listEvents, createEvent, deleteEvent, checkIn, listAttendance
  lib/                 auth guards, ranks, notifications, config
app/                   Mini App front-end (plain HTML/CSS/JS, no build step)
tgcloud.jsonc          hosts ./app as the Mini App
```

## Deploy

1. In [@BotFather](https://t.me/BotFather): open your bot, then **Serverless** and switch it on. Copy the **CLI Access token**.
2. Install and log in:
   ```bash
   npm install
   npx tgcloud login      # paste the app<id>:<secret> token
   ```
3. Deploy code and front-end, then create the tables:
   ```bash
   npx tgcloud push       # prints your app address: https://app<id>.tgcloud.ai/
   npx tgcloud migrate    # confirm the safe changes
   ```
4. Put that address in `tgcloud/lib/config.js` (`APP_URL`), then `npx tgcloud push` again.
5. In BotFather set it as the bot's **Menu Button** / Mini App URL so cadets can open it from the chat.
6. Open the bot, send `/start`, tap the button, and register. You are the admin.

## Test an endpoint without deploying

```bash
npx tgcloud run endpoints/getMe '{}' --ctx '{ initData: { user: { id: 1, first_name: "Ann" } } }'
```

## Customising

- Ranks: edit `tgcloud/lib/ranks.js`.
- Check-in window: `EARLY_SEC` in `endpoints/checkIn.js` and `endpoints/listEvents.js`.
- Removing a table or column later: mark it `.deprecated('reason')` in `schema.js`, then `npx tgcloud migrate` (see the Serverless docs).

## Notes

- The database has no foreign keys by design; `deleteEvent` removes attendance rows before the event.
- `telegram-web-app.js` is loaded from telegram.org and provides `Telegram.WebApp.Serverless.call`.
