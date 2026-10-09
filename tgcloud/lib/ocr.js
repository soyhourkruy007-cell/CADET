import { fetch } from 'sdk';
import { OCR_SPACE_API_KEY } from './config.js';

// OCR.space call. Returns { configured, text }. A failure yields text '' (treated as "could not verify",
// exactly like the old code did).
export async function ocrSpace(base64Jpeg) {
  if (!OCR_SPACE_API_KEY) return { configured: false, text: '' };
  try {
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: OCR_SPACE_API_KEY },
      body: fetch.body.form({
        base64Image: 'data:image/jpeg;base64,' + base64Jpeg,
        language: 'eng',
        OCREngine: '2',
      }),
    });
    if (!res.ok) return { configured: true, text: '' };
    const data = await res.json();
    const parsed = data && data.ParsedResults && data.ParsedResults[0];
    return { configured: true, text: parsed && parsed.ParsedText ? String(parsed.ParsedText) : '' };
  } catch (e) {
    console.error('ocrSpace failed', e);
    return { configured: true, text: '' };
  }
}
