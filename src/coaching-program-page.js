// src/coaching-program-page.js
// A coach's programs («Сургалт») as the app shows them:
//
//   #/coaching/p/:coachId/:id   one program — poster, what it is, its prices; «Бүртгүүлэх»
//   #/coaching/new              a coach makes one, in four steps
//   #/coaching/edit/:id         … or changes one of their own
//
// and the pieces the other coaching pages borrow: the program card, and the
// «Миний сургалтууд» block of the coach's desk. The shapes and the writes are
// in coaching-programs.js, the reads and writes in store.js, who may write
// what in database.rules.json. docs/coaching.md.
//
// ctx is the same as coaching-page.js's.

import * as store from './store.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { readImageFile, validImageData } from './media.js';
import { isCoach, dayKey } from './coaching.js';
import {
  LEVELS, MAX_OPTIONS, PEOPLE_MAX, POSTER_MAX_CHARS, THUMB_MAX_CHARS,
  programId, programErrors, optionList, fromPrice, programList, enrollmentList,
} from './coaching-programs.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString()}₮` : '');
const priceText = (n) => money(n) || t('cpAsk');
const fullName = (u) => store.memberName(u) || u?.username || u?.name || '—';
const LEVEL_KEY = { all: 'cpLevelAll', beginner: 'cpLevelBeginner', intermediate: 'cpLevelIntermediate', advanced: 'cpLevelAdvanced' };
const levelText = (level) => t(LEVEL_KEY[level] || 'cpLevelAll');
const programHash = (coachId, id) => `#/coaching/p/${encodeURIComponent(coachId)}/${encodeURIComponent(id)}`;
const spinner = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
const backTo = (hash) => `<a href="${hash}" class="back-link">${icon('back', { size: 16 })} ${t('back')}</a>`;
const nothing = (ctx, hash, text) => {
  ctx.main().innerHTML = `<div class="detail-container fade-in">${backTo(hash)}
    <div class="empty-state"><p>${icon('bookings', { size: 40 })}</p><p>${text}</p></div></div>`;
};

/** One program as a row: thumbnail, name, whose it is, from what price. `p` carries coachId and id. */
export function programCardHTML(p, coach, ctx) {
  const from = fromPrice(p);
  const sub = [coach ? ctx.displayUsername(coach) : '', p.level && p.level !== 'all' ? esc(levelText(p.level)) : '']
    .filter(Boolean).join(' · ');
  return `
    <a href="${programHash(p.coachId, p.id)}" class="co-prog">
      <div class="co-prog-thumb">${validImageData(p.thumb) ? `<img src="${p.thumb}" alt="" loading="lazy" />` : icon('bookings', { size: 26 })}</div>
      <div class="co-prog-body">
        <div class="co-prog-title">${esc(p.title)}</div>
        ${sub ? `<div class="lr-sub">${sub}</div>` : ''}
        <div class="co-prog-price">${from
          ? (optionList(p).length > 1 ? t('cpFrom').replace('{p}', money(from)) : money(from))
          : t('coPriceAsk')}</div>
      </div>
      <span class="lr-chev">${icon('next', { size: 18 })}</span>
    </a>`;
}

