# TelegramServerLess (CADET Members)

The CADET ASP.NET WebForms / SQL Server app, rebuilt for **Telegram Serverless**
(<https://core.telegram.org/bots/serverless>): a static Mini App + JavaScript endpoints + the built-in SQLite database. No server, no IIS, no SQL Server.

```
public/            Mini App front-end (index.html, app.css, app.js, images, import.html)
tgcloud/
  schema.js        tables: users, cadet_members, sessions, login_attempts
  handlers/message.js   bot: /start (opens the app), /myid, /setup
  endpoints/       everything the Mini App calls (login, member*, admin*)
  lib/             config, auth/sessions, hashing, dates, OCR rules, Telegram notify
migration/export-sqlserver.mjs   exports the old data to JSON
test/pure-libs.test.mjs          unit tests for hashing / dates / OCR rules (npm test)
```

## 1. Configure (`tgcloud/lib/config.js`)
- `OCR_SPACE_API_KEY` - paste a **new** OCR.space key (the old one was exposed). Without it, photo uploads that need OCR are refused.
- `BOOTSTRAP_ADMIN_TG_IDS` - your Telegram id (send `/myid` to the bot to see it), so you can run `/setup` and the data import.
- `APP_URL` - already `https://app8903818641.tgcloud.ai/`; check it matches what `push` prints.

## 2. Deploy
In @BotFather: your bot -> **Serverless** -> turn on. Then:

```bash
npm install
npx tgcloud login      # CLI access token (app<id>:<secret>) - NEVER paste it in chats
npx tgcloud push       # code + Mini App files
npx tgcloud migrate    # creates the tables
```
Set the Mini App URL printed by `push` in @BotFather (Menu Button / Main App), or just use the **/start** button.

## 3. First admin
Either:
- `/setup <username> <password>` in a private chat with the bot (only works for ids in `BOOTSTRAP_ADMIN_TG_IDS`, only while no admin exists; the message is deleted), **or**
- import your old users (step 4) - plain-text passwords are hashed during import.

## 4. Import the old data (optional)
```bash
npm install --no-save mssql
MSSQL_CONN="Server=...;Database=...;User Id=...;Password=...;Encrypt=true;TrustServerCertificate=true" \
  node migration/export-sqlserver.mjs          # -> migration/export/*.json
```
Open `https://app8903818641.tgcloud.ai/import.html` **inside Telegram** (e.g. via a bot button / BotFather menu), pick the two files, press Import.
Afterwards **delete `public/import.html` and `tgcloud/endpoints/adminImport.js`** and push again.
Dates are imported as they are (Khmer text or ISO); the app reads both.

## Behaviour changes vs. the old app (deliberate)
| Old | New |
|---|---|
| Plain-text passwords; hidden default admin re-created at every login-page load | Salted SHA-256 hashes; **no default admin**; min. 6 characters; cannot delete yourself / the last admin |
| Telegram id taken from a hidden form field (spoofable) | Verified by the platform (`ctx.initData`); a Telegram account can only be linked to one member |
| ASP.NET Session | `sessions` table per Telegram user (12 h) |
| No limit on login guesses | 8 failures / 10 min per Telegram user |
| Photos stored as VARBINARY, quality check + compression on server | Photos compressed to JPEG in the browser, stored as base64 text; same blank/blur checks, same OCR rules |
| Mixed date formats written to DB | New dates written as ISO (`yyyy-MM-dd`), displayed in Khmer; old values still read |
| Khmer calendar widget | Native date picker |
| "Members" list labelled "expiring (60 days)" but unfiltered | Shows all members, soonest expiry first, with search (name / phone / code) |

Unchanged on purpose: members still sign in with their CADET code only (see warning below), payment date + 365 days = expiry, the 30-day warning window, Khmer messages to members on Telegram, OCR receipt/license rules.

## Things to know
- **Member login by code only is weak** - codes are sequential (`CADET-12`), so anyone who guesses an unlinked code can claim it. Once a Telegram account is linked, only that account can open the member. Consider asking for date of birth or phone as a second factor.
- Telegram Serverless has no secrets store: `config.js` (OCR key) is visible to people with access to the bot's Serverless settings.
- Reminders are sent only when you press the button (no scheduler is available).
- A member must have pressed **Start** in the bot once before the bot can message them.
- Tested locally (`npm test` + an in-memory SQLite harness, 103 endpoint checks + 16 UI checks); **not yet run on the live platform** - use `npx tgcloud run endpoints/session '{}' --ctx '{ initData: { user: { id: 1 } } }'` for a first smoke test.
