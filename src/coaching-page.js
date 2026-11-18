// src/coaching-page.js
// Coaching, as a member sees it:
//
//   #/coaching           the coaches and their programs, and what I have booked or joined
//   #/coaching/c/:id     one coach — their programs and open times; tap a time to book it
//   #/coaching/me        a coach's own desk: opening times, who booked, programs, profile
//   #/coaching/p/…, /new, /edit/…   a program and the steps that make one — coaching-program-page.js
//
// The shapes and the arithmetic are in coaching.js, the reads and writes in
// store.js, who may write what in database.rules.json. docs/coaching.md.
//
// ctx (from app.js): { main, user, alive, showToast, formatDate, avatarInner,
//                      displayUsername, notify(memberId, title, body) }
//
// Names: a list row shows the username (ctx.displayUsername, as every member
// list does); the full name is for a detail — the coach's own page, the
// booking, the coach's desk and the notice to the other of the two.

import * as store from './store.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import {
  SLOT_MINUTES, CANCEL_HOURS, isCoach, priceOf, canPlayerCancel,
  slotList, upcoming, openSlots, dayKey, timeText, byDay, myLessons,
  REPEAT_WEEKS, newSlotsRepeat, weeklySeries, changeTarget, momentOf,
} from './coaching.js';
import { allPrograms, programList } from './coaching-programs.js';
import {
  programCardHTML, renderProgramPage, renderProgramWizard, deskProgramsHTML, wireDeskPrograms,
} from './coaching-program-page.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString()}₮` : '');
const spinner = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
const nameOf = (u) => store.memberName(u) || u?.username || u?.name || '—';
const listKey = (u) => String(u?.username || u?.name || '').toLowerCase();
const whenText = (ctx, start) => `${ctx.formatDate(dayKey(start))} ${timeText(start)}`;
const minText = (m) => `${m} ${t('coMin')}`;
// «4 долоо хоног (1 сар)» — a month is four weeks to the eye.
const weeksText = (n) => t('coWeeks').replace('{n}', n) + (n % 4 === 0 ? ` (${t('coMonths').replace('{n}', n / 4)})` : '');
const pricesText = (profile) => SLOT_MINUTES
  .map(m => (priceOf(profile, m) ? `${minText(m)} ${money(priceOf(profile, m))}` : ''))
  .filter(Boolean).join(' · ');

const avatar = (ctx, u) => `<span class="player-avatar-sm" style="flex-shrink:0;">${
  ctx.avatarInner(u?.avatar, String(u?.username || u?.name || '?').charAt(0).toUpperCase())}</span>`;

export async function renderCoachingPage(sub, ctx) {
  ctx.main().innerHTML = spinner;
  if (sub === 'me') return renderDesk(ctx);
  if (sub === 'new') return renderProgramWizard(null, ctx);
  if (sub.startsWith('edit/')) return renderProgramWizard(decodeURIComponent(sub.slice(5)), ctx);
  if (sub.startsWith('p/')) {
    const [coachId, id] = sub.slice(2).split('/').map(decodeURIComponent);
    return renderProgramPage(coachId, id || '', ctx);
  }
  if (sub.startsWith('c/')) return renderCoach(decodeURIComponent(sub.slice(2)), ctx);
  return renderHome(ctx);
}

