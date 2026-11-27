// src/course-map.js
// The course map on the scorer — the hole the group is on, from above (2D)
// or as terrain (3D), with the distances to the green and to what lies
// before it. The map is not part of this app: it is built from Mt. Bogd's
// drone survey in its own repository and served from its own Firebase
// Hosting site (docs/course-map.md). Here it is only opened, over the
// scorecard, at the right hole.

import { resolveCourse, physicalHole } from './courses.js';
import { t } from './i18n.js';

// A trial, the way GHIN was: 'admin' shows the buttons to admins only, 'all'
// to every member who is scoring, 'off' to no one.
export const COURSE_MAP_STAGE = 'admin';

// Course key (src/courses.js) → the address of its map. A course without an
// entry has no map, and its games show no buttons.
const COURSE_MAPS = {
  sky: 'https://course.ubgolf.club/',
};

/** Who sees the course map: 'off', 'admin' (the trial) or 'all'. */
export function courseMapVisibleTo(stage, user) {
  if (!user) return false;
  if (stage === 'all') return true;
  return stage === 'admin' && user.role === 'admin';
}

// Where the map of a game's course is served, or null. On a developer's own
// PC the map can be the one served beside the app — in the console:
//   localStorage.courseMapUrl = 'http://localhost:8000/'
// — so the two are tried together before either is published. Read on
// localhost only: a published build always opens the published map.
function mapBase(game) {
  const base = COURSE_MAPS[resolveCourse(game?.location)?.key];
  if (!base) return null;
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { return localStorage.getItem('courseMapUrl') || base; } catch (_) { }
  }
  return base;
}

/**
 * The map's address for one hole of a game, or null when the course has no
 * map. `hole` is the scorer's hole (1..9 on a back nine); the map is asked
 * for the hole on the ground. `view` is '2d' or '3d'.
 */
export function courseMapUrl(game, hole, view, base = mapBase(game)) {
  const n = physicalHole(game, Number(hole));
  if (!base || !Number.isInteger(n) || n < 1 || n > 18) return null;
  let url;
  try { url = new URL(base); } catch (_) { return null; }
  url.searchParams.set('hole', n);
  url.searchParams.set('view', view === '3d' ? '3d' : '2d');
  return url.href;
}

/** The two buttons under the scorer's hole title — '' when there is no map to open, or no one to show it to. */
export function courseMapButtonsHTML(game, user, stage = COURSE_MAP_STAGE) {
  if (!courseMapVisibleTo(stage, user) || !mapBase(game)) return '';
  return `
      <div class="gs-map" role="group" aria-label="${t('cmTitle')}">
        <span class="gs-map-label">${t('cmTitle')}</span>
        <button type="button" data-gs="map" data-view="2d" class="btn btn-outline btn-sm">2D</button>
        <button type="button" data-gs="map" data-view="3d" class="btn btn-outline btn-sm">3D</button>
      </div>`;
}

// The map that is open, if one is: { frame, title, close }.
let open = null;

/**
 * Open the map over the page — the whole screen, with a bar to close it.
 * It is its own history entry, so the phone's Back closes the map and leaves
 * the scorecard where it was; Esc and the button do the same.
 */
export function openCourseMap(url, title) {
  if (open) {                      // already up: show the other view in it
    open.frame.src = url;
    open.frame.title = open.title.textContent = title;
    return;
  }
  const app = document.getElementById('app');
  const before = document.activeElement;
  const box = document.createElement('div');
  // .modal-overlay as well: the app's pull-to-refresh stands down under one.
  box.className = 'modal-overlay cm-overlay';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `
    <div class="cm-bar">
      <span class="cm-title"></span>
      <button type="button" class="btn btn-outline btn-sm cm-close"></button>
    </div>
    <iframe class="cm-frame" allow="geolocation"></iframe>`;
  const titleEl = box.querySelector('.cm-title');
  const frame = box.querySelector('iframe');
  const btn = box.querySelector('.cm-close');
  titleEl.textContent = frame.title = title;
  box.setAttribute('aria-label', title);
  btn.textContent = '✕ ' + t('close');

  let pushed = false;
  try { history.pushState({ ...(history.state || {}), courseMap: true }, ''); pushed = true; } catch (_) { }

  const done = () => {             // take it down — Back was pressed, or the page changed under it
    if (!open) return;
    open = null;
    window.removeEventListener('popstate', done);
    window.removeEventListener('hashchange', done);
    document.removeEventListener('keydown', onKey);
    box.remove();
    if (app) app.inert = false;
    before?.focus?.();
  };
  let closing = false;
  const close = () => {            // asked to close: step back off the map's own entry
    if (closing) return;
    closing = true;
    if (pushed) history.back(); else done();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  btn.onclick = close;
  // The app removes any .modal-overlay whose own backdrop is clicked. This
  // one has no backdrop to speak of, but removed that way the page behind
  // would stay inert — so such a click never reaches that handler.
  box.onclick = (e) => { if (e.target === box) e.stopPropagation(); };
  window.addEventListener('popstate', done);
  window.addEventListener('hashchange', done);
  document.addEventListener('keydown', onKey);
  open = { frame, title: titleEl, close };
  if (app) app.inert = true;       // nothing behind the map takes a tap or the keyboard
  document.body.append(box);
  frame.src = url;
  btn.focus();
}

export function closeCourseMap() {
  open?.close();
}
