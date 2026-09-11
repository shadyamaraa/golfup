// src/public-home.js
// What a visitor sees at ubgolf.club without signing in: the club's hero,
// the tournaments on and coming up, the latest results, the season in
// numbers, the champions wall, the ranking, how busy the games are, the
// news and the sponsors — and the statistics page behind the view-all links.
//
// Everything here is public data the rules already open (tournaments,
// ranking, news, sponsor, games); nothing reads `users`. The pieces the
// member home already draws (the news carousel, the ranking teaser, the
// tournament cards) are handed in through `ctx` and reused as they are; the
// numbers come from club-stats.js, which is pure and tested.

import { t } from './i18n.js';
import { icon } from './icons.js';
import * as store from './store.js';
import { setPageTitle } from './print-common.js';
import { resultScoreText, resultPointsText } from './tournament-results.js';
import { genderKey } from './gender.js';
import { seasonStats, championsWall, seasonYears, defaultSeasonYear, holeStats } from './club-stats.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const divisionText = (d) => (d ? t(genderKey(d)) : '');

const sectionHead = (title, href, iconName) => `
  <div class="section-head">
    <h2>${iconName ? `${icon(iconName, { size: 17 })} ` : ''}${title}</h2>
    ${href ? `<a href="${href}" class="view-all">${t('viewAllShort')}</a>` : ''}
  </div>`;

const tile = (label, value, { navy = false, sub = '' } = {}) => `
  <div class="stat-tile${navy ? ' navy' : ''}">
    <div class="st-label">${label}</div>
    <div class="st-value">${value}</div>
    ${sub ? `<div class="st-sub">${sub}</div>` : ''}
  </div>`;

// ---- The season in numbers ----

const FORMAT_KEYS = { stroke: 'fmtStroke', stableford: 'fmtStableford', team: 'tnTeam', ryder: 'fmtRyder', match: 'fmtMatch' };

function seasonTilesHTML(s, { full = false } = {}) {
  if (!s.tournaments) return `<p class="pub-empty">${t('pubNoSeason')}</p>`;
  const state = s.live ? `${s.live} ${t('tnLive').toLowerCase()}` : (s.finished ? `${s.finished} ${t('tnFinished').toLowerCase()}` : '');
  const tiles = [
    tile(t('statTournaments'), s.tournaments, { navy: true, sub: state }),
    tile(t('statParticipants'), s.players),
    tile(t('statRounds'), s.rounds, { sub: s.matches ? `${s.matches} ${t('statMatches').toLowerCase()}` : '' })
  ];
  if (s.lowRound) {
    const lr = s.lowRound;
    tiles.push(tile(t('tnLowRound'), `${lr.gross} <span class="st-small">(${resultScoreText(lr.toPar)})</span>`,
      { sub: `${esc(lr.name)}${lr.tied > 1 ? ` (+${lr.tied - 1})` : ''} · ${esc(lr.tnName)}` }));
  }
  if (s.hasPars && (s.eagles || s.birdies)) tiles.push(tile('Eagle · Birdie', `${s.eagles} · ${s.birdies}`));
  const formats = full
    ? `<div class="pub-pills">${Object.entries(s.byFormat).filter(([, n]) => n > 0)
      .map(([k, n]) => `<span class="pill-soft">${esc(t(FORMAT_KEYS[k]))} · ${n}</span>`).join('')}</div>`
    : '';
  const low = full && s.lowRound
    ? `<a class="pub-line" href="#/tnresult/${esc(s.lowRound.tnId)}">${icon('scorecard', { size: 14 })} ${t('tnLowRound')}: ${esc(s.lowRound.name)} — ${s.lowRound.gross} (${resultScoreText(s.lowRound.toPar)}) · R${s.lowRound.round} · ${esc(s.lowRound.tnName)}</a>`
    : '';
  return `<div class="stat-grid">${tiles.join('')}</div>${formats}${low}`;
}

// ---- Where the eagles and birdies fell ----

