// src/tournament-media.js
// A tournament's own pictures and its regulations: the crest beside its name,
// the partner organisations shown as a strip on its page, and the удирдамж a
// player opens in a popup.
//
// All three live in the tournament record itself (see media.js for why data
// URIs rather than a storage bucket), which is why every picker here shrinks
// hard and refuses anything over its cap: `loadTournaments()` reads every
// tournament whole, so a careless 4MB scan would be paid for on the home page
// of every phone in the club.
//
//   tournaments/{id}
//     logo:     data URI — the crest, 192px longest side
//     sponsors: [ { name, logo, link } ] — partner organisations, in order
//     guide:    { text, image } — the удирдамж; either half may be empty
//
// The reading half (tnLogo / tnSponsors / tnGuide) validates on the way out as
// well as on the way in, so a hand-edited record can never put anything but an
// image into an <img src> or anything but http(s) into an href.

import { t } from './i18n.js';
import * as store from './store.js';
import { readImageFile, validImageData, safeLink } from './media.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The crest draws at 62px and a sponsor mark at about 110px wide, so these are
// already generous on a 3x screen. The guide image is a scanned page a player
// pinches open, which is why it alone is a jpeg and gets a bigger budget.
const CREST_PX = 192;
const SPONSOR_PX = 240;
const GUIDE_PX = 1000;
const GUIDE_MAX_CHARS = 260000;   // ~190KB decoded

export const MAX_SPONSORS = 12;

// ---- Reading ----

export const tnLogo = (tn) => (validImageData(tn?.logo) ? tn.logo : null);

// RTDB hands an array back as an array while its keys stay 0..n-1, and as an
// object once anything is removed by hand — accept both.
export function tnSponsors(tn) {
  const raw = Array.isArray(tn?.sponsors) ? tn.sponsors : Object.values(tn?.sponsors || {});
  return raw
    .filter(Boolean)
    .map(s => ({
      name: String(s.name || '').trim(),
      logo: validImageData(s.logo) ? s.logo : null,
      link: safeLink(s.link)
    }))
    .filter(s => s.logo || s.name)
    .slice(0, MAX_SPONSORS);
}

export function tnGuide(tn) {
  const g = tn?.guide || {};
  const text = String(g.text || '').trim();
  const image = validImageData(g.image) ? g.image : null;
  return text || image ? { text, image } : null;
}

export const tnHasGuide = (tn) => !!tnGuide(tn);

// ---- The tournament page ----

// The partner organisations: a section of its own, headed like the board's
// own sections rather than boxed in a card, with ONE organisation to a row so
// every mark gets the full width and none is read as smaller than another.
//
// Each mark sits centred on a light plaque: most logos are dark-on-transparent
// and, dropped straight onto the app's navy page, half of them would vanish.
export function tnSponsorsHTML(tn) {
  const list = tnSponsors(tn);
  if (!list.length) return '';
  const mark = (s) => {
    const inner = s.logo
      ? `<img src="${s.logo}" alt="${esc(s.name)}" style="max-width:100%;max-height:72px;object-fit:contain;display:block;margin:0 auto;" />`
      : `<span style="font-weight:700;font-size:1.05rem;color:#0C3051;">${esc(s.name)}</span>`;
    // The plaque's height and its padding set the ceiling on the mark: a tall
    // logo is bounded by one, a wide one by the row's width. 104 − 2×16 = 72,
    // which is the max-height above, so a square mark fills the row as fully
    // as a wordmark does.
    const plaque = `
      <span title="${esc(s.name)}" style="display:flex;align-items:center;justify-content:center;
             width:100%;min-height:104px;padding:16px 20px;box-sizing:border-box;
             background:#fff;border-radius:12px;">${inner}</span>`;
    return s.link
      ? `<a href="${esc(s.link)}" target="_blank" rel="noopener" style="display:block;">${plaque}</a>`
      : plaque;
  };
  return `
    <div class="section-head tn-section"><h2>${t('tnSponsors')}</h2></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">${list.map(mark).join('')}</div>`;
}

