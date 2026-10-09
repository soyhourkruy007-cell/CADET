import { EndpointError } from 'sdk';
import { MAX_IMAGE_B64_CHARS } from './config.js';

export const nowSec = () => Math.floor(Date.now() / 1000);
export const str = (v) => (v == null ? '' : String(v)).trim();
export const fail = (message, code) => new EndpointError(message, code ? { code } : {});

// A write with .returning() may resolve to an array of rows or to a run-result object.
export function firstRow(res) {
  if (Array.isArray(res)) return res[0] || null;
  if (res && Array.isArray(res.rows) && res.rows.length) return res.rows[0];
  return null;
}

// The Mini App always sends a JPEG (it re-encodes camera/gallery photos in the browser).
// Accepts raw base64 or a data: URL and returns the bare base64 string.
export function cleanImage(input) {
  let b64 = str(input);
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma > 0) b64 = b64.slice(comma + 1);
  if (!b64) throw fail('Please choose a photo to upload.', 'BAD_IMAGE');
  if (b64.length > MAX_IMAGE_B64_CHARS) throw fail('Photo must be 5 MB or smaller.', 'BAD_IMAGE');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw fail('Only JPG and PNG images are allowed.', 'BAD_IMAGE');
  if (!b64.startsWith('/9j/')) throw fail('Only JPG and PNG images are allowed.', 'BAD_IMAGE');
  return b64;
}