function holeGridHTML(c) {
  const max = Math.max(1, ...c.holes.map(h => h.birdies + h.eagles));
  return `
    <div class="hole-grid">${c.holes.map(h => {
      const n = h.birdies + h.eagles;
      const heat = n ? (0.12 + 0.55 * (n / max)).toFixed(2) : 0;
      return `
      <span class="hg-cell${n ? ' has' : ''}" style="${n ? `background:rgba(221,137,16,${heat});` : ''}">
        <span class="hg-h">${h.hole}${h.par ? `<i>·${h.par}</i>` : ''}</span>
        <span class="hg-b">${h.birdies || '–'}</span>
        ${h.eagles ? `<span class="hg-e">E${h.eagles > 1 ? `×${h.eagles}` : ''}</span>` : ''}
      </span>`;
    }).join('')}
    </div>`;
}

function holesBlockHTML(courses, { full = false } = {}) {
  if (!courses.length || !courses.some(c => c.eagles || c.birdies)) return `<p class="pub-empty">${t('pubHoleNone')}</p>`;
  const eagles = courses.reduce((n, c) => n + c.eagles, 0);
  const birdies = courses.reduce((n, c) => n + c.birdies, 0);
  const shown = full ? courses : courses.slice(0, 1);
  const top = courses.flatMap(c => c.best ? [{ ...c.best, course: c.name }] : []).sort((a, b) => (b.birdies + b.eagles) - (a.birdies + a.eagles))[0];
  return `
    <div class="stat-row">
      ${tile('Eagle', eagles, { navy: true })}
      ${tile('Birdie', birdies, { navy: true })}
      ${top ? tile(t('statBestHole'), `${top.hole}`, { sub: `${esc(top.course)} · ${top.birdies}${top.eagles ? ` + E${top.eagles}` : ''}` }) : ''}
    </div>
    ${shown.map(c => `
    <div class="hole-course">
      <span class="hole-course-name">${esc(c.name)}</span>
      <span class="hole-course-sub">${c.cards} ${t('statCards').toLowerCase()} · E ${c.eagles} · B ${c.birdies}</span>
    </div>
    ${holeGridHTML(c)}`).join('')}
    <div class="hole-legend">${t('pubHoleLegend')}</div>`;
}

/**
 * The «Eagle · Birdie» section — head with the year and the view-all, then
 * the block — for any home. Empty string when nothing was recorded and
 * `hideEmpty` is set (the member's home has no room for a placeholder).
 */
export function holesSectionHTML(list, { stateOf, year, href = '#/stats', hideEmpty = false } = {}) {
  const y = year || defaultSeasonYear(list);
  const courses = holeStats(list, { year: y, stateOf });
  if (hideEmpty && !courses.some(c => c.eagles || c.birdies)) return '';
  return `${sectionHead(`${t('pubHoles')} · ${y}`, href)}${holesBlockHTML(courses)}`;
}

// ---- The champions wall ----

/** Rows of championsWall(), one tournament each. Shared by the landing and the statistics page. */
export function championsRowsHTML(rows, { datesText } = {}) {
  if (!rows.length) return `<p class="pub-empty">${t('pubNoChampions')}</p>`;
  const names = (winners) => winners.length <= 2
    ? winners.map(w => `<span class="tn-br-name">${esc(w.name)}</span>`).join('<span class="tn-br-dash">·</span>')
    : `<span class="tn-br-name">${winners.length} ${t('tnPlayers')} ${t('tnTied')}</span>`;
  return rows.map(r => {
    const meta = [datesText ? datesText(r) : r.startDate, r.venue].filter(Boolean).join(' · ');
    let line = '';
    if (r.kind === 'ryder') {
      const side = (team, txt, win) => `<span class="tn-br-side${win ? ' tn-br-win' : ''}" style="border-bottom:2px solid ${esc(team.color || 'transparent')};">${esc(txt)}</span>`;
      line = `<span class="tn-cap">${t('tnWinner')}</span>`
        + side(r.teams.a, `${r.teams.a.short} ${resultPointsText(r.teams.a.points)}`, r.teams.winner === 'a')
        + `<span class="tn-br-dash">–</span>`
        + side(r.teams.b, `${resultPointsText(r.teams.b.points)} ${r.teams.b.short}`, r.teams.winner === 'b');
    } else if (r.kind === 'singles') {
      line = `<span class="tn-cap">${t('mpStandings')}</span>${names(r.leaders)}<span class="tn-sc">${resultPointsText(r.leaders[0].points)}</span>`;
    } else {
      line = `<span class="tn-cap">${t('tnWinner')}</span>` + r.divisions.map(d =>
        `${d.division ? `<span class="pill-soft cw-div">${esc(divisionText(d.division))}</span>` : ''}${names(d.winners)}<span class="tn-sc">${resultScoreText(d.winners[0].total, r.points)}</span>`
      ).join('<span class="tn-br-dash">·</span>');
    }
    return `
      <a class="cw-row surface-card" href="#/tournament/${esc(r.id)}">
        <span class="cw-crest">${r.logo ? `<img src="${r.logo}" alt="" />` : icon('leaderboard', { size: 20 })}</span>
        <span class="cw-body">
          <span class="cw-name">${esc(r.name || '—')}</span>
          ${meta ? `<span class="cw-meta">${esc(meta)}</span>` : ''}
          <span class="tn-br-result">${line}</span>
        </span>
        <span class="gc-chev">${icon('next', { size: 18 })}</span>
      </a>`;
  }).join('');
}

