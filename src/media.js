// src/media.js
// Reading a picked image file into a small data URI, for the marks and
// pictures that live INSIDE a record — team logos, a tournament's crest, its
// sponsors, a scan of its regulations.
//
// Why data URIs and not a storage bucket: at these sizes a logo is a few KB,
// which is small enough to ride along in the tournament record and spares the
// app a whole storage bucket, its rules, and a second fetch on every render.
// The cost is that the record is read whole — so every caller passes a size
// and a hard character cap, and an image over the cap is refused rather than
// quietly bloating a record the tournament list reads in full.
//
// Browser-only (Image + canvas), so nothing here is unit-tested; it is kept
// apart from the admin modules so the M Cup, the tournament editor and
// anything later all shrink images exactly the same way.

// A logo the UI will actually accept: an image data URI, nothing else. Both
// the writers and the readers test with this, so a hand-edited record cannot
// put anything but an image into an <img src>.
export const validImageData = (v) =>
  typeof v === 'string'
  && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v);

// An http(s) link, or null. Anything else — javascript:, data:, a typo — is
// dropped rather than rendered, because these come from an admin form and end
// up in an href.
export function safeLink(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch (_) {
    return null;
  }
}

/**
 * A picked File → a data URI scaled so its LONGEST side is `px`, aspect ratio
 * preserved (never cropped — a wordmark cropped square is unreadable).
 *
 * webp keeps transparency and compresses far better than png, which matters
 * for a logo dropped on a dark card; png is the fallback where a browser
 * cannot encode webp, and `mime: 'image/jpeg'` is for photographs and scans,
 * where transparency is meaningless and jpeg is much smaller.
 *
 * Rejects 'not-image', 'bad-image', or 'too-big' — the caller turns those into
 * the toast the admin reads.
 */
export function readImageFile(file, { px = 96, maxChars = 80000, mime = 'image/webp', quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { reject(new Error('not-image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, px / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // A jpeg has no alpha channel, so a transparent source would come out
      // with black behind it; paint white first, the way a printed page is.
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL(mime, quality);
      if (!out.startsWith(`data:${mime}`)) out = canvas.toDataURL('image/png');
      if (out.length > maxChars) { reject(new Error('too-big')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    img.src = url;
  });
}
