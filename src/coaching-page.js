// src/coaching-page.js
// Coaching, as a member sees it:
//
//   #/coaching           the coaches, and the lessons I have booked
//   #/coaching/c/:id     one coach — their open times; tap one to book it
//   #/coaching/me        a coach's own desk: profile, opening times, who booked
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
  SLOT_MINUTES, CANCEL_HOURS, isCoach, priceOf, newSlots, canPlayerCancel,
  slotList, upcoming, openSlots, dayKey, timeText, byDay, myLessons,
} from './coaching.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString()}₮` : '');
const spinner = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
const nameOf = (u) => store.memberName(u) || u?.username || u?.name || '—';
const listKey = (u) => String(u?.username || u?.name || '').toLowerCase();
const whenText = (ctx, start) => `${ctx.formatDate(dayKey(start))} ${timeText(start)}`;
const minText = (m) => `${m} ${t('coMin')}`;
const pricesText = (profile) => SLOT_MINUTES
  .map(m => (priceOf(profile, m) ? `${minText(m)} ${money(priceOf(profile, m))}` : ''))
  .filter(Boolean).join(' · ');

const avatar = (ctx, u) => `<span class="player-avatar-sm" style="flex-shrink:0;">${
  ctx.avatarInner(u?.avatar, String(u?.username || u?.name || '?').charAt(0).toUpperCase())}</span>`;

export async function renderCoachingPage(sub, ctx) {
  ctx.main().innerHTML = spinner;
  if (sub === 'me') return renderDesk(ctx);
  if (sub.startsWith('c/')) return renderCoach(decodeURIComponent(sub.slice(2)), ctx);
  return renderHome(ctx);
}

// ---- #/coaching ----
async function renderHome(ctx) {
  const me = ctx.user;
  const [coaches, users, allSlots, lessons] = await Promise.all([
    store.loadCoaches(), store.loadAllUsers(), store.loadAllCoachSlots(), store.loadPlayerLessons(me.id),
  ]);
  if (!ctx.alive()) return;
  const byId = new Map((users || []).map(u => [u.id, u]));
  const now = Date.now();

  const mine = myLessons(lessons, allSlots, now);
  const lessonsHTML = mine.length ? `
    <h3 class="section-title" style="margin:18px 0 10px;">${t('coMyLessons')}</h3>
    ${mine.map(l => {
      const coach = byId.get(l.coachId);
      const what = `${esc(whenText(ctx, l.start))} · ${minText(l.minutes)}${l.price ? ' · ' + money(l.price) : ''}`;
      const action = l.gone
        ? `<div class="co-hint">${t('coGone')}</div>
           <button class="btn btn-outline btn-sm co-drop" data-key="${esc(l.key)}">${t('coRemove')}</button>`
        : canPlayerCancel(l.start, now)
          ? `<button class="btn btn-outline btn-sm co-cancel" data-coach="${esc(l.coachId)}" data-slot="${esc(l.slotId)}">${t('coCancelLesson')}</button>`
          : `<div class="co-hint">${t('coTooLate')}${coach?.phone ? ` <a href="tel:${esc(coach.phone)}">${esc(coach.phone)}</a>` : ''}</div>`;
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
  ctx.main().querySelectorAll('.co-drop').forEach(btn => btn.addEventListener('click', async () => {
    try { await store.dropPlayerLesson(me.id, btn.dataset.key); } catch (err) { console.warn('drop lesson:', err?.message || err); }
    again();
  }));
}

// ---- #/coaching/c/:id ----
async function renderCoach(coachId, ctx) {
  const me = ctx.user;
  const [coaches, coach, slotMap] = await Promise.all([
    store.loadCoaches(), store.loadUserById(coachId), store.loadCoachSlots(coachId),
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
      <h3 class="section-title" style="margin:18px 0 10px;">${t('coFreeTimes')}</h3>
      ${slotsHTML}
      <p class="co-pay-note">${t('coPayNote')}</p>
    </div>`;

  const all = slotList(slotMap);
  ctx.main().querySelectorAll('.co-slot:not([disabled])').forEach(btn => btn.addEventListener('click', () => {
    const slot = all.find(s => s.id === btn.dataset.slot);
    if (slot) bookDialog(ctx, coachId, coach, slot);
  }));
}