// ---- #/coaching/p/:coachId/:id ----
export async function renderProgramPage(coachId, id, ctx) {
  ctx.main().innerHTML = spinner;
  const me = ctx.user;
  const [coaches, coach, program, mine] = await Promise.all([
    store.loadCoaches(), store.loadUserById(coachId), store.loadCoachProgram(coachId, id),
    store.loadMyEnrollment(coachId, id, me.id),
  ]);
  if (!ctx.alive()) return;
  const own = me.id === coachId;
  // A hidden program, or one of a coach who is switched off, is still there
  // for its coach, for an admin, and for a member who has already asked to join.
  const open = !!program && program.active === true && isCoach(coaches, coachId);
  if (!program || !program.title || !coach || !(open || own || mine || me.role === 'admin')) {
    return nothing(ctx, '#/coaching', t('cpNotFound'));
  }
  const options = optionList(program);
  const people = Number(program.people) || 1;

  const action = own
    ? `<div class="co-hint" style="margin-top:14px;">${t('cpOwn')}</div>
       <div class="co-actions"><a href="#/coaching/edit/${encodeURIComponent(id)}" class="btn btn-outline btn-sm">${t('cpEdit')}</a>
         <a href="#/coaching/me" class="btn btn-ghost btn-sm">${t('coMyDesk')} ${icon('next', { size: 15 })}</a></div>`
    : mine
      ? `<div class="cp-joined">
           <b>${t('cpYouJoined').replace('{o}', esc(mine.label) + (mine.price ? ' · ' + money(mine.price) : ''))}</b>
           <span>${t('cpCoachWillCall')}${coach.phone ? ` <a href="tel:${esc(coach.phone)}">${esc(coach.phone)}</a>` : ''}</span>
         </div>
         <button class="btn btn-outline btn-sm" id="cp-leave" style="margin-top:10px;">${t('cpLeave')}</button>`
      : open
        ? `<button class="btn btn-primary" id="cp-join" style="margin-top:14px;width:100%;justify-content:center;">${t('cpJoin')}</button>`
        : '';

  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      ${backTo('#/coaching')}
      ${program.hasPoster ? `<button type="button" class="cp-poster" id="cp-poster" aria-label="${esc(program.title)}">${
        validImageData(program.thumb) ? `<img src="${program.thumb}" alt="" class="soft" />` : ''}</button>` : ''}
      <h2 class="page-title" style="font-size:1.45rem;margin-top:14px;">${esc(program.title)}</h2>
      <div class="cp-meta">
        <a href="#/coaching/c/${encodeURIComponent(coachId)}" class="cp-coach">${esc(fullName(coach))}</a>
        ${program.level && program.level !== 'all' ? `<span class="cp-pill">${esc(levelText(program.level))}</span>` : ''}
        ${open ? '' : `<span class="cp-pill off">${t('cpHidden')}</span>`}
      </div>
      ${program.summary ? `<p class="co-bio">${esc(program.summary)}</p>` : ''}
      <h3 class="section-title" style="margin:18px 0 10px;">${t('cpPrices')}</h3>
      <div class="cp-opts">
        ${options.map((o, i) => `
          <label class="cp-opt">
            <input type="radio" name="cp-opt" value="${i}" ${i === 0 ? 'checked' : ''} ${own || mine || !open ? 'disabled' : ''} />
            <span>${esc(o.label)}</span><b>${priceText(o.price)}</b>
          </label>`).join('')}
      </div>
      ${people > 1 ? `<p class="co-hint" style="margin-top:8px;">${t('cpPeople').replace('{n}', people)}</p>` : ''}
      <p class="co-pay-note">${t('coPayNote')}</p>
      ${action}
    </div>`;

  const view = ctx.main();
  const again = () => renderProgramPage(coachId, id, ctx);

  // The poster comes on its own: the page is there first, the picture when it has loaded.
  if (program.hasPoster) {
    store.loadCoachPoster(coachId, id).then((src) => {
      const box = view.querySelector('#cp-poster');
      if (!ctx.alive() || !box || !validImageData(src)) return;
      box.innerHTML = `<img src="${src}" alt="" />`;
      box.onclick = () => showPoster(src);
    });
  }

  view.querySelector('#cp-join')?.addEventListener('click', () => {
    const index = Number(view.querySelector('input[name="cp-opt"]:checked')?.value || 0);
    joinDialog(ctx, { coachId, id, coach, program, option: options[index], index, done: again });
  });
  view.querySelector('#cp-leave')?.addEventListener('click', async () => {
    if (!confirm(t('cpLeaveConfirm'))) return;
    try { await store.leaveProgram(coachId, id, me.id); } catch (err) {
      console.warn('leave program:', err?.message || err);
      ctx.showToast(t('coCancelFailed'), 'error');
      return;
    }
    ctx.showToast(t('cpLeft'), 'success');
    ctx.notify(coachId, t('cpNtfLeft'), `${fullName(me)} · ${program.title}`, '#/coaching/me');
    again();
  });
}

function showPoster(src) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in cp-lightbox';
  modal.innerHTML = `<img src="${src}" alt="" />`;
  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
}

function joinDialog(ctx, { coachId, id, coach, program, option, index, done }) {
  const me = ctx.user;
  if (!option) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:420px;">
      <h3 class="modal-title" style="margin-bottom:14px;">${t('cpJoinTitle')}</h3>
      <div class="co-book-what">
        <div><b>${esc(program.title)}</b></div>
        <div>${esc(fullName(coach))}</div>
        <div>${esc(option.label)} · <span class="co-book-price">${priceText(option.price)}</span></div>
      </div>
      <div class="input-group" style="margin-top:14px;">
        <label>${t('coNote')}</label>
        <input type="text" id="cp-note" maxlength="300" placeholder="${esc(t('cpNotePh'))}" />
      </div>
      <p class="co-pay-note">${t('cpJoinHint')} ${t('coPayNote')}</p>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-ghost" id="cp-no">${t('cancel')}</button>
        <button class="btn btn-primary" id="cp-yes">${t('cpJoin')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#cp-no').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#cp-yes').onclick = async () => {
    modal.querySelector('#cp-yes').disabled = true;
    try {
      await store.enrollInProgram(coachId, id, me.id, program, index, modal.querySelector('#cp-note').value);
    } catch (err) {
      console.warn('join program:', err?.message || err);
      close();
      ctx.showToast(t('cpJoinFailed'), 'error');
      if (ctx.alive()) done();
      return;
    }
    close();
    ctx.showToast(t('cpJoined'), 'success');
    ctx.notify(coachId, t('cpNtfJoined'), `${fullName(me)} · ${program.title} · ${option.label}`, '#/coaching/me');
    if (ctx.alive()) done();
  };
}

// ---- The coach's desk: «Миний сургалтууд» ----
/** The block's markup. `programs` is coachPrograms/{me}; `asked` is coachEnrollments/{me}. */
export function deskProgramsHTML(programs, asked, byId, ctx) {
  const me = ctx.user;
  const list = programList(programs, { all: true });
  return `
    <div class="glass-card co-card" style="margin-top:18px;">
      <div class="cp-desk-head">
        <h3 class="co-card-title" style="margin:0;">${t('cpMine')}</h3>
        <a href="#/coaching/new" class="btn btn-primary btn-sm">${t('cpAdd')}</a>
      </div>
      ${list.length ? list.map(p => {
        const who = enrollmentList((asked || {})[p.id]);
        return `
        <div class="cp-desk-prog">
          <div class="cp-desk-row">
            <a href="${programHash(me.id, p.id)}" class="cp-desk-title">${esc(p.title)}</a>
            <span class="cp-pill ${p.active ? 'on' : 'off'}">${t(p.active ? 'cpShown' : 'cpHidden')}</span>
          </div>
          <div class="co-hint">${t('cpAsked').replace('{n}', who.length)}</div>
          <div class="co-actions">
            <a href="#/coaching/edit/${encodeURIComponent(p.id)}" class="btn btn-outline btn-sm">${t('cpEdit')}</a>
            <button class="btn btn-outline btn-sm cp-toggle" data-id="${esc(p.id)}" data-on="${p.active ? 1 : 0}">${t(p.active ? 'cpHide' : 'cpShow')}</button>
            <button class="btn btn-ghost btn-sm cp-del" data-id="${esc(p.id)}">${t('cpDelete')}</button>
          </div>
          ${who.map(e => {
            const u = byId.get(e.playerId);
            return `<div class="co-row"><span class="co-row-what">
              <b>${esc(u ? fullName(u) : e.playerId)}</b>${u?.phone ? ` · <a href="tel:${esc(u.phone)}">${esc(u.phone)}</a>` : ''}
              · ${esc(e.label)}${e.price ? ' · ' + money(e.price) : ''}${e.at ? ` · ${esc(ctx.formatDate(dayKey(e.at)))}` : ''}
              ${e.note ? `<span class="co-note">«${esc(e.note)}»</span>` : ''}</span>
              <button class="btn btn-ghost btn-sm cp-drop" data-id="${esc(p.id)}" data-player="${esc(e.playerId)}" title="${esc(t('cpDropTitle'))}">${icon('close', { size: 15 })}</button></div>`;
          }).join('')}
        </div>`;
      }).join('') : `<p class="co-hint" style="margin-top:10px;">${t('cpNone')}</p>`}
    </div>`;
}

/** Wires the block's buttons. `again` redraws the desk. */
export function wireDeskPrograms(view, programs, asked, byId, ctx, again) {
  const me = ctx.user;
  const refused = (what, err) => { console.warn(what, err?.message || err); ctx.showToast(t('coSaveFailed'), 'error'); };
  const titleOf = (id) => String((programs || {})[id]?.title || '');

  view.querySelectorAll('.cp-toggle').forEach(btn => btn.addEventListener('click', async () => {
    try { await store.publishCoachProgram(me.id, btn.dataset.id, btn.dataset.on !== '1'); } catch (err) { return refused('publish program:', err); }
    again();
  }));

  view.querySelectorAll('.cp-del').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const who = enrollmentList((asked || {})[id]);
    if (!confirm(t('cpDeleteConfirm').replace('{t}', titleOf(id)).replace('{n}', who.length))) return;
    try { await store.removeCoachProgram(me.id, id); } catch (err) { return refused('remove program:', err); }
    ctx.showToast(t('cpDeleted'), 'success');
    for (const e of who) ctx.notify(e.playerId, t('cpNtfRemoved'), titleOf(id));
    again();
  }));

  view.querySelectorAll('.cp-drop').forEach(btn => btn.addEventListener('click', async () => {
    const { id, player } = btn.dataset;
    const u = byId.get(player);
    if (!confirm(t('cpDropConfirm').replace('{n}', u ? fullName(u) : player))) return;
    try { await store.leaveProgram(me.id, id, player); } catch (err) { return refused('drop request:', err); }
    ctx.showToast(t('cpDropped'), 'success');
    ctx.notify(player, t('cpNtfDropped'), titleOf(id));
    again();
  }));
}

// ---- #/coaching/new, #/coaching/edit/:id — four steps ----
// What is typed lives on this draft, so a step drawn again never loses it;
// nothing is written until the last step's button.
let draft = null;
const STEPS = ['cwStep1', 'cwStep2', 'cwStep3', 'cwStep4'];

function newDraft(id, existing) {
  const options = existing ? optionList(existing).map(o => ({ label: o.label, price: o.price || '' })) : [];
  return {
    key: id || 'new', id: id || null, existing: existing || null, step: 1,
    title: existing?.title || '', level: LEVELS.includes(existing?.level) ? existing.level : 'all',
    summary: existing?.summary || '', people: Number(existing?.people) || 1,
    options: options.length ? options : [{ label: '', price: '' }],
    // The poster: undefined — as stored; null — taken away; a data URI — a new one.
    poster: undefined, thumb: null,
    preview: existing && validImageData(existing.thumb) ? existing.thumb : null,
  };
}

// A picked picture → small enough to store: smaller and plainer until it fits.
async function shrink(file, tries, maxChars) {
  for (const mime of ['image/webp', 'image/jpeg']) {
    for (const [px, quality] of tries) {
      try { return await readImageFile(file, { px, maxChars, mime, quality }); }
      catch (err) { if (err?.message !== 'too-big') throw err; }
    }
  }
  throw new Error('too-big');
}
const POSTER_TRIES = [[1400, 0.82], [1200, 0.78], [1000, 0.72], [800, 0.65]];
const THUMB_TRIES = [[360, 0.72], [280, 0.65], [200, 0.6]];

export async function renderProgramWizard(id, ctx) {
  ctx.main().innerHTML = spinner;
  const me = ctx.user;
  const coaches = await store.loadCoaches();
  if (!ctx.alive()) return;
  if (!isCoach(coaches, me.id)) return nothing(ctx, '#/coaching', t('coNotCoachMe'));
  const key = id || 'new';
  if (!draft || draft.key !== key) {
    const existing = id ? await store.loadCoachProgram(me.id, id) : null;
    if (!ctx.alive()) return;
    if (id && !existing) return nothing(ctx, '#/coaching/me', t('cpNotFound'));
    draft = newDraft(id, existing);
    // The stored poster, for the first step to show — unless a new one is picked meanwhile.
    if (existing?.hasPoster) {
      const d = draft;
      store.loadCoachPoster(me.id, id).then((src) => {
        if (draft !== d || d.poster !== undefined || !validImageData(src)) return;
        d.preview = src;
        if (ctx.alive() && d.step === 1) paintWizard(ctx);
      });
    }
  }
  paintWizard(ctx);
}

function stepHTML(d) {
  if (d.step === 1) {
    return `
      <p class="co-hint">${t('cwPosterHint')}</p>
      <div class="cw-poster">${d.preview ? `<img src="${d.preview}" alt="" />`
        : `<div class="cw-poster-empty">${icon('bookings', { size: 34 })}<span>${t('cwNoPoster')}</span></div>`}</div>
      <input type="file" id="cw-file" accept="image/*" hidden />
      <div class="co-actions" style="justify-content:center;">
        <button class="btn btn-outline btn-sm" id="cw-pick">${t(d.preview ? 'cwChange' : 'cwPick')}</button>
        ${d.preview ? `<button class="btn btn-ghost btn-sm" id="cw-unpick">${t('cwRemovePoster')}</button>` : ''}
      </div>`;
  }
  if (d.step === 2) {
    return `
      <div class="input-group"><label>${t('cwTitle')}</label>
        <input type="text" id="cw-title" maxlength="80" value="${esc(d.title)}" placeholder="${esc(t('cwTitlePh'))}" /></div>
      <div class="input-group" style="margin-top:12px;"><label>${t('cwLevel')}</label>
        <div class="chip-row chip-wrap" id="cw-levels">${LEVELS.map(l =>
          `<button type="button" class="seg-chip${d.level === l ? ' active' : ''}" data-level="${l}">${esc(levelText(l))}</button>`).join('')}</div></div>
      <div class="input-group" style="margin-top:12px;"><label>${t('cwSummary')}</label>
        <textarea id="cw-summary" rows="5" maxlength="1000" class="co-textarea" placeholder="${esc(t('cwSummaryPh'))}">${esc(d.summary)}</textarea></div>`;
  }
  if (d.step === 3) {
    return `
      <p class="co-hint">${t('cwPricesHint')}</p>
      <div id="cw-opts">${d.options.map((o, i) => `
        <div class="cw-opt" data-i="${i}">
          <input type="text" class="cw-opt-label" maxlength="40" value="${esc(o.label)}" placeholder="${esc(t('cwOptLabel'))}" />
          <input type="text" class="cw-opt-price" inputmode="numeric" value="${esc(o.price)}" placeholder="${esc(t('cwOptPrice'))}" />
          <button type="button" class="btn btn-ghost btn-sm cw-opt-del" title="${esc(t('cpDelete'))}">${icon('close', { size: 15 })}</button>
        </div>`).join('')}</div>
      ${d.options.length < MAX_OPTIONS ? `
        <div class="cw-quick">
          ${[t('cwQuickTrial'), ...[3, 5, 10].map(n => t('cwQuickLessons').replace('{n}', n)), t('cwQuickMonth')]
            .map(label => `<button type="button" class="seg-chip cw-add" data-label="${esc(label)}">+ ${esc(label)}</button>`).join('')}
          <button type="button" class="seg-chip cw-add" data-label="">${t('cwAddRow')}</button>
        </div>` : `<p class="co-hint">${t('cwMaxRows').replace('{n}', MAX_OPTIONS)}</p>`}
      <div class="input-group" style="margin-top:14px;max-width:220px;"><label>${t('cwPeople')}</label>
        <select id="cw-people" class="co-textarea">${Array.from({ length: PEOPLE_MAX }, (_, i) => i + 1)
          .map(n => `<option value="${n}" ${n === d.people ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  }
  const options = optionList({ options: d.options });
  return `
    <p class="co-hint">${t('cwReview')}</p>
    <div class="cw-review">
      ${d.preview ? `<div class="cw-poster small"><img src="${d.preview}" alt="" /></div>` : ''}
      <h3 style="margin:10px 0 4px;">${esc(d.title.trim()) || '—'}</h3>
      ${d.level !== 'all' ? `<span class="cp-pill">${esc(levelText(d.level))}</span>` : ''}
      ${d.summary.trim() ? `<p class="co-bio">${esc(d.summary.trim())}</p>` : ''}
      <div class="cp-opts" style="margin-top:10px;">${options.map(o =>
        `<div class="cp-opt"><span>${esc(o.label)}</span><b>${priceText(o.price)}</b></div>`).join('') || `<div class="co-hint">${t('cwNeedOption')}</div>`}</div>
      ${d.people > 1 ? `<p class="co-hint" style="margin-top:8px;">${t('cpPeople').replace('{n}', d.people)}</p>` : ''}
    </div>`;
}

function paintWizard(ctx) {
  const d = draft;
  const last = d.step === STEPS.length;
  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      ${backTo('#/coaching/me')}
      <div class="page-head" style="margin-top:12px;"><div>
        <h2 class="page-title">${t(d.id ? 'cwEdit' : 'cwNew')}</h2>
      </div></div>
      <div class="cw-steps">${STEPS.map((k, i) =>
        `<span class="cw-step${i + 1 === d.step ? ' on' : i + 1 < d.step ? ' done' : ''}"><i>${i + 1}</i>${t(k)}</span>`).join('')}</div>
      <div class="glass-card co-card">${stepHTML(d)}</div>
      <div class="cw-foot">
        <button class="btn btn-ghost" id="cw-discard">${t('cwDiscard')}</button>
        <span style="flex:1;"></span>
        ${d.step > 1 ? `<button class="btn btn-outline" id="cw-prev">${t('back')}</button>` : ''}
        ${last ? `<button class="btn btn-outline" id="cw-hide">${t('cwSaveHidden')}</button>
                  <button class="btn btn-primary" id="cw-publish">${t('cwPublish')}</button>`
          : `<button class="btn btn-primary" id="cw-next">${t('cwNext')}</button>`}
      </div>
    </div>`;
  const view = ctx.main();
  const $ = (sel) => view.querySelector(sel);
  const go = (step) => { d.step = step; paintWizard(ctx); window.scrollTo(0, 0); };

  $('#cw-discard').onclick = () => { draft = null; location.hash = '#/coaching/me'; };
  if ($('#cw-prev')) $('#cw-prev').onclick = () => go(d.step - 1);
  if ($('#cw-next')) $('#cw-next').onclick = () => {
    if (d.step === 2 && !d.title.trim()) { ctx.showToast(t('cwNeedTitle'), 'error'); return; }
    if (d.step === 3 && programErrors(d).includes('options')) { ctx.showToast(t('cwNeedOption'), 'error'); return; }
    go(d.step + 1);
  };
  if (last) {
    $('#cw-publish').onclick = () => saveDraft(ctx, true);
    $('#cw-hide').onclick = () => saveDraft(ctx, false);
  }

  if (d.step === 1) {
    $('#cw-pick').onclick = () => $('#cw-file').click();
    $('#cw-file').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      $('#cw-pick').disabled = true;
      try {
        const poster = await shrink(file, POSTER_TRIES, POSTER_MAX_CHARS);
        const thumb = await shrink(file, THUMB_TRIES, THUMB_MAX_CHARS);
        if (draft !== d) return;
        Object.assign(d, { poster, thumb, preview: poster });
      } catch (err) {
        ctx.showToast(t(err?.message === 'too-big' ? 'cwPosterBig' : 'cwPosterBad'), 'error');
      }
      if (draft === d && ctx.alive()) paintWizard(ctx);
    };
    if ($('#cw-unpick')) $('#cw-unpick').onclick = () => {
      // Taken away: a stored one is cleared at save; a program that never had one just has none.
      Object.assign(d, { poster: d.existing?.hasPoster ? null : undefined, thumb: null, preview: null });
      paintWizard(ctx);
    };
  }
  if (d.step === 2) {
    $('#cw-title').oninput = (e) => { d.title = e.target.value; };
    $('#cw-summary').oninput = (e) => { d.summary = e.target.value; };
    view.querySelectorAll('#cw-levels .seg-chip').forEach(b => { b.onclick = () => { d.level = b.dataset.level; paintWizard(ctx); }; });
  }
  if (d.step === 3) {
    view.querySelectorAll('.cw-opt').forEach(row => {
      const i = Number(row.dataset.i);
      row.querySelector('.cw-opt-label').oninput = (e) => { d.options[i].label = e.target.value; };
      row.querySelector('.cw-opt-price').oninput = (e) => { d.options[i].price = e.target.value; };
      row.querySelector('.cw-opt-del').onclick = () => {
        d.options.splice(i, 1);
        if (!d.options.length) d.options.push({ label: '', price: '' });
        paintWizard(ctx);
      };
    });
    view.querySelectorAll('.cw-add').forEach(b => { b.onclick = () => {
      // A quick name fills the first empty row before it adds another.
      const empty = d.options.find(o => !String(o.label).trim() && !String(o.price).trim());
      if (empty && b.dataset.label) empty.label = b.dataset.label;
      else if (d.options.length < MAX_OPTIONS) d.options.push({ label: b.dataset.label, price: '' });
      paintWizard(ctx);
      const rows = ctx.main().querySelectorAll('.cw-opt');
      const at = empty && b.dataset.label ? d.options.indexOf(empty) : rows.length - 1;
      rows[at]?.querySelector(b.dataset.label ? '.cw-opt-price' : '.cw-opt-label')?.focus();
    }; });
    $('#cw-people').onchange = (e) => { d.people = Number(e.target.value) || 1; };
  }
}

async function saveDraft(ctx, active) {
  const d = draft;
  const me = ctx.user;
  const missing = programErrors(d);
  if (missing.length) {
    ctx.showToast(t(missing[0] === 'title' ? 'cwNeedTitle' : 'cwNeedOption'), 'error');
    d.step = missing[0] === 'title' ? 2 : 3;
    paintWizard(ctx);
    return;
  }
  const id = d.id || programId();
  ctx.main().querySelectorAll('.cw-foot button').forEach(b => { b.disabled = true; });
  try {
    await store.saveCoachProgram(me.id, id, { ...d, active }, { poster: d.poster, thumb: d.thumb, existing: d.existing });
  } catch (err) {
    console.warn('save program:', err?.message || err);
    ctx.showToast(t('coSaveFailed'), 'error');
    if (ctx.alive()) paintWizard(ctx);
    return;
  }
  draft = null;
  ctx.showToast(t(active ? 'cpPublished' : 'cpSavedHidden'), 'success');
  location.hash = programHash(me.id, id);
}