function wallByYearHTML(rows, ctx) {
  if (!rows.length) return championsRowsHTML(rows, ctx);
  const years = [...new Set(rows.map(r => r.year))];
  return years.map(y => `
    <div class="cw-year">${y || '—'}</div>
    ${championsRowsHTML(rows.filter(r => r.year === y), ctx)}`).join('');
}

// ---- The landing ----

const HERO = (live) => `
  <div class="feature-card pub-hero">
    <div class="fc-eyebrow">${live
      ? `<span class="pub-live-dot"></span> ${t('tnLive')} · ${esc(live.name || '')}`
      : 'UB GOLF CLUB'}</div>
    <div class="pub-hero-row">
      <img src="/logo-v-cream.svg" alt="UB Golf" class="pub-hero-logo" />
      <div>
        <div class="fc-title">UB Golf Club</div>
        <div class="fc-sub">${t('pubTagline')}</div>
      </div>
    </div>
    <div class="pub-hero-cta">
      ${live ? `<a class="btn btn-primary btn-sm" href="#/tournament/${esc(live.id)}">${icon('leaderboard', { size: 15 })} ${t('tnLive')}</a>` : ''}
      <a class="btn btn-outline btn-sm" href="#/login">${icon('profile', { size: 15 })} ${t('pubMemberCta')}</a>
    </div>
  </div>`;

function paintTournamentSections(list, ctx) {
  const stateOf = ctx.stateOf || (() => 'final');
  const { active, past, archived } = ctx.buckets(list);
  const live = active.find(tn => stateOf(tn) === 'live') || null;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  set('pub-hero', HERO(live));
  set('pub-active', `
    ${sectionHead(t('browseTournaments'), '#/tournaments', 'leaderboard')}
    <div class="games-list">${active.length ? ctx.tnCards(active.slice(0, 4)) : `<p class="pub-empty">${t('noTournaments')}</p>`}</div>`);
  const results = [...past, ...archived].slice(0, 3);
  set('pub-results', results.length ? `
    ${sectionHead(t('pubRecentResults'), '#/tournaments', 'scorecard')}
    <div class="games-list">${ctx.tnCards(results)}</div>` : '');
  // The season tiles and the partner logos are the statistics page's and
  // the tournament pages' — the owner keeps the home shorter; the eagles
  // and birdies, and where they fell, stay.
  set('pub-holes', holesSectionHTML(list, { stateOf }));
  set('pub-champions', `
    ${sectionHead(t('pubChampions'), '#/stats', 'star')}
    ${championsRowsHTML(championsWall(list, { stateOf }).slice(0, 5), { datesText: ctx.datesText })}`);
}

/**
 * The public home at #/ for a visitor. ctx: { main, alive, onUnsub, stateOf,
 * tournaments() → the boot-time list, tnCards, buckets, newsInto,
 * rankingInto, datesText }.
 */
