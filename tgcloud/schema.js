import { table, integer, text, boolean, index, sql } from 'sdk/db';

// Admin accounts (was dbo.USERS). Passwords are stored hashed ("s1$..."); legacy plain-text
// values imported from SQL Server are upgraded automatically on first successful login.
export const users = table('users', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  password: text('password').notNull(),
  roles:    text('roles').default('Admin'),
  isDel:    boolean('is_del').default(false),
});

// Members (was dbo.CADET_MEMBERS). Photos are stored as base64 JPEG text.
export const cadetMembers = table('cadet_members', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  cadetCode:         text('cadet_code'),
  title:             text('title'),
  memberName:        text('member_name'),
  dob:               text('dob'),
  sex:               text('sex'),
  phone:             text('phone'),
  paymentDate:       text('payment_date'),
  expiryDate:        text('expiry_date'),
  licenseNo:         text('license_no'),
  expireLicense:     text('expire_license'),
  paymentProofPhoto: text('payment_proof_photo'),
  licensePhoto:      text('license_photo'),
  statusConfirm:     text('status_confirm'),
  telegramId:        text('telegram_id'),
  createdAt:         integer('created_at').default(sql`(unixepoch())`),
  isDel:             boolean('is_del').default(false),
}, (t) => ({
  codeIdx: index('idx_members_code').on(t.cadetCode),
  tgIdx:   index('idx_members_tg').on(t.telegramId),
}));

// Replaces ASP.NET Session: who is logged in as what, per Telegram user.
export const sessions = table('sessions', {
  tgId:      integer('tg_id').primaryKey(),
  kind:      text('kind').notNull(),        // 'admin' | 'member'
  refId:     integer('ref_id').notNull(),   // users.id or cadet_members.id
  username:  text('username'),
  expiresAt: integer('expires_at').notNull(),
});

// Brute-force protection for the login endpoint.
export const loginAttempts = table('login_attempts', {
  tgId:        integer('tg_id').primaryKey(),
  count:       integer('count').notNull().default(0),
  windowStart: integer('window_start').notNull().default(0),
});
