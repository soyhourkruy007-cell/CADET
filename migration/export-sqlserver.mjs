// Exports the old SQL Server data to JSON files that public/import.html can upload.
//
//   npm install --no-save mssql
//   MSSQL_CONN="Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true" \
//     node migration/export-sqlserver.mjs
//
// Writes migration/export/users.json and migration/export/members.json (photos as base64).
import fs from 'node:fs';
import sql from 'mssql';

const conn = process.env.MSSQL_CONN;
if (!conn) { console.error('Set MSSQL_CONN to your SQL Server connection string.'); process.exit(1); }

const pick = (row, name) => {
  const k = Object.keys(row).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? row[k] : null;
};
const text = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === '' ? null : s;
};
const photo = (v) => (v && v.length ? Buffer.from(v).toString('base64') : null);
const flag = (v) => v === true || v === 1 || String(v).toLowerCase() === 'true' || v === '1';

await sql.connect(conn);
fs.mkdirSync('migration/export', { recursive: true });

const users = (await sql.query('SELECT * FROM dbo.USERS')).recordset.map((r) => ({
  id: pick(r, 'ID'), username: text(pick(r, 'Username')), password: String(pick(r, 'Password') ?? ''),
  roles: text(pick(r, 'Roles')) || 'Admin', isDel: flag(pick(r, 'IsDel')),
}));
fs.writeFileSync('migration/export/users.json', JSON.stringify(users));

const members = (await sql.query('SELECT * FROM dbo.CADET_MEMBERS')).recordset.map((r) => ({
  id: pick(r, 'ID'), cadetCode: text(pick(r, 'CADETCODE')), title: text(pick(r, 'TITLE')),
  memberName: text(pick(r, 'MEMBERNAME')), dob: text(pick(r, 'DOB')), sex: text(pick(r, 'SEX')),
  phone: text(pick(r, 'PHONE')), paymentDate: text(pick(r, 'PaymentDate')), expiryDate: text(pick(r, 'ExpiryDate')),
  licenseNo: text(pick(r, 'LicenseNo')), expireLicense: text(pick(r, 'ExpireLicense')),
  paymentProofPhoto: photo(pick(r, 'paymentProof_Photo')), licensePhoto: photo(pick(r, 'LicensePhoto')),
  statusConfirm: text(pick(r, 'StatusConfirm')), telegramId: text(pick(r, 'TelegramID')), isDel: flag(pick(r, 'IsDel')),
}));
fs.writeFileSync('migration/export/members.json', JSON.stringify(members));

console.log(`Exported ${users.length} users and ${members.length} members to migration/export/`);
await sql.close();
