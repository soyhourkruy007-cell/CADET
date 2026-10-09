// Central settings. Everything here is deployed with your code.
// NOTE: Telegram Serverless has no separate secrets store, so treat this file as
// private (anyone with CLI access / BotFather access to the bot can read it).

export const TITLE = 'សមាគមបច្ចេកវិទ្យា ទឹកនោមផ្អែម និងក្រពេញកម្ពុជា';

// The Mini App address printed by `npx tgcloud push`. Used for the /start button.
export const APP_URL = 'https://app8903818641.tgcloud.ai/';

// OCR.space API key (free tier is fine). Paste a NEW key here (the old one was shared publicly).
// Leave empty to disable OCR - uploads that need OCR will then be refused with a clear message.
export const OCR_SPACE_API_KEY = '';

export const EXPIRY_WARNING_DAYS = 30;        // "expiring soon" window
export const MEMBERSHIP_VALIDITY_DAYS = 365;  // payment date + 365 days = expiry
export const CADET_PREFIX = 'CADET-';
export const SESSION_HOURS = 12;              // how long a login lasts
export const MAX_IMAGE_B64_CHARS = 1400000;   // ~1 MB image after client-side compression
export const CAMBODIA_UTC_OFFSET_HOURS = 7;

// Login throttling (per Telegram user)
export const MAX_LOGIN_ATTEMPTS = 8;
export const LOGIN_WINDOW_SECONDS = 600;

// One-time setup: Telegram user ids allowed to run `/setup <username> <password>` in the bot
// chat to create the FIRST admin, but only while there are no admin users at all.
// (Not needed if you import your existing users.) Find your id with @userinfobot.
export const BOOTSTRAP_ADMIN_TG_IDS = [];
