import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex, hashPassword, verifyPassword } from '../tgcloud/lib/hash.js';
import * as D from '../tgcloud/lib/dates.js';
import * as O from '../tgcloud/lib/ocr-text.js';

// --- SHA-256 against Node's implementation (incl. multi-block, unicode)
for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'សួស្តី ០១២៣ 😀']) {
  assert.equal(sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'), 'sha256 ' + s.slice(0, 10));
}
// --- password hashing
const h = hashPassword('s3cret!');
assert.ok(h.startsWith('s1$'));
assert.deepEqual(verifyPassword(h, 's3cret!'), { ok: true, needsUpgrade: false });
assert.equal(verifyPassword(h, 'wrong').ok, false);
assert.deepEqual(verifyPassword('plain1', 'plain1'), { ok: true, needsUpgrade: true });
assert.equal(verifyPassword('plain1', 'nope').ok, false);
assert.equal(verifyPassword('', '').ok, false);
assert.notEqual(hashPassword('x'), hashPassword('x'), 'salted');

// --- dates
assert.deepEqual(D.parseStoredDate('១៥ មករា ២០២៦'), { y: 2026, m: 1, d: 15 });
assert.deepEqual(D.parseStoredDate('2026-09-07'), { y: 2026, m: 9, d: 7 });
assert.deepEqual(D.parseStoredDate('Sep 07, 2026'), { y: 2026, m: 9, d: 7 });
assert.deepEqual(D.parseStoredDate('03-Jul-2028'), { y: 2028, m: 7, d: 3 });
assert.deepEqual(D.parseStoredDate('15/01/2026'), { y: 2026, m: 1, d: 15 });
assert.equal(D.parseStoredDate('31 កុម្ភៈ ២០២៦'), null);   // invalid day
assert.equal(D.parseStoredDate(''), null);
assert.equal(D.toKhmerDate({ y: 2026, m: 1, d: 5 }), '០៥ មករា ២០២៦');
assert.equal(D.displayDate('2026-01-05'), '០៥ មករា ២០២៦');
assert.equal(D.displayDate('garbage'), 'garbage');
assert.deepEqual(D.addDays({ y: 2026, m: 9, d: 7 }, 365), { y: 2027, m: 9, d: 7 });
assert.equal(D.daysBetween({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 1, d: 31 }), 30);
assert.equal(D.normalizeToIso('១៥ មករា ២០២៦'), '2026-01-15');

// --- OCR heuristics
const receipt = 'Bakong transaction  Trx. ID 123  USD 10.00  From account  ABA Bank PLC  Sep 07, 2026 10:31 AM';
assert.ok(O.looksLikeTransactionReceipt(receipt));
assert.ok(!O.looksLikeTransactionReceipt('hello world'));
assert.deepEqual(O.extractTransactionDate(receipt), { y: 2026, m: 9, d: 7 });
const lic = 'Kingdom of Cambodia  National Medical Council  License  Registered Number: ១២៣៤៥  From 03-Jul-2023 To 03-Jul-2099';
assert.ok(O.looksLikeLicenseDocument(lic));
assert.equal(O.extractRegisteredNumber(lic), '12345');
assert.deepEqual(O.extractLatestDateFromText(lic), { y: 2099, m: 7, d: 3 });
assert.equal(O.validateLicenseOcr(lic).ok, true);
assert.equal(O.validateLicenseOcr(lic.replace('2099', '2020')).ok, false);   // expired
assert.equal(O.validateLicenseOcr('random text').ok, false);
assert.deepEqual(O.extractLatestDateFromText('ដល់ ០៣ កក្កដា ២០៣០'), { y: 2030, m: 7, d: 3 });

console.log('all pure-lib tests passed');
