import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { cadetMembers as m } from '../schema.js';
import { displayDate, parseStoredDate, toIso, daysUntil, compareYmd } from './dates.js';
import { CADET_PREFIX } from './config.js';
import { str } from './util.js';

// Everything except the (large) photo columns.
export const LIST_COLS = {
  id: m.id, cadetCode: m.cadetCode, title: m.title, memberName: m.memberName, dob: m.dob, sex: m.sex,
  phone: m.phone, paymentDate: m.paymentDate, expiryDate: m.expiryDate, licenseNo: m.licenseNo,
  expireLicense: m.expireLicense, statusConfirm: m.statusConfirm, telegramId: m.telegramId,
};

export function normSex(v) {
  const s = str(v).toUpperCase();
  if (s === 'M' || s === 'MALE' || s === 'ប្រុស') return 'Male';
  if (s === 'F' || s === 'FEMALE' || s === 'ស្រី') return 'Female';
  return '';
}
export function sexLabel(v) {
  const n = normSex(v);
  return n === 'Male' ? 'ប្រុស' : n === 'Female' ? 'ស្រី' : str(v);
}

// Plain object for the Mini App (dates both as ISO for <input type=date> and as Khmer display text).
export function publicMember(row, { admin = false, photos = false } = {}) {
  const dob = parseStoredDate(row.dob);
  const pay = parseStoredDate(row.paymentDate);
  const exp = parseStoredDate(row.expiryDate);
  const lic = parseStoredDate(row.expireLicense);
  const out = {
    id: row.id,
    cadetCode: str(row.cadetCode),
    title: str(row.title),
    memberName: str(row.memberName),
    sex: normSex(row.sex),
    sexLabel: sexLabel(row.sex),
    phone: str(row.phone),
    licenseNo: str(row.licenseNo),
    statusConfirm: str(row.statusConfirm),
    telegramLinked: !!str(row.telegramId),
    dob: toIso(dob), dobText: displayDate(row.dob),
    paymentDate: toIso(pay), paymentText: displayDate(row.paymentDate),
    expiryDate: toIso(exp), expiryText: displayDate(row.expiryDate),
    expireLicense: toIso(lic), expireLicenseText: displayDate(row.expireLicense),
    daysLeft: exp ? daysUntil(exp) : null,
  };
  if (admin) out.telegramId = str(row.telegramId);
  if (photos) {
    out.paymentProof = row.paymentProofPhoto || '';
    out.licensePhoto = row.licensePhoto || '';
  }
  return out;
}

export async function loadMember(id) {
  return db.select().from(m).where(and(eq(m.id, id), eq(m.isDel, false))).get();
}

export async function listActiveMembers() {
  return db.select(LIST_COLS).from(m).where(eq(m.isDel, false)).all();
}

// Sort by parsed expiry date ascending; members without an expiry date go last.
export function sortByExpiry(rows) {
  return rows.slice().sort((a, b) => {
    const da = parseStoredDate(a.expiryDate), dbb = parseStoredDate(b.expiryDate);
    if (da && dbb) return compareYmd(da, dbb);
    if (da) return -1;
    if (dbb) return 1;
    return 0;
  });
}

// Next code = highest numeric suffix among ALL rows (deleted included, so codes are never reused) + 1,
// keeping the zero-padding width of the existing codes.
export async function nextCadetCode() {
  const rows = await db.select({ code: m.cadetCode }).from(m).all();
  let max = -1, width = 0;
  for (const r of rows) {
    const code = str(r.code);
    if (!code.toUpperCase().startsWith(CADET_PREFIX)) continue;
    const tail = code.slice(CADET_PREFIX.length);
    if (!/^\d+$/.test(tail)) continue;
    const n = parseInt(tail, 10);
    if (n > max) { max = n; width = tail.startsWith('0') ? tail.length : 0; }
  }
  const next = String(max + 1);
  return CADET_PREFIX + (width ? next.padStart(width, '0') : next);
}

export async function codeInUse(code, exceptId) {
  const rows = await db.select({ id: m.id, code: m.cadetCode }).from(m).where(eq(m.isDel, false)).all();
  const want = str(code).toUpperCase();
  return rows.some((r) => r.id !== exceptId && str(r.code).toUpperCase() === want);
}
