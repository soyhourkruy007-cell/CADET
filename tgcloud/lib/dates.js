// Date helpers. The old database stored dates as Khmer text ("១៥ មករា ២០២៦") in some columns and
// ISO / English text in others, so reading is deliberately forgiving. New writes use ISO (yyyy-MM-dd).
import { CAMBODIA_UTC_OFFSET_HOURS } from './config.js';

export const KHMER_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
export const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function toKhmerDigits(value) {
  return String(value == null ? '' : value).replace(/[0-9]/g, (d) => KHMER_DIGITS[+d]);
}
export function fromKhmerDigits(value) {
  return String(value == null ? '' : value).replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));
}

export function validYmd(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const ymd = (y, m, d) => (validYmd(y, m, d) ? { y, m, d } : null);

// Parses Khmer text, ISO, or English-style dates. Returns {y,m,d} or null.
export function parseStoredDate(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);

  const arabic = fromKhmerDigits(raw);

  // Khmer month name present: "15 មករា 2026"
  for (let i = 0; i < KHMER_MONTHS.length; i++) {
    if (raw.includes(KHMER_MONTHS[i])) {
      const dayM = arabic.match(/(\d{1,2})/);
      const yearM = arabic.match(/(\d{4})/);
      if (dayM && yearM) return ymd(+yearM[1], i + 1, +dayM[1]);
      return null;
    }
  }

  // English month name: "Sep 07, 2026", "07 Sep 2026", "03-Jul-2028"
  m = arabic.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mi = EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return ymd(+m[3], mi + 1, +m[2]);
  }
  m = arabic.match(/(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})\.?[\s\-\/.,]+(\d{4})/);
  if (m) {
    const mi = EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return ymd(+m[3], mi + 1, +m[1]);
  }

  // numeric a/b/yyyy : day-first unless the second number can only be a day
  m = arabic.match(/(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{4})/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (b > 12 && a <= 12) return ymd(y, a, b);
    return ymd(y, b, a);
  }
  return null;
}

const pad2 = (n) => String(n).padStart(2, '0');
export const toIso = (v) => (v ? `${v.y}-${pad2(v.m)}-${pad2(v.d)}` : '');
export const toKhmerDate = (v) => (v ? `${toKhmerDigits(pad2(v.d))} ${KHMER_MONTHS[v.m - 1]} ${toKhmerDigits(v.y)}` : '');

// Display text for any stored date value: Khmer if parseable, otherwise the raw text.
export function displayDate(value) {
  const p = parseStoredDate(value);
  if (p) return toKhmerDate(p);
  return value == null ? '' : String(value);
}

// Normalise a user-entered date (ISO from <input type=date>, or anything parseable) to ISO, or null.
export function normalizeToIso(value) {
  const p = parseStoredDate(value);
  return p ? toIso(p) : null;
}

const dayNumber = (v) => Math.round(Date.UTC(v.y, v.m - 1, v.d) / 86400000);

export function todayKH() {
  const t = new Date(Date.now() + CAMBODIA_UTC_OFFSET_HOURS * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const daysUntil = (v) => daysBetween(todayKH(), v);

export function addDays(v, n) {
  const dt = new Date(Date.UTC(v.y, v.m - 1, v.d) + n * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function compareYmd(a, b) { return dayNumber(a) - dayNumber(b); }

// Used for DD-MMM-YYYY style messages (matches the old "dd-MMM-yyyy" format).
export function formatEnglish(v) {
  if (!v) return '';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad2(v.d)}-${names[v.m - 1]}-${v.y}`;
}
