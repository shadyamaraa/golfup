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

import { t, getLang } from './i18n.js';
import { icon } from './icons.js';
import * as store from './store.js';
import { setPageTitle } from './print-common.js';
import { tnSponsors, tnSponsorsHTML } from './tournament-media.js';
import { resultScoreText, resultPointsText } from './tournament-results.js';
import { genderKey } from './gender.js';
import { seasonStats, championsWall, casualActivity, seasonYears, defaultSeasonYear } from './club-stats.js';

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

// ---- The casual games ----

function monthLabel(ym) {
  const m = Number(ym.slice(5, 7));
  if (getLang() === 'mn') return `${m}-р сар`;
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || ym;
}

function casualHTML(a, { bars = false } = {}) {
  const max = Math.max(1, ...a.byMonth.map(m => m.count));
  return `
    <div class="stat-row">
      ${tile(t('statTotalGames'), a.games)}
      ${tile(t('statThisMonth'), a.thisMonth)}
      ${tile(t('statActive30'), a.active30)}
    </div>
    ${a.topLocations.length ? `<div class="pub-pills">${a.topLocations.map(l => `<span class="pill-soft">${esc(l.name)} · ${l.count}</span>`).join('')}</div>` : ''}
    ${bars ? `
    <div class="pub-bars-cap">${t('statByMonth')}</div>
    <div class="pub-bars">${a.byMonth.map(m => `
      <span class="pb-label">${esc(monthLabel(m.ym))}</span>
      <span class="spc-bar"><span style="width:${Math.round((m.count / max) * 100)}%;background:var(--gold);"></span></span>
      <span class="pb-n">${m.count}</span>`).join('')}
    </div>` : ''}`;
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
  set('pub-season', `
    ${sectionHead(`${t('pubSeasonStats')} · ${defaultSeasonYear(list)}`, '#/stats')}
    ${seasonTilesHTML(seasonStats(list, { stateOf }))}`);
  set('pub-champions', `
    ${sectionHead(t('pubChampions'), '#/stats', 'star')}
    ${championsRowsHTML(championsWall(list, { stateOf }).slice(0, 5), { datesText: ctx.datesText })}`);
  const sponsored = [...active, ...past, ...archived].find(tn => tnSponsors(tn).length);
  set('pub-sponsors', sponsored ? `${sectionHead(t('tnSponsors'))}${tnSponsorsHTML(sponsored)}` : '');
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
      <div id="pub-season"></div>
      <div id="pub-champions"></div>
      <div id="home-ranking"></div>
      <div id="pub-casual"></div>
      <div id="home-news" style="margin-top:24px;"></div>
      <div id="pub-sponsors"></div>
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

  // Games last: the one expensive read the landing adds, and the section
  // simply goes away if it fails.
  try {
    const games = await store.loadAllGames();
    if (!alive()) return;
    const host = document.getElementById('pub-casual');
    if (host) host.innerHTML = `${sectionHead(t('pubCasual'), '#/stats', 'play')}${casualHTML(casualActivity(games))}`;
  } catch (_) {
    document.getElementById('pub-casual')?.remove();
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
      ${sectionHead(t('pubChampions'), null, 'star')}
      <div id="pub-wall">${wallByYearHTML(wall, { datesText: ctx.datesText })}</div>
      ${sectionHead(t('pubCasual'), null, 'play')}
      <div id="pub-casual"><div class="loading-spinner" style="margin:16px auto;"></div></div>
      <a class="list-row surface-card" href="#/ranking" style="margin-top:20px;">
        <span class="tile-icon">${icon('leaderboard', { size: 18 })}</span>
        <span class="lr-body"><div class="lr-title">${t('rankingTitle')}</div><div class="lr-sub">${t('viewAllShort')}</div></span>
        <span class="lr-chev">${icon('next', { size: 18 })}</span>
      </a>
    </div>`;
  const paintSeason = () => {
    const host = document.getElementById('pub-season');
    if (host) host.innerHTML = `${sectionHead(`${t('pubSeasonStats')} · ${year}`)}${seasonTilesHTML(seasonStats(list, { year, stateOf }), { full: true })}`;
  };
  paintSeason();
  main.querySelectorAll('[data-year]').forEach(b => b.onclick = () => {
    year = Number(b.dataset.year);
    main.querySelectorAll('[data-year]').forEach(x => x.classList.toggle('active', x === b));
    paintSeason();
  });

  try {
    const games = await store.loadAllGames();
    if (!alive()) return;
    const host = document.getElementById('pub-casual');
    if (host) host.innerHTML = casualHTML(casualActivity(games), { bars: true });
  } catch (_) {
    document.getElementById('pub-casual')?.remove();
  }
}
