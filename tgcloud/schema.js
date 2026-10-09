import { table, integer, text, uniqueIndex, index, sql } from 'sdk/db';

// Cadet members. One row per Telegram user who registered in the Mini App.
// status: 'pending' (waiting for approval) | 'active' | 'suspended'
// role:   'member' | 'admin'
export const members = table('members', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  tgId:      integer('tg_id').notNull(),
  username:  text('username'),
  fullName:  text('full_name').notNull(),
  phone:     text('phone'),
  unit:      text('unit'),                                   // platoon / squad / flight
  rank:      text('rank').notNull().default('cadet'),        // see lib/ranks.js
  role:      text('role').notNull().default('member'),
  status:    text('status').notNull().default('pending'),
  joinedAt:  integer('joined_at').notNull().default(sql`(unixepoch())`),
  approvedAt: integer('approved_at'),
}, (t) => ({
  tgIdx:     uniqueIndex('uidx_members_tg').on(t.tgId),
  statusIdx: index('idx_members_status').on(t.status),
}));

// Events: drills, meetings, training sessions. Times are unix seconds.
export const events = table('events', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description'),
  location:    text('location'),
  startsAt:    integer('starts_at').notNull(),
  durationMin: integer('duration_min').notNull().default(120),
  createdBy:   integer('created_by').notNull(),              // members.id (no foreign keys here)
  createdAt:   integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  startIdx: index('idx_events_start').on(t.startsAt),
}));

// Attendance: one check-in per member per event.
export const attendance = table('attendance', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  eventId:   integer('event_id').notNull(),
  memberId:  integer('member_id').notNull(),
  checkedAt: integer('checked_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniq:     uniqueIndex('uidx_attendance_event_member').on(t.eventId, t.memberId),
  memberIdx: index('idx_attendance_member').on(t.memberId),
}));