// The удирдамж popup. The text is shown exactly as it was typed —
// pre-wrap, so the organiser's own line and paragraph breaks survive — and the
// image, when there is one, sits under it at full width.
export function openTnGuide(tn) {
  const g = tnGuide(tn);
  if (!g) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:560px;max-height:82vh;display:flex;flex-direction:column;">
      <h3 class="modal-title" style="display:flex;align-items:center;justify-content:center;gap:8px;">
        📋 ${t('tnGuide')}
      </h3>
      <div style="overflow-y:auto;margin:10px 0 4px;-webkit-overflow-scrolling:touch;">
        <div style="font-size:0.86rem;line-height:1.65;color:var(--text-primary);white-space:pre-wrap;word-break:break-word;">${esc(g.text)}</div>
        ${g.image ? `<img src="${g.image}" alt="" style="width:100%;height:auto;border-radius:10px;margin-top:${g.text ? '12px' : '0'};" />` : ''}
      </div>
      <div class="modal-actions" style="margin-top:10px;">
        <button data-tng="close" class="btn btn-primary">${t('close')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-tng="close"]').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ---- The admin editor's fold ----

const drafts = new Map();
export function discardTnMediaDraft(tnId) { drafts.delete(tnId); }

function draftFor(tn) {
  let d = drafts.get(tn.id);
  if (!d) {
    const g = tn.guide || {};
    d = {
      logo: tnLogo(tn),
      sponsors: tnSponsors(tn).map(s => ({ ...s, link: s.link || '' })),
      guide: { text: String(g.text || ''), image: validImageData(g.image) ? g.image : null },
      dirty: false
    };
    drafts.set(tn.id, d);
  }
  return d;
}

const INPUT = 'padding:7px 9px;border-radius:8px;border:1px solid var(--border-color);'
  + 'background:var(--bg-card);color:var(--text-primary);font-family:var(--font);font-size:0.82rem;';
const LABEL = 'display:block;font-size:0.62rem;letter-spacing:0.06em;font-weight:700;'
  + 'color:var(--text-secondary);margin-bottom:4px;';

// A picture row: the preview (on a light plaque so a transparent mark reads),
// the pick button, and a clear button once there is something to clear.
function pickerRowHTML(kind, current, { idx = '', height = 34 } = {}) {
  const at = `data-tnm-kind="${kind}"${idx === '' ? '' : ` data-tnm-idx="${idx}"`}`;
  return `
    <div style="display:flex;gap:6px;align-items:center;">
      ${current
        ? `<span style="display:flex;align-items:center;justify-content:center;background:#fff;border-radius:6px;padding:3px 6px;">
             <img src="${current}" alt="" style="max-height:${height}px;max-width:90px;object-fit:contain;display:block;" /></span>`
        : `<span style="font-size:0.72rem;color:var(--text-muted);">—</span>`}
      <button data-tnm="pick" ${at} class="btn btn-outline btn-sm" style="font-size:0.72rem;">
        ${current ? t('mpLogoChange') : t('mpLogoUpload')}
      </button>
      ${current ? `<button data-tnm="clear" ${at} class="btn btn-outline-danger btn-sm" style="font-size:0.72rem;">✕</button>` : ''}
      <input data-tnm-file="${kind}${idx === '' ? '' : `-${idx}`}" type="file" accept="image/*" style="display:none;" />
    </div>`;
}

function sectionHTML(tn) {
  const d = draftFor(tn);
  const sponsorRow = (s, i) => `
    <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;margin-top:6px;background:var(--bg-color);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input data-tnm="sp-name" data-tnm-idx="${i}" value="${esc(s.name)}" placeholder="${t('tnSponsorName')}"
          style="${INPUT}flex:1;min-width:110px;font-weight:700;" />
        <button data-tnm="sp-del" data-tnm-idx="${i}" class="btn btn-outline-danger btn-sm" style="font-size:0.72rem;">✕</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;">
        ${pickerRowHTML('sponsor', s.logo, { idx: i })}
      </div>
      <input data-tnm="sp-link" data-tnm-idx="${i}" value="${esc(s.link)}" placeholder="${t('tnSponsorLink')}"
        style="${INPUT}width:100%;box-sizing:border-box;margin-top:6px;" />
    </div>`;

  return `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
      <details data-tnm-fold>
        <summary style="cursor:pointer;font-size:0.8rem;font-weight:800;">🖼 ${t('tnMedia')}</summary>
        <div style="margin-top:10px;">

          <span style="${LABEL}">${t('tnLogoLabel')}</span>
          ${pickerRowHTML('logo', d.logo, { height: 40 })}

          <div style="margin-top:14px;">
            <span style="${LABEL}">${t('tnSponsors')} — ${d.sponsors.length}/${MAX_SPONSORS}</span>
            ${d.sponsors.map(sponsorRow).join('')}
            <button data-tnm="sp-add" class="btn btn-outline btn-sm"
              style="margin-top:8px;font-size:0.75rem;" ${d.sponsors.length >= MAX_SPONSORS ? 'disabled' : ''}>
              + ${t('tnSponsorAdd')}
            </button>
          </div>

          <div style="margin-top:14px;">
            <span style="${LABEL}">${t('tnGuide')}</span>
            <textarea data-tnm="guide-text" rows="7" placeholder="${t('tnGuideHint')}"
              style="${INPUT}width:100%;box-sizing:border-box;resize:vertical;line-height:1.55;">${esc(d.guide.text)}</textarea>
            <div style="margin-top:6px;">${pickerRowHTML('guide', d.guide.image, { height: 46 })}</div>
          </div>

          <button data-tnm="save" class="btn ${d.dirty ? 'btn-primary' : 'btn-outline'} btn-sm" style="margin-top:12px;">
            ${t('mpSave')}${d.dirty ? ' *' : ''}
          </button>
        </div>
      </details>
    </div>`;
}

// Which shrink each picker uses. The guide is a page of text, so it is a wider
// jpeg; the two logos are webp, which keeps their transparency.
const READ_OPTS = {
  logo: { px: CREST_PX },
  sponsor: { px: SPONSOR_PX },
  guide: { px: GUIDE_PX, mime: 'image/jpeg', quality: 0.8, maxChars: GUIDE_MAX_CHARS }
};

export function mountTnMedia(host, tn, ctx = {}) {
  if (!host) return;
  const foldWasOpen = host.querySelector('details[data-tnm-fold]')?.open;
  host.innerHTML = sectionHTML(tn);
  const fold = host.querySelector('details[data-tnm-fold]');
  if (foldWasOpen) fold.open = true;

  const d = draftFor(tn);
  const repaint = () => mountTnMedia(host, tn, ctx);
  const markDirty = () => { d.dirty = true; };
  const setImage = (kind, idx, value) => {
    if (kind === 'logo') d.logo = value;
    else if (kind === 'guide') d.guide.image = value;
    else if (d.sponsors[idx]) d.sponsors[idx].logo = value;
  };

  host.querySelectorAll('input[data-tnm]').forEach(inp => {
    inp.oninput = () => {
      const s = d.sponsors[Number(inp.dataset.tnmIdx)];
      if (!s) return;
      if (inp.dataset.tnm === 'sp-name') s.name = inp.value;
      else s.link = inp.value;
      markDirty();
    };
  });
  const ta = host.querySelector('textarea[data-tnm="guide-text"]');
  if (ta) ta.oninput = () => { d.guide.text = ta.value; markDirty(); };

  host.querySelectorAll('button[data-tnm]').forEach(b => b.onclick = async () => {
    const kind = b.dataset.tnm;
    const which = b.dataset.tnmKind;
    const idx = Number(b.dataset.tnmIdx);
    if (kind === 'pick') {
      host.querySelector(`input[data-tnm-file="${which}${b.dataset.tnmIdx === undefined ? '' : `-${idx}`}"]`)?.click();
      return;
    }
    if (kind === 'clear') { setImage(which, idx, null); markDirty(); repaint(); return; }
    if (kind === 'sp-add') {
      if (d.sponsors.length >= MAX_SPONSORS) return;
      d.sponsors.push({ name: '', logo: null, link: '' });
      markDirty(); repaint(); return;
    }
    if (kind === 'sp-del') { d.sponsors.splice(idx, 1); markDirty(); repaint(); return; }
    if (kind === 'save') {
      const sponsors = d.sponsors
        .filter(s => s.logo || s.name.trim())
        .map(s => ({
          name: s.name.trim(),
          ...(s.logo ? { logo: s.logo } : {}),
          ...(safeLink(s.link) ? { link: safeLink(s.link) } : {})
        }));
      const text = d.guide.text.trim();
      try {
        // null deletes the key, so clearing a picture really clears it rather
        // than leaving the old one behind under a falsy value.
        await store.updateTournament(tn.id, {
          logo: d.logo || null,
          sponsors: sponsors.length ? sponsors : null,
          guide: text || d.guide.image ? { text, ...(d.guide.image ? { image: d.guide.image } : {}) } : null
        });
        d.dirty = false;
        ctx.showToast?.('✅ ' + t('saved'), 'success');
        await ctx.rerender?.();
      } catch (err) {
        console.error('[tn-media]', err);
        ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
      }
    }
  });

  host.querySelectorAll('input[data-tnm-file]').forEach(inp => {
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      inp.value = '';
      if (!file) return;
      const [which, i] = String(inp.dataset.tnmFile).split('-');
      try {
        setImage(which, Number(i), await readImageFile(file, READ_OPTS[which]));
        markDirty();
        repaint();
      } catch (err) {
        ctx.showToast?.('⚠️ ' + t(err?.message === 'too-big' ? 'mpLogoTooBig' : 'mpLogoBad'), 'error');
      }
    };
  });
}
