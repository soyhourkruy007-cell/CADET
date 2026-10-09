// OCR text heuristics, ported 1:1 from the old VB code (receipt / license detection, dates, numbers).
import { KHMER_MONTHS, fromKhmerDigits, validYmd, compareYmd, todayKH, formatEnglish } from './dates.js';

const TRANSACTION_KEYWORDS = [
  'trx', 'transaction', 'bakong', 'reference', 'trx. id', 'hash',
  'aba', 'acleda', 'wing', 'pi pay', 'canadia', 'prince bank', 'bank plc',
  'khqr', 'original amount', 'from account', 'seller', 'usd', 'khr',
  'ត្រង់សាក់ស្យិន', 'ធនាគារ', 'លេខយោង',
];

const LICENSE_KEYWORDS = [
  'license', 'licence', 'medical council', 'national medical',
  'registered number', 'registration', 'clinical practice',
  'kingdom of cambodia', 'certifies that', 'nationality',
  'date of birth', 'president',
  'អាជ្ញាបណ្ណ', 'ក្រុមប្រឹក្សា', 'ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ',
];

function countHits(text, keywords) {
  const lower = String(text || '').toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (lower.includes(kw.toLowerCase())) hits++;
  return hits;
}

// Needs at least 3 distinct receipt-style signals.
export const looksLikeTransactionReceipt = (t) => !!(t && String(t).trim()) && countHits(t, TRANSACTION_KEYWORDS) >= 3;
export const looksLikeLicenseDocument = (t) => !!(t && String(t).trim()) && countHits(t, LICENSE_KEYWORDS) >= 3;

export function extractRegisteredNumber(text) {
  if (!text || !String(text).trim()) return '';
  const normalized = fromKhmerDigits(text);
  const m = normalized.match(/(registered\s*number|លេខបញ្ជិកា|លេខបញ្ជីកា|លេខ\s*ចុះ\s*បញ្ជី)\D{0,15}(\d{3,10})/i);
  return m ? m[2] : '';
}

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Latest date-like token in the text. On a license "From ... To ..." line the later date is the expiry.
export function extractLatestDateFromText(text) {
  if (!text || !String(text).trim()) return null;
  const cands = [];
  const push = (y, m, d) => { if (validYmd(y, m, d)) cands.push({ y, m, d }); };

  // English: 03-Jul-2028 / 03 July 2028 / 03/07/2028
  const eng = String(text).matchAll(/\b(\d{1,2})[\s\-\/]((?:[A-Za-z]{3,9})|\d{1,2})[\s\-\/](\d{4})\b/g);
  for (const mt of eng) {
    const d = +mt[1], y = +mt[3];
    if (/^\d+$/.test(mt[2])) {
      const b = +mt[2];
      if (b > 12 && d <= 12) push(y, d, b); else push(y, b, d);   // day-first by default
    } else {
      const mi = EN_MONTHS.indexOf(mt[2].slice(0, 3).toLowerCase());
      if (mi >= 0) push(y, mi + 1, d);
    }
  }

  // Khmer: "០៣ កក្កដា ២០២៨"
  for (let i = 0; i < KHMER_MONTHS.length; i++) {
    const re = new RegExp('([០-៩0-9]{1,2})\\s*' + escapeRe(KHMER_MONTHS[i]) + '\\s*([០-៩0-9]{4})', 'g');
    for (const mt of String(text).matchAll(re)) push(+fromKhmerDigits(mt[2]), i + 1, +fromKhmerDigits(mt[1]));
  }

  if (!cands.length) return null;
  return cands.reduce((a, b) => (compareYmd(a, b) >= 0 ? a : b));
}

// Receipt date such as "Sep 07, 2026 10:31 AM" (time optional); falls back to the generic search.
export function extractTransactionDate(text) {
  if (!text || !String(text).trim()) return null;
  const normalized = String(text).replace(/\s+/g, ' ');
  const cands = [];
  for (const mt of normalized.matchAll(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})(?:\s+\d{1,2}:\d{2}\s*[APap][Mm])?/g)) {
    const mi = EN_MONTHS.indexOf(mt[1].slice(0, 3).toLowerCase());
    if (mi >= 0 && validYmd(+mt[3], mi + 1, +mt[2])) cands.push({ y: +mt[3], m: mi + 1, d: +mt[2] });
  }
  if (cands.length) return cands.reduce((a, b) => (compareYmd(a, b) >= 0 ? a : b));
  return extractLatestDateFromText(text);
}

// -> { ok, error?, expiry? }
export function validateLicenseOcr(text) {
  if (!looksLikeLicenseDocument(text)) {
    return { ok: false, error: 'រូបភាពនេះមើលទៅមិនដូចជាអាជ្ញាប័ណ្ណទេ សូមផ្ទុករូបភាពឯកសារឱ្យបានច្បាស់លាស់។' };
  }
  if (!extractRegisteredNumber(text)) {
    return { ok: false, error: 'រកមិនឃើញលេខបញ្ជិកា (Registered Number) នៅលើឯកសារនេះទេ សូមផ្ទុករូបភាពពេញលេញនិងច្បាស់។' };
  }
  const expiry = extractLatestDateFromText(text);
  if (!expiry) {
    return { ok: false, error: 'រកមិនឃើញកាលបរិច្ឆេទផុតកំណត់នៅលើអាជ្ញាប័ណ្ណនេះទេ សូមផ្ទុករូបភាពដែលមើលឃើញកាលបរិច្ឆេទច្បាស់លាស់។' };
  }
  if (compareYmd(expiry, todayKH()) <= 0) {
    return { ok: false, error: `អាជ្ញាប័ណ្ណនេះផុតកំណត់ហើយ (${formatEnglish(expiry)}) សូមផ្ទុកអាជ្ញាប័ណ្ណថ្មីដែលនៅមានសុពលភាព។` };
  }
  return { ok: true, expiry };
}