export async function renderPublicHome(ctx = {}) {
  const main = ctx.main();
  if (!main) return;
  setPageTitle(ctx, 'UB Golf Club');
  main.innerHTML = `
    <div class="home-container fade-in pub-home">
      <div id="pub-hero"></div>
      <div id="pub-active"></div>
      <div id="pub-results"></div>
      <div id="pub-holes"></div>
      <div id="pub-champions"></div>
      <div id="home-ranking"></div>
      <div id="home-news" style="margin-top:24px;"></div>
    </div>`;
  const alive = ctx.alive || (() => true);

  // The tournaments were loaded at boot for the strip; paint from them now.
  let list = ctx.tournaments?.();
  if (!Array.isArray(list)) { try { list = await store.loadTournaments(); } catch (_) { list = []; } }
  if (!alive()) return;
  const paint = (tns) => { if (alive()) paintTournamentSections(tns, ctx); };
  paint(list);

  ctx.rankingInto?.();
  ctx.newsInto?.();
  if (store.isUsingFirebase()) {
    const un = store.onTournamentsChanged(paint);
    if (un) ctx.onUnsub?.(un);
    const unNews = store.onNewsChanged((items) => ctx.newsInto?.(items));
    if (unNews) ctx.onUnsub?.(unNews);
  }
}

/** The statistics page at #/stats — every year, the whole wall, the games month by month. */
export async function renderClubStatsPage(ctx = {}) {
  const main = ctx.main();
  if (!main) return;
  setPageTitle(ctx, `${t('tnStatsTitle')} — UB Golf Club`);
  main.innerHTML = `<div class="home-container fade-in"><div class="loading-spinner" style="margin:40px auto;"></div></div>`;
  const stateOf = ctx.stateOf;
  let list = ctx.tournaments?.();
  if (!Array.isArray(list)) { try { list = await store.loadTournaments(); } catch (_) { list = []; } }
  const alive = ctx.alive || (() => true);
  if (!alive()) return;
  const years = seasonYears(list);
  let year = defaultSeasonYear(list);
  const wall = championsWall(list, { stateOf });

  main.innerHTML = `
    <div class="home-container fade-in pub-stats">
      <a href="#/" class="back-link">${icon('back', { size: 16 })} ${t('back')}</a>
      <div class="page-head" style="margin-top:12px;"><h2 class="page-title">${t('tnStatsTitle')}</h2></div>
      ${years.length > 1 ? `<div class="seg-tabs pub-years">${years.map(y => `<button type="button" class="seg-tab${y === year ? ' active' : ''}" data-year="${y}">${y}</button>`).join('')}</div>` : ''}
      <div id="pub-season"></div>
      <div id="pub-holes"></div>
      ${sectionHead(t('pubChampions'), null, 'star')}
      <div id="pub-wall">${wallByYearHTML(wall, { datesText: ctx.datesText })}</div>
      <a class="list-row surface-card" href="#/ranking" style="margin-top:20px;">
        <span class="tile-icon">${icon('leaderboard', { size: 18 })}</span>
        <span class="lr-body"><div class="lr-title">${t('rankingTitle')}</div><div class="lr-sub">${t('viewAllShort')}</div></span>
        <span class="lr-chev">${icon('next', { size: 18 })}</span>
      </a>
    </div>`;
  const paintSeason = () => {
    const host = document.getElementById('pub-season');
    if (host) host.innerHTML = `${sectionHead(`${t('pubSeasonStats')} · ${year}`)}${seasonTilesHTML(seasonStats(list, { year, stateOf }), { full: true })}`;
    const holes = document.getElementById('pub-holes');
    if (holes) holes.innerHTML = `${sectionHead(`${t('pubHoles')} · ${year}`)}${holesBlockHTML(holeStats(list, { year, stateOf }), { full: true })}`;
  };
  paintSeason();
  main.querySelectorAll('[data-year]').forEach(b => b.onclick = () => {
    year = Number(b.dataset.year);
    main.querySelectorAll('[data-year]').forEach(x => x.classList.toggle('active', x === b));
    paintSeason();
  });
}