function bookDialog(ctx, coachId, coach, slot) {
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
  modal.querySelector('#co-yes').onclick = async () => {
    const yes = modal.querySelector('#co-yes');
    yes.disabled = true;
    try {
      await store.bookCoachSlot(coachId, slot, me.id, modal.querySelector('#co-note').value);
    } catch (err) {
      console.warn('book lesson:', err?.message || err);
      close();
      ctx.showToast(t(err?.code === 'TAKEN' ? 'coJustTaken' : 'coBookFailed'), 'error');
      if (ctx.alive()) renderCoach(coachId, ctx);
      return;
    }
    close();
    ctx.showToast(t('coBooked'), 'success');
    ctx.notify(coachId, t('coNtfBooked'), `${nameOf(me)} · ${whenText(ctx, slot.start)} · ${minText(slot.minutes)}`);
    location.hash = '#/coaching';
  };
}

// ---- #/coaching/me ----
async function renderDesk(ctx) {
  const me = ctx.user;
  const [coaches, slotMap, bookings, users] = await Promise.all([
    store.loadCoaches(), store.loadCoachSlots(me.id), store.loadCoachBookings(me.id), store.loadAllUsers(),
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

  const rowHTML = (s) => {
    if (s.status !== 'booked') {
      return `<div class="co-row"><b>${timeText(s.start)}</b>
        <span class="co-row-what">${minText(s.minutes)}${s.price ? ' · ' + money(s.price) : ''} · ${t('coOpen')}</span>
        <button class="btn btn-ghost btn-sm co-del" data-slot="${esc(s.id)}" title="${esc(t('coRemoveSlot'))}">${icon('close', { size: 15 })}</button></div>`;
    }
    const b = (bookings || {})[s.id];
    const p = b ? byId.get(b.playerId) : null;
    return `<div class="co-row booked"><b>${timeText(s.start)}</b>
      <span class="co-row-what">${minText(s.minutes)}${s.price ? ' · ' + money(s.price) : ''} ·
        <b>${esc(p ? nameOf(p) : t('coBusy'))}</b>${p?.phone ? ` · <a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}
        ${b?.note ? `<span class="co-note">«${esc(b.note)}»</span>` : ''}</span>
      <button class="btn btn-outline btn-sm co-cancel-b" data-slot="${esc(s.id)}">${t('coCancelLesson')}</button></div>`;
  };

  const tomorrow = dayKey(now + 24 * 60 * 60 * 1000);
  ctx.main().innerHTML = `
    <div class="detail-container fade-in co-page">
      ${back}
      <div class="page-head" style="margin-top:12px;"><div>
        <h2 class="page-title">${t('coMyDesk')}</h2>
        <p class="page-sub">${t('coDeskSub').replace('{n}', booked)}</p>
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
        <button class="btn btn-primary" id="co-open" style="margin-top:12px;">${t('coOpenBtn')}</button>
      </div>

      <h3 class="section-title" style="margin:18px 0 10px;">${t('coSchedule')}</h3>
      ${days.length ? days.map(d => `
        <div class="co-day">
          <div class="co-day-name">${esc(ctx.formatDate(d.day))}</div>
          ${d.slots.map(rowHTML).join('')}
        </div>`).join('') : `<div class="co-hint" style="margin-bottom:14px;">${t('coNoSlotsYet')}</div>`}

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

  view.querySelector('#co-open').onclick = async () => {
    const minutes = Number(view.querySelector('#co-len').value);
    const out = newSlots({
      date: view.querySelector('#co-date').value, from: view.querySelector('#co-from').value,
      to: view.querySelector('#co-to').value, minutes, price: priceOf(profile, minutes), existing: all,
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
