// src/share-sheet.js
// The sheet behind every Хуваалцах button: a preview of the card, chips for
// the format (post / story / carousel) and the options (background, hide
// strokes), a caption to go with it, and the two ways out — the phone's
// share sheet with the image files, or a download where there is none.
//
// The picture is drawn on demand by the `build` the caller hands in, so this
// file knows nothing about tournaments; it only knows how to show a card
// and hand it over. Nothing is stored anywhere.

import { t } from './i18n.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const canShareFiles = (files) => {
  try { return !!(navigator.canShare && navigator.canShare({ files })); } catch (_) { return false; }
};

/**
 * Open the sheet.
 *   title     — the share's title and the sheet's heading
 *   kinds     — [{ key, label, text? }], the first is the default; a text kind
 *               shares words instead of a picture (the caption box IS the text)
 *   options   — { background?: { value, values:[{key,label}] }, hideStrokes?: { value, label } }
 *   build     — async (kindKey, optionValues) → [{ blob, dataUrl, width, height }]
 *               or, for a text kind, [{ text }]
 *   caption   — the prefilled text; url rides in it
 *   fileBase  — the download name without extension
 *   viber     — offer Viber's own forward for text kinds (the club's chat)
 *   showToast — the app's toast
 */
export function openShareSheet({ title, kinds, options = {}, build, caption = '', fileBase = 'ubgolf', viber = false, showToast } = {}) {
  if (document.querySelector('.modal-overlay[data-shs]')) return;
  let kind = kinds[0].key;
  const opt = {
    background: options.background?.value || 'navy',
    hideStrokes: !!options.hideStrokes?.value
  };
  const cache = new Map();
  let images = [];
  let page = 0;
  let seq = 0;
  const isText = () => !!kinds.find(k => k.key === kind)?.text;
  // The picture kinds keep the caption the caller wrote; a text kind's box
  // holds the text itself, so switching back must not lose either.
  let imageCaption = caption;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay shs-overlay fade-in';
  overlay.setAttribute('data-shs', '1');
  overlay.innerHTML = `
    <div class="shs-sheet" role="dialog" aria-label="${esc(title)}">
      <div class="shs-head">
        ${icon('share', { size: 18 })}
        <h3>${esc(title)}</h3>
        <button class="btn btn-outline btn-sm" data-shs="close" aria-label="${t('close')}">✕</button>
      </div>
      <div class="shs-preview" data-shs="preview">
        <img data-shs="img" alt="" hidden />
        <div class="shs-busy" data-shs="busy">${t('tnShareBuilding')}</div>
      </div>
      <div class="shs-dots" data-shs="dots" hidden></div>
      <div class="shs-chips" data-shs="kinds">
        ${kinds.map(k => `<button type="button" class="seg-chip${k.key === kind ? ' active' : ''}" data-shs-kind="${esc(k.key)}">${esc(k.label)}</button>`).join('')}
      </div>
      ${options.background ? `
      <div class="shs-chips" data-shs="bg">
        ${options.background.values.map(v => `<button type="button" class="seg-chip${v.key === opt.background ? ' active' : ''}" data-shs-bg="${esc(v.key)}">${esc(v.label)}</button>`).join('')}
      </div>` : ''}
      ${options.hideStrokes ? `
      <div class="shs-chips">
        <button type="button" class="seg-chip${opt.hideStrokes ? ' active' : ''}" data-shs-toggle="hideStrokes">${esc(options.hideStrokes.label)}</button>
      </div>` : ''}
      <textarea class="shs-caption" data-shs="caption" rows="3" aria-label="${t('shCaption')}">${esc(caption)}</textarea>
      <div class="shs-actions">
        <button class="btn btn-primary" data-shs="share">${icon('share', { size: 15 })} ${t('tnShare')}</button>
        <button class="btn btn-outline" data-shs="viber" hidden>${t('shViber')}</button>
        <button class="btn btn-outline" data-shs="copy" hidden>${t('copyShort')}</button>
        <a class="btn btn-outline" data-shs="download" download="${esc(fileBase)}.png" href="#">⬇ ${t('tnDownload')}</a>
      </div>
      <div class="shs-note" data-shs="note" hidden></div>
    </div>`;
  document.body.appendChild(overlay);

  const q = (sel) => overlay.querySelector(sel);
  const img = q('[data-shs="img"]');
  const busy = q('[data-shs="busy"]');
  const dots = q('[data-shs="dots"]');
  const note = q('[data-shs="note"]');
  const dl = q('[data-shs="download"]');
  const preview = q('[data-shs="preview"]');
  const cap = q('[data-shs="caption"]');
  const viberBtn = q('[data-shs="viber"]');
  const copyBtn = q('[data-shs="copy"]');
  const close = () => overlay.remove();

  // Text kinds: no picture, the caption box grows into the text, and the
  // ways out are the share sheet, Viber's own forward, or the clipboard.
  const showText = (text) => {
    preview.hidden = true;
    dots.hidden = true;
    dl.hidden = true;
    viberBtn.hidden = !viber;
    copyBtn.hidden = false;
    cap.classList.add('big');
    cap.value = text;
  };
  const showImages = () => {
    preview.hidden = false;
    dl.hidden = false;
    viberBtn.hidden = true;
    copyBtn.hidden = true;
    cap.classList.remove('big');
    cap.value = imageCaption;
  };

  const showPage = () => {
    const cur = images[page];
    if (!cur) return;
    img.src = cur.dataUrl;
    img.hidden = false;
    dl.href = cur.dataUrl;
    dl.setAttribute('download', `${fileBase}${images.length > 1 ? `-${page + 1}` : ''}.png`);
    dots.hidden = images.length < 2;
    dots.innerHTML = images.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('');
  };

  const render = async () => {
    const key = `${kind}|${opt.background}|${opt.hideStrokes ? 1 : 0}`;
    const my = ++seq;
    busy.hidden = false;
    try {
      if (!cache.has(key)) cache.set(key, await build(kind, { ...opt }));
      if (my !== seq) return;
      images = cache.get(key) || [];
      page = 0;
      if (isText()) { showText(images[0]?.text || ''); }
      else { showImages(); showPage(); }
      busy.hidden = true;
    } catch (err) {
      console.warn('[share] build failed', err);
      if (my !== seq) return;
      busy.hidden = true;
      showToast?.(t('tnShareFail'), 'error');
    }
  };

  overlay.querySelectorAll('[data-shs-kind]').forEach(b => b.onclick = () => {
    if (!isText()) imageCaption = cap.value;
    kind = b.dataset.shsKind;
    overlay.querySelectorAll('[data-shs-kind]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
  overlay.querySelectorAll('[data-shs-bg]').forEach(b => b.onclick = () => {
    opt.background = b.dataset.shsBg;
    overlay.querySelectorAll('[data-shs-bg]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
  overlay.querySelectorAll('[data-shs-toggle]').forEach(b => b.onclick = () => {
    opt.hideStrokes = !opt.hideStrokes;
    b.classList.toggle('active', opt.hideStrokes);
    render();
  });
  // Swipe or tap through a carousel's pages.
  img.addEventListener('click', () => { if (images.length > 1) { page = (page + 1) % images.length; showPage(); } });

  q('[data-shs="close"]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); showToast?.(`📋 ${t('copied')}`, 'success'); }
    catch (_) { cap.focus(); cap.select(); }
  };
  viberBtn.onclick = () => {
    window.open(`viber://forward?text=${encodeURIComponent(cap.value.trim())}`, '_blank');
  };
  copyBtn.onclick = () => copyText(cap.value.trim());

  q('[data-shs="share"]').onclick = async () => {
    if (!images.length) return;
    const text = q('[data-shs="caption"]').value.trim();
    if (isText()) {
      if (navigator.share) {
        try { await navigator.share({ title, text }); close(); return; }
        catch (err) { if (err?.name === 'AbortError') return; console.warn('[share] share failed', err); }
      }
      await copyText(text);
      return;
    }
    const files = images.map((im, i) => {
      try { return new File([im.blob], `${fileBase}${images.length > 1 ? `-${i + 1}` : ''}.png`, { type: 'image/png' }); }
      catch (_) { return null; }
    }).filter(Boolean);
    if (files.length && canShareFiles(files)) {
      try {
        await navigator.share({ files, title, text });
        close();
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('[share] share failed', err);
      }
    }
    // No share sheet here: the download link is the way, and say so once.
    note.textContent = t('shNoShare');
    note.hidden = false;
    dl.classList.remove('btn-outline');
    dl.classList.add('btn-primary');
  };

  render();
  return close;
}