// ---- #/coaching ----
async function renderHome(ctx) {
  const me = ctx.user;
  const [coaches, users, allSlots, lessons, byCoach, joined] = await Promise.all([
    store.loadCoaches(), store.loadAllUsers(), store.loadAllCoachSlots(), store.loadPlayerLessons(me.id),
    store.loadAllCoachPrograms(), store.loadPlayerPrograms(me.id),
  ]);
  if (!ctx.alive()) return;
  const byId = new Map((users || []).map(u => [u.id, u]));
  const now = Date.now();

  // Programs: the ones I have asked to join (hidden since or not), then every published one.
  const card = (p) => programCardHTML(p, byId.get(p.coachId), ctx);
  const mineP = Object.values(joined || {})
    .map(j => ({ j, p: j && ((byCoach || {})[j.coachId] || {})[j.programId] }))
    .filter(x => x.p && x.p.title)
    .sort((a, b) => (Number(b.j.at) || 0) - (Number(a.j.at) || 0))
    .map(x => ({ coachId: x.j.coachId, id: x.j.programId, ...x.p }));
  const programs = allPrograms(byCoach, (id) => isCoach(coaches, id) && byId.has(id));
  const joinedHTML = mineP.length
    ? `<h3 class="section-title" style="margin:18px 0 10px;">${t('cpMyPrograms')}</h3>${mineP.map(card).join('')}` : '';
  const programsHTML = programs.length
    ? `<h3 class="section-title" style="margin:18px 0 10px;">${t('cpPrograms')}</h3>${programs.map(card).join('')}` : '';

  const mine = myLessons(lessons, allSlots, now);
  // What I have asked each coach to change, lesson by lesson.
  const asked = await Promise.all(mine.map(l => (l.gone ? null : store.loadMyChange(l.coachId, l.slotId))));
  if (!ctx.alive()) return;
  mine.forEach((l, i) => { l.want = asked[i] && Number(asked[i].wantStart) > 0 ? asked[i] : null; });
  const lessonsHTML = mine.length ? `
    <h3 class="section-title" style="margin:18px 0 10px;">${t('coMyLessons')}</h3>
    ${mine.map(l => {
      const coach = byId.get(l.coachId);
      const what = `${esc(whenText(ctx, l.start))} · ${minText(l.minutes)}${l.price ? ' · ' + money(l.price) : ''}`;
      const at = `data-coach="${esc(l.coachId)}" data-slot="${esc(l.slotId)}"`;
      const action = l.gone
        ? `<div class="co-hint">${t('coGone')}</div>
           <button class="btn btn-outline btn-sm co-drop" data-key="${esc(l.key)}">${t('coRemove')}</button>`
        : `${l.want
            ? `<div class="co-hint co-wide">${t('coMovePending').replace('{w}', esc(whenText(ctx, l.want.wantStart)))}</div>
               <button class="btn btn-outline btn-sm co-unask" ${at}>${t('coMoveUnask')}</button>`
            : `<button class="btn btn-outline btn-sm co-move" ${at}>${t('coMove')}</button>`}
           ${canPlayerCancel(l.start, now)
            ? `<button class="btn btn-ghost btn-sm co-cancel" ${at}>${t('coCancelLesson')}</button>`
            : `<div class="co-hint co-wide">${t('coTooLate')}${coach?.phone ? ` <a href="tel:${esc(coach.phone)}">${esc(coach.phone)}</a>` : ''}</div>`}`;
      return `
        <div class="list-row co-lesson">
          ${avatar(ctx, coach)}
          <div class="lr-body">
            <div class="lr-title">${ctx.displayUsername(coach)}</div>
            <div class="lr-sub">${what}</div>
            <div class="co-actions">${action}</div>
          </div>
        </div>`;
    }).join('')}` : '';

  const active = Object.keys(coaches || {}).filter(id => isCoach(coaches, id) && byId.has(id))
    .map(id => {
      const open = openSlots(slotList(allSlots[id]), now);
      return { id, user: byId.get(id), profile: coaches[id], next: open[0] || null, open: open.length };
    })
    .sort((a, b) => (a.next ? a.next.start : Infinity) - (b.next ? b.next.start : Infinity)
      || listKey(a.user).localeCompare(listKey(b.user)));

  const coachesHTML = active.length ? active.map(c => `
    <a href="#/coaching/c/${encodeURIComponent(c.id)}" class="list-row co-coach">
      ${avatar(ctx, c.user)}
      <div class="lr-body">
        <div class="lr-title">${ctx.displayUsername(c.user)}</div>
        <div class="lr-sub">${esc([c.profile.place, pricesText(c.profile)].filter(Boolean).join(' · ') || t('coPriceAsk'))}</div>
        <div class="co-next ${c.next ? '' : 'none'}">${c.next
          ? `${t('coNextFree')}: ${esc(whenText(ctx, c.next.start))}${c.open > 1 ? ` <span class="co-more">+${c.open - 1}</span>` : ''}`
          : t('coNoFree')}</div>
      </div>
      <span class="lr-chev">${icon('next', { size: 18 })}</span>
    </a>`).join('')
    : `<div class="empty-state"><p>${icon('handicap', { size: 40 })}</p><p>${t('coNoCoaches')}</p></div>`;

  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      <a href="#/services" class="back-link">${icon('back', { size: 16 })} ${t('back')}</a>
      <div class="page-head" style="margin-top:12px;"><div>
        <h2 class="page-title">${t('coTitle')}</h2>
        <p class="page-sub">${t('coSub')}</p>
      </div></div>
      ${isCoach(coaches, me.id) ? `
        <a href="#/coaching/me" class="list-row co-desk-link">
          <div class="tile-icon">${icon('time', { size: 20 })}</div>
          <div class="lr-body"><div class="lr-title">${t('coMyDesk')}</div><div class="lr-sub">${t('coMyDeskSub')}</div></div>
          <span class="lr-chev">${icon('next', { size: 18 })}</span>
        </a>` : ''}
      ${lessonsHTML}
      ${joinedHTML}
      ${programsHTML}
      <h3 class="section-title" style="margin:18px 0 10px;">${t('coCoaches')}</h3>
      ${coachesHTML}
    </div>`;

  const again = () => renderHome(ctx);
  ctx.main().querySelectorAll('.co-cancel').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm(t('coCancelConfirm'))) return;
    const { coach, slot } = btn.dataset;
    const lesson = mine.find(l => l.coachId === coach && l.slotId === slot);
    btn.disabled = true;
    try {
      await store.cancelCoachBooking(coach, slot, me.id);
    } catch (err) {
      console.warn('cancel lesson:', err?.message || err);
      ctx.showToast(t('coCancelFailed'), 'error');
      btn.disabled = false;
      return;
    }
    ctx.showToast(t('coCancelled'), 'success');
    if (lesson) ctx.notify(coach, t('coNtfCancelled'), `${nameOf(me)} · ${whenText(ctx, lesson.start)}`);
    again();
  }));
  ctx.main().querySelectorAll('.co-move').forEach(btn => btn.addEventListener('click', () => {
    const lesson = mine.find(l => l.coachId === btn.dataset.coach && l.slotId === btn.dataset.slot);
    if (lesson) changeDialog(ctx, lesson, byId.get(lesson.coachId), slotList(allSlots[lesson.coachId]), again);
  }));
  ctx.main().querySelectorAll('.co-unask').forEach(btn => btn.addEventListener('click', async () => {
    try { await store.dropCoachChange(btn.dataset.coach, btn.dataset.slot); } catch (err) { console.warn('take back request:', err?.message || err); }
    again();
  }));
  ctx.main().querySelectorAll('.co-drop').forEach(btn => btn.addEventListener('click', async () => {
    try { await store.dropPlayerLesson(me.id, btn.dataset.key); } catch (err) { console.warn('drop lesson:', err?.message || err); }
    again();
  }));
}

// «Цаг солих»: one of the coach's open times is taken at once (while the
// lesson may still be cancelled); any other time is a request the coach grants.
function changeDialog(ctx, lesson, coach, slots, done) {
  const me = ctx.user;
  const now = Date.now();
  const free = byDay(openSlots(slots, now).filter(s => s.id !== lesson.slotId));
  const own = canPlayerCancel(lesson.start, now);       // may move it themselves
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:440px;">
      <h3 class="modal-title" style="margin-bottom:14px;">${t('coMoveTitle')}</h3>
      <div class="co-book-what">
        <div><b>${esc(nameOf(coach))}</b></div>
        <div>${esc(whenText(ctx, lesson.start))} · ${minText(lesson.minutes)}</div>
      </div>
      <h4 class="co-move-h">${t('coMovePick')}</h4>
      <div class="co-move-free">${free.length ? free.map(d => `
        <div class="co-day"><div class="co-day-name">${esc(ctx.formatDate(d.day))}</div>
          <div class="co-slots">${d.slots.map(s => `
            <button type="button" class="co-slot" data-slot="${esc(s.id)}"><b>${timeText(s.start)}</b><span>${minText(s.minutes)}</span></button>`).join('')}</div>
        </div>`).join('') : `<div class="co-hint">${t('coMoveNoOpen')}</div>`}</div>
      <h4 class="co-move-h">${t('coMoveOther')}</h4>
      <div class="co-form-row">
        <div class="input-group"><label>${t('coDate')}</label><input type="date" id="cm-date" min="${dayKey(now)}" /></div>
        <div class="input-group"><label>${t('coFrom')}</label><input type="time" id="cm-time" /></div>
      </div>
      <div class="input-group" style="margin-top:12px;">
        <label>${t('coNote')}</label>
        <input type="text" id="cm-note" maxlength="300" />
      </div>
      <p class="co-pay-note" id="cm-hint"></p>
      <div class="modal-actions" style="margin-top:12px;">
        <button class="btn btn-ghost" id="cm-no">${t('cancel')}</button>
        <button class="btn btn-primary" id="cm-yes"></button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = (sel) => modal.querySelector(sel);
  const close = () => modal.remove();
  $('#cm-no').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  let picked = null;                                     // an open slot, when one is chosen
  const direct = () => !!picked && own;                  // moved at once, with no one to ask
  const draw = () => {
    modal.querySelectorAll('.co-slot').forEach(b => b.classList.toggle('on', !!picked && b.dataset.slot === picked.id));
    $('#cm-hint').textContent = t(direct() ? 'coMoveNow' : 'coMoveAsk');
    $('#cm-yes').textContent = t(direct() ? 'coMoveDo' : 'coMoveSend');
  };
  modal.querySelectorAll('.co-slot').forEach(b => { b.onclick = () => {
    picked = slots.find(s => s.id === b.dataset.slot) || null;
    $('#cm-date').value = ''; $('#cm-time').value = '';
    draw();
  }; });
  ['#cm-date', '#cm-time'].forEach(sel => { $(sel).oninput = () => { picked = null; draw(); }; });
  draw();

  $('#cm-yes').onclick = async () => {
    const want = picked ? picked.start : momentOf($('#cm-date').value, $('#cm-time').value);
    if (!Number.isFinite(want)) { ctx.showToast(t('coMoveNeed'), 'error'); return; }
    if (!(want > Date.now()) || want === lesson.start) { ctx.showToast(t('coErrTime'), 'error'); return; }
    const note = $('#cm-note').value;
    const line = `${nameOf(me)}: ${whenText(ctx, lesson.start)} → ${whenText(ctx, want)}`;
    $('#cm-yes').disabled = true;
    try {
      if (direct()) await store.moveCoachBooking(lesson.coachId, lesson.slotId, picked, me.id, note);
      else await store.askCoachChange(lesson.coachId, lesson.slotId, me.id, want, note);
    } catch (err) {
      console.warn('change lesson:', err?.message || err);
      close();
      ctx.showToast(t(err?.code === 'TAKEN' ? 'coJustTaken' : 'coMoveFailed'), 'error');
      if (ctx.alive()) done();
      return;
    }
    close();
    ctx.showToast(t(direct() ? 'coMoved' : 'coMoveSent'), 'success');
    ctx.notify(lesson.coachId, t(direct() ? 'coNtfMoved' : 'coNtfAsk'), line, '#/coaching/me');
    if (ctx.alive()) done();
  };
}

// ---- #/coaching/c/:id ----
async function renderCoach(coachId, ctx) {
  const me = ctx.user;
  const [coaches, coach, slotMap, programMap] = await Promise.all([
    store.loadCoaches(), store.loadUserById(coachId), store.loadCoachSlots(coachId), store.loadCoachPrograms(coachId),
  ]);
  if (!ctx.alive()) return;
  const back = `<a href="#/coaching" class="back-link">${icon('back', { size: 16 })} ${t('back')}</a>`;
  if (!coach || !isCoach(coaches, coachId)) {
    ctx.main().innerHTML = `<div class="detail-container fade-in">${back}
      <div class="empty-state"><p>${icon('handicap', { size: 40 })}</p><p>${t('coNotCoach')}</p></div></div>`;
    return;
  }
  const profile = coaches[coachId];
  const now = Date.now();
  const days = byDay(upcoming(slotList(slotMap), now));
  const own = me.id === coachId;
  const programs = programList(programMap);

  const slotsHTML = days.length ? days.map(d => `
    <div class="co-day">
      <div class="co-day-name">${esc(ctx.formatDate(d.day))}</div>
      <div class="co-slots">
        ${d.slots.map(s => `
          <button class="co-slot${s.status === 'open' ? '' : ' taken'}" data-slot="${esc(s.id)}" ${s.status === 'open' && !own ? '' : 'disabled'}>
            <b>${timeText(s.start)}</b><span>${s.status === 'open' ? `${minText(s.minutes)}${s.price ? ' · ' + money(s.price) : ''}` : t('coTaken')}</span>
          </button>`).join('')}
      </div>
    </div>`).join('')
    : `<div class="empty-state" style="padding:30px 20px;"><p>${icon('time', { size: 36 })}</p><p>${t('coNoFree')}</p></div>`;

  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      ${back}
      <div class="co-head">
        ${avatar(ctx, coach)}
        <div>
          <h2 class="page-title" style="font-size:1.4rem;">${esc(nameOf(coach))}</h2>
          <div class="co-head-sub">${esc([profile.place, pricesText(profile)].filter(Boolean).join(' · ') || t('coPriceAsk'))}</div>
        </div>
      </div>
      ${profile.bio ? `<p class="co-bio">${esc(profile.bio)}</p>` : ''}
      ${own ? `<a href="#/coaching/me" class="btn btn-ghost btn-sm" style="margin:6px 0 4px;">${t('coMyDesk')} ${icon('next', { size: 15 })}</a>` : ''}
      ${programs.length ? `<h3 class="section-title" style="margin:18px 0 10px;">${t('cpPrograms')}</h3>
        ${programs.map(p => programCardHTML({ coachId, ...p }, null, ctx)).join('')}` : ''}
      <h3 class="section-title" style="margin:18px 0 10px;">${t('coFreeTimes')}</h3>
      ${slotsHTML}
      <p class="co-pay-note">${t('coPayNote')}</p>
    </div>`;

  const all = slotList(slotMap);
  ctx.main().querySelectorAll('.co-slot:not([disabled])').forEach(btn => btn.addEventListener('click', () => {
    const slot = all.find(s => s.id === btn.dataset.slot);
    if (slot) bookDialog(ctx, coachId, coach, slot, all);
  }));
}

