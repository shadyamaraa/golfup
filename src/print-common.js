// src/print-common.js
// Shared plumbing for the print-ready pages (#/scorecard/, #/schedule/,
// #/tnschedule/): the paper-white sheet styling, the @media print rules that
// hide the app chrome, QR rendering, and link copying. The <style> block is
// part of each page's template, so it mounts and unmounts with the page —
// printing any other screen is untouched.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Absolute URL for a hash route — what the QR encodes and the copy button
// copies. Same construction as getGameUrl() in app.js.
export function pageUrl(hash) {
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

// Draw the page's own URL into a canvas. The qrcode lib is a lazy chunk —
// the main bundle never carries it. Best-effort: on any failure the canvas
// is hidden and the URL printed next to it still carries the link.
export async function mountQr(canvasId, url) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try {
    const mod = await import('qrcode');
    const QRCode = mod.default ?? mod;
    await QRCode.toCanvas(canvas, url, {
      width: 120, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.warn('[print] QR render failed', err);
    canvas.style.display = 'none';
  }
}

// Copy a URL to the clipboard with the execCommand fallback (same pattern as
// copyGameLink in app.js). showToast comes from the page's ctx.
export function copyUrl(url, showToast, label) {
  const done = () => showToast && showToast('📋 ' + label, 'success');
  navigator.clipboard.writeText(url).then(done).catch(() => {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    done();
  });
}

// The shared sheet + print CSS. Page-specific styles (scorecard cell colors,
// schedule column widths) live in each page's own <style> block.
export function printStyleHTML() {
  return `<style>
    .sc-sheet {
      background: #fff; color: #111; border: 1px solid #d8d2c4;
      border-radius: 10px; padding: 16px 14px 20px; margin-top: 12px;
      font-family: var(--font), sans-serif;
    }
    .sc-sheet a { color: #111; }
    .sc-sheet table {
      border-collapse: collapse; font-variant-numeric: tabular-nums;
      font-size: 0.72rem; line-height: 1.25;
    }
    .sc-sheet th, .sc-sheet td {
      border: 1px solid #999; padding: 3px 4px; text-align: center;
      min-width: 20px; color: #111;
    }
    .sc-scroll { overflow-x: auto; }
    .sc-no-print { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .sc-block { break-inside: avoid; page-break-inside: avoid; }
    .sc-page-break { break-before: page; page-break-before: always; }
    /* Long tables break BETWEEN rows, never inside one, and repeat their
       header row on every printed page. A whole-table avoid pushed a table
       taller than the space left after the sheet header onto its own page,
       leaving page 1 nearly empty. */
    .sc-sheet thead { display: table-header-group; }
    .sc-sheet tr { break-inside: avoid; page-break-inside: avoid; }
    @media print {
      #app-header, #bottom-nav, #tn-strip, #global-sponsor, #toast-container,
      .sc-no-print { display: none !important; }
      html, body, #app, #main-content {
        background: #fff !important; color: #000 !important;
        margin: 0 !important; padding: 0 !important;
      }
      #main-content { max-width: none !important; }
      .sc-sheet { border: none; border-radius: 0; padding: 0; margin: 0; }
      .sc-scroll { overflow: visible; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: A4 portrait; margin: 12mm; }
  </style>`;
}