function bookDialog(ctx, coachId, coach, slot, all) {
  const me = ctx.user;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:420px;">
      <h3 class="modal-title" style="margin-bottom:14px;">${t('coBookTitle')}</h3>
      <div class="co-book-what">
        <div><b>${esc(nameOf(coach))}</b></div>
        <div>${esc(whenText(ctx, slot.start))} · ${minText(slot.minutes)}</div>
        ${slot.price ? `<div class="co-book-price">${money(slot.price)}</div>` : ''}
      </div>
      <div class="input-group" style="margin-top:14px;">
        <label>${t('coSeries')}</label>
        <select id="co-series" class="co-textarea">
          <option value="1">${t('coSeriesOnce')}</option>
          ${REPEAT_WEEKS.filter(n => n > 1).map(n => `<option value="${n}">${t('coSeriesWeekly').replace('{n}', n)}</option>`).join('')}
        </select>
      </div>
      <div id="co-series-list" class="co-series"></div>
      <div class="input-group" style="margin-top:14px;">
        <label>${t('coNote')}</label>
        <input type="text" id="co-note" maxlength="300" placeholder="${esc(t('coNotePh'))}" />
      </div>
      <p class="co-pay-note">${t('coPayNote')} ${t('coCancelRule').replace('{h}', CANCEL_HOURS)}</p>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-ghost" id="co-no">${t('cancel')}</button>
        <button class="btn btn-primary" id="co-yes">${t('coBook')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#co-no').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // The same weekday and hour in the weeks that follow: which the coach has open.
  let series = weeklySeries(all, slot, 1);
  const drawSeries = () => {
    series = weeklySeries(all, slot, Number(modal.querySelector('#co-series').value) || 1);
    modal.querySelector('#co-series-list').innerHTML = series.length > 1 ? series.map(x => `
      <div class="co-series-row${x.slot ? '' : ' no'}"><span>${esc(whenText(ctx, x.start))}</span>
        <b>${x.slot ? t('coSeriesFree') : t('coSeriesNo')}</b></div>`).join('') : '';
  };
  modal.querySelector('#co-series').onchange = drawSeries;

  modal.querySelector('#co-yes').onclick = async () => {
    const yes = modal.querySelector('#co-yes');
    yes.disabled = true;
    const want = series.map(x => x.slot).filter(Boolean);
    const { booked, missed } = await store.bookCoachSlots(coachId, want, me.id, modal.querySelector('#co-note').value);
    close();
    if (!booked.length) {
      ctx.showToast(t('coJustTaken'), 'error');
      if (ctx.alive()) renderCoach(coachId, ctx);
      return;
    }
    const lost = series.length - booked.length;       // taken a moment ago, or never open
    ctx.showToast(series.length > 1
      ? t('coBookedN').replace('{n}', booked.length) + (lost ? ' ' + t('coMissedN').replace('{n}', lost) : '')
      : t('coBooked'), missed.length ? 'info' : 'success');
    ctx.notify(coachId, t('coNtfBooked'), `${nameOf(me)} · ${whenText(ctx, booked[0].start)} · ${minText(slot.minutes)}`
      + (booked.length > 1 ? ` · ${t('coSeriesNtf').replace('{n}', booked.length)}` : ''));
    location.hash = '#/coaching';
  };
}

// ---- #/coaching/me ----
async function renderDesk(ctx) {
  const me = ctx.user;
  const [coaches, slotMap, bookings, users, programMap, asked, changes] = await Promise.all([
    store.loadCoaches(), store.loadCoachSlots(me.id), store.loadCoachBookings(me.id), store.loadAllUsers(),
    store.loadCoachPrograms(me.id), store.loadCoachEnrollments(me.id), store.loadCoachChanges(me.id),
  ]);
  if (!ctx.alive()) return;
  const back = `<a href="#/coaching" class="back-link">${icon('back', { size: 16 })} ${t('back')}</a>`;
  if (!isCoach(coaches, me.id)) {
    ctx.main().innerHTML = `<div class="detail-container fade-in">${back}
      <div class="empty-state"><p>${icon('handicap', { size: 40 })}</p><p>${t('coNotCoachMe')}</p></div></div>`;
    return;
  }
  const profile = coaches[me.id];
  const byId = new Map((users || []).map(u => [u.id, u]));
  const now = Date.now();
  const all = slotList(slotMap);
  const days = byDay(upcoming(all, now));
  const booked = upcoming(all, now).filter(s => s.status === 'booked').length;
  // A request to move a lesson, for the booked slots still to come.
  const wantOf = (s) => {
    const c = (changes || {})[s.id];
    const b = (bookings || {})[s.id];
    return c && b && c.playerId === b.playerId && Number(c.wantStart) > 0 ? c : null;
  };
  const waiting = upcoming(all, now).filter(s => s.status === 'booked' && wantOf(s)).length;

  const rowHTML = (s) => {
    if (s.status !== 'booked') {
      return `<div class="co-row"><b>${timeText(s.start)}</b>
        <span class="co-row-what">${minText(s.minutes)}${s.price ? ' · ' + money(s.price) : ''} · ${t('coOpen')}</span>
        <button class="btn btn-ghost btn-sm co-del" data-slot="${esc(s.id)}" title="${esc(t('coRemoveSlot'))}">${icon('close', { size: 15 })}</button></div>`;
    }
    const b = (bookings || {})[s.id];
    const p = b ? byId.get(b.playerId) : null;
    const want = wantOf(s);
    return `<div class="co-row booked"><b>${timeText(s.start)}</b>
      <span class="co-row-what">${minText(s.minutes)}${s.price ? ' · ' + money(s.price) : ''} ·
        <b>${esc(p ? nameOf(p) : t('coBusy'))}</b>${p?.phone ? ` · <a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}
        ${b?.note ? `<span class="co-note">«${esc(b.note)}»</span>` : ''}</span>
      <button class="btn btn-outline btn-sm co-cancel-b" data-slot="${esc(s.id)}">${t('coCancelLesson')}</button>
      ${want ? `<div class="co-change">
        <span>${t('coChAsk')}: <b>${esc(whenText(ctx, want.wantStart))}</b>${want.note ? ` <span class="co-note">«${esc(want.note)}»</span>` : ''}</span>
        <span class="co-actions" style="margin:0;">
          <button class="btn btn-primary btn-sm co-ch-yes" data-slot="${esc(s.id)}">${t('coChApprove')}</button>
          <button class="btn btn-ghost btn-sm co-ch-no" data-slot="${esc(s.id)}">${t('coChDecline')}</button></span>
      </div>` : ''}</div>`;
  };

  const tomorrow = dayKey(now + 24 * 60 * 60 * 1000);
  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      ${back}
      <div class="page-head" style="margin-top:12px;"><div>
        <h2 class="page-title">${t('coMyDesk')}</h2>
        <p class="page-sub">${t('coDeskSub').replace('{n}', booked)}${waiting ? ` · <b>${t('coChN').replace('{n}', waiting)}</b>` : ''}</p>
      </div></div>

      <div class="glass-card co-card">
        <h3 class="co-card-title">${t('coOpenTimes')}</h3>
        <div class="co-form-row">
          <div class="input-group"><label>${t('coDate')}</label><input type="date" id="co-date" value="${tomorrow}" min="${dayKey(now)}" /></div>
          <div class="input-group"><label>${t('coFrom')}</label><input type="time" id="co-from" value="10:00" /></div>
          <div class="input-group"><label>${t('coTo')}</label><input type="time" id="co-to" value="16:00" /></div>
          <div class="input-group"><label>${t('coLength')}</label>
            <select id="co-len">${SLOT_MINUTES.slice().reverse().map(m => `<option value="${m}">${minText(m)}</option>`).join('')}</select></div>
        </div>
        <div class="input-group" style="margin-top:10px;"><label>${t('coRepeat')}</label>
          <select id="co-repeat" class="co-textarea">
            <option value="0">${t('coRepeatNone')}</option>
            ${REPEAT_WEEKS.map(n => `<option value="${n}">${esc(weeksText(n))}</option>`).join('')}
          </select></div>
        <div id="co-days-box" style="display:none;margin-top:10px;">
          <div class="co-days" id="co-days">${[1, 2, 3, 4, 5, 6, 0].map((d, i) =>
            `<button type="button" class="seg-chip" data-day="${d}">${esc(t('coDays').split(',')[i] || d)}</button>`).join('')}</div>
          <p class="co-hint" style="margin-top:6px;">${t('coDaysHint')}</p>
        </div>
        <button class="btn btn-primary" id="co-open" style="margin-top:12px;">${t('coOpenBtn')}</button>
      </div>

      <h3 class="section-title" style="margin:18px 0 10px;">${t('coSchedule')}</h3>
      ${days.length ? days.map(d => `
        <div class="co-day">
          <div class="co-day-name">${esc(ctx.formatDate(d.day))}</div>
          ${d.slots.map(rowHTML).join('')}
        </div>`).join('') : `<div class="co-hint" style="margin-bottom:14px;">${t('coNoSlotsYet')}</div>`}

      ${deskProgramsHTML(programMap, asked, byId, ctx)}

      <div class="glass-card co-card" style="margin-top:18px;">
        <h3 class="co-card-title">${t('coProfile')}</h3>
        <div class="input-group"><label>${t('coBio')}</label>
          <textarea id="co-bio" rows="3" maxlength="600" class="co-textarea">${esc(profile.bio || '')}</textarea></div>
        <div class="input-group" style="margin-top:10px;"><label>${t('coPlace')}</label>
          <input type="text" id="co-place" maxlength="120" value="${esc(profile.place || '')}" placeholder="${esc(t('coPlacePh'))}" /></div>
        <div class="co-form-row" style="margin-top:10px;">
          <div class="input-group"><label>${minText(60)} (₮)</label><input type="text" inputmode="numeric" id="co-p60" value="${profile.price60 || ''}" /></div>
          <div class="input-group"><label>${minText(30)} (₮)</label><input type="text" inputmode="numeric" id="co-p30" value="${profile.price30 || ''}" /></div>
        </div>
        <p class="co-hint" style="margin-top:8px;">${t('coPriceHint')}</p>
        <button class="btn btn-primary" id="co-save" style="margin-top:8px;">${t('save')}</button>
      </div>
    </div>`;

  const view = ctx.main();
  const again = () => renderDesk(ctx);
  const refused = (what, err) => { console.warn(what, err?.message || err); ctx.showToast(t('coSaveFailed'), 'error'); };
  wireDeskPrograms(view, programMap, asked, byId, ctx, again);

  view.querySelector('#co-save').onclick = async () => {
    try {
      await store.saveCoachProfile(me.id, {
        bio: view.querySelector('#co-bio').value, place: view.querySelector('#co-place').value,
        price60: view.querySelector('#co-p60').value, price30: view.querySelector('#co-p30').value,
      });
    } catch (err) { return refused('coach profile:', err); }
    ctx.showToast(t('coSaved'), 'success');
    again();
  };

  // «Давтах»: which weekdays, for how many weeks. Until a weekday is touched,
  // the one marked is the weekday of the date chosen.
  let daysTouched = false;
  const dayChips = [...view.querySelectorAll('#co-days .seg-chip')];
  const markDay = () => {
    if (daysTouched) return;
    const on = new Date(momentOf(view.querySelector('#co-date').value, '00:00')).getDay();
    dayChips.forEach(b => b.classList.toggle('active', Number(b.dataset.day) === on));
  };
  dayChips.forEach(b => { b.onclick = () => { daysTouched = true; b.classList.toggle('active'); }; });
  view.querySelector('#co-date').onchange = markDay;
  view.querySelector('#co-repeat').onchange = (e) => {
    view.querySelector('#co-days-box').style.display = Number(e.target.value) ? '' : 'none';
    markDay();
  };

  view.querySelector('#co-open').onclick = async () => {
    const minutes = Number(view.querySelector('#co-len').value);
    const weeks = Number(view.querySelector('#co-repeat').value);
    const days = weeks ? dayChips.filter(b => b.classList.contains('active')).map(b => Number(b.dataset.day)) : [];
    if (weeks && !days.length) { ctx.showToast(t('coNeedDay'), 'error'); return; }
    const out = newSlotsRepeat({
      date: view.querySelector('#co-date').value, from: view.querySelector('#co-from').value,
      to: view.querySelector('#co-to').value, minutes, price: priceOf(profile, minutes), existing: all,
      days, weeks: weeks || 1,
    });
    if (out.error) { ctx.showToast(t({ time: 'coErrTime', range: 'coErrRange', many: 'coErrMany' }[out.error] || 'coErrTime'), 'error'); return; }
    if (!out.slots.length) { ctx.showToast(t('coNothingOpened'), 'info'); return; }
    try { await store.addCoachSlots(me.id, out.slots); } catch (err) { return refused('open slots:', err); }
    const left = out.past + out.overlap;
    ctx.showToast(t('coOpened').replace('{n}', out.slots.length) + (left ? ' ' + t('coSkipped').replace('{n}', left) : ''), 'success');
    again();
  };

  view.querySelectorAll('.co-del').forEach(btn => btn.addEventListener('click', async () => {
    try { await store.removeCoachSlot(me.id, btn.dataset.slot); } catch (err) { return refused('remove slot:', err); }
    again();
  }));

  // A request to move a lesson: granted — the lesson takes the time asked for — or turned down.
  view.querySelectorAll('.co-ch-yes, .co-ch-no').forEach(btn => btn.addEventListener('click', async () => {
    const slot = all.find(s => s.id === btn.dataset.slot);
    const want = slot && wantOf(slot);
    if (!want) return again();
    const b = (bookings || {})[slot.id];
    const line = `${whenText(ctx, slot.start)} → ${whenText(ctx, want.wantStart)}`;
    if (btn.classList.contains('co-ch-no')) {
      try { await store.dropCoachChange(me.id, slot.id); } catch (err) { return refused('decline change:', err); }
      ctx.showToast(t('coChDeclined'), 'info');
      ctx.notify(want.playerId, t('coNtfDeclined'), `${nameOf(me)} · ${line}`);
      return again();
    }
    const target = changeTarget(all, slot, want.wantStart);
    if (target.error) { ctx.showToast(t(target.error === 'busy' ? 'coChBusy' : 'coChPast'), 'error'); return; }
    try {
      await store.approveCoachChange(me.id, slot, want, { slot: target.slot, note: b?.note || '' });
    } catch (err) { return refused('grant change:', err); }
    ctx.showToast(t('coChDone'), 'success');
    ctx.notify(want.playerId, t('coNtfMoved'), `${nameOf(me)} · ${line}`);
    again();
  }));

  view.querySelectorAll('.co-cancel-b').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.slot;
    const slot = all.find(s => s.id === id);
    const b = (bookings || {})[id];
    if (!confirm(t('coCancelByCoach'))) return;
    try {
      // A booked slot with no booking to be found: just open it again.
      if (b) await store.cancelCoachBooking(me.id, id, b.playerId);
      else await store.reopenCoachSlot(me.id, id);
    } catch (err) { return refused('cancel booking:', err); }
    ctx.showToast(t('coCancelled'), 'success');
    if (b && slot) ctx.notify(b.playerId, t('coNtfCancelled'), `${nameOf(me)} · ${whenText(ctx, slot.start)}`);
    again();
  }));
}
