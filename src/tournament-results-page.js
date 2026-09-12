// src/tournament-results-page.js
// The results page — #/tnresult/:tnId — and the share behind its button.
//
// One sheet reads the way a tour's results page does: the champion (or the
// leader, while play is on), the final table with positions and ties, the
// cut, the withdrawals, the field's numbers for the day — and for an M Cup
// the two teams' points and every session's matches. It prints on A4 through
// the shared print plumbing the flight cards use, and it is public like the
// board, so the link on the shared image opens for anyone.
//
// Sharing is an IMAGE: a 1080×1350 card drawn in the app (results-image.js)
// and handed to the phone's share sheet, which is where Facebook, Messenger,
// Instagram and Viber live. A link on its own would show the site's generic
// preview — hash routes carry no Open Graph — so the picture is the post and
// the link rides along in the text and in the QR on the card. Where there is
// no share sheet (a desktop), the card is shown with a download button.

import { t } from './i18n.js';
import * as store from './store.js';
import { icon } from './icons.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML, setPageTitle } from './print-common.js';
import { tnResultModel, playerShareModel, carouselPlan, resultScoreText, resultPointsText, resultUnder } from './tournament-results.js';
import { tnLogo, tnSponsors, tnCover, tnHashtag } from './tournament-media.js';
import { genderKey } from './gender.js';
import { buildShareImage, buildCarousel } from './results-image.js';
import { openShareSheet } from './share-sheet.js';

const FORMAT_KEY = {
  stroke: 'fmtStroke', match: 'fmtMatch', ryder: 'fmtRyder',
  scramble: 'fmtScramble', fourball: 'fmtFourball', foursome: 'fmtFoursome'
};
const formatText = (tn) => (FORMAT_KEY[tn?.format] ? t(FORMAT_KEY[tn.format]) : (tn?.format || ''));
const divisionText = (d) => (d ? t(genderKey(d)) : '');
const datesText = (tn) => `${tn?.startDate || ''}${tn?.endDate && tn.endDate !== tn.startDate ? ` — ${tn.endDate}` : ''}`;
const subtitleText = (tn) => [datesText(tn), tn?.venue, tn?.city].filter(Boolean).join(' · ');

// What this sheet is: the official result, or the standings after a round.
function stateText(model) {
  if (model.state === 'final') return `${t('tnResults')} · ${t('tnFinal')}`;
  if (model.state === 'live') {
    return model.kind === 'stroke'
      ? `${t('tnResultsAfter').replace('{n}', model.round)} · ${t('tnLive')}`
      : `${t('tnResults')} · ${t('tnLive')} · ${model.played}/${model.matches}`;
  }
  return `${t('tnResults')} · ${t('tnSoon')}`;
}

// ---- blocks ----

const sc = (v, points) => `<span class="${resultUnder(v, points) ? 'tnr-under' : ''}">${esc(resultScoreText(v, points))}</span>`;

function membersOf(tn, e) {
  return (e.memberIds || []).map(id => tn?.sp?.players?.[id]?.name || '').filter(Boolean);
}

function championsHTML(tn, model) {
  return model.boards.filter(b => b.leaders.length).map(b => {
    const lead = b.leaders[0];
    const cap = `${model.state === 'final' ? t('tnChampion') : t('tnLeading')}${b.division ? ` · ${divisionText(b.division)}` : ''}`;
    const names = b.leaders.length > 2
      ? `${b.leaders.length} ${t('tnPlayers')} ${t('tnTied')}`
      : b.leaders.map(e => esc(e.name || '')).join(' · ');
    const members = model.team ? b.leaders.map(e => membersOf(tn, e).join(' · ')).filter(Boolean).join(' / ') : '';
    const rounds = (lead.rounds || []).map((v, i) => `R${i + 1} ${resultScoreText(v, model.points)}`).join(' · ');
    const strokes = lead.gross !== null && lead.gross !== undefined ? `${lead.gross} ${t('tnStrokes').toLowerCase()}` : '';
    return `
      <div class="tnr-champ sc-block">
        <div style="flex:1;min-width:0;">
          <div class="tnr-champ-cap">🏆 ${esc(cap)}</div>
          <div class="tnr-champ-name">${names}</div>
          ${members ? `<div class="tnr-champ-sub">${esc(members)}</div>` : ''}
          <div class="tnr-champ-sub">${esc(rounds)}${b.leaders.length > 1 ? ` · ${t('tnTied')}` : ''}</div>
        </div>
        <div class="tnr-champ-score">
          <b class="${resultUnder(lead.total, model.points) ? 'tnr-under' : ''}">${esc(resultScoreText(lead.total, model.points))}</b>
          <small>${model.points ? t('spPoints') : ''}${strokes ? `${model.points ? ' · ' : ''}${esc(strokes)}` : ''}</small>
        </div>
      </div>`;
  }).join('');
}

function boardTableHTML(tn, model, board) {
  const live = model.state === 'live';
  const net = model.hasHcp && !model.points;
  const rounds = Array.from({ length: model.rounds }, (_, i) => i + 1);
  const head = `
    <thead><tr>
      <th>${t('tnPos')}</th>
      <th class="tnr-name">${t(model.team ? 'tnTeam' : 'tnPlayer')}</th>
      ${rounds.map(r => `<th>R${r}</th>`).join('')}
      <th>${model.points ? t('spPoints') : t('tnTotal')}</th>
      <th>${t('tnStrokes')}</th>
      ${net ? `<th>${t('spNet')}</th>` : ''}
      ${live ? `<th>${t('tnThru')}</th>` : ''}
    </tr></thead>`;
  const row = (e, cls = '') => {
    const members = model.team ? membersOf(tn, e) : [];
    return `
    <tr class="${cls}${e.rank <= 3 ? ' tnr-top3' : ''}">
      <td>${esc(e.posLabel)}</td>
      <td class="tnr-name">${esc(e.name || '')}${e.hcp !== null && e.hcp !== undefined ? ` <small class="tnr-hcp">HCP ${esc(e.hcp)}</small>` : ''}
        ${members.length ? `<span class="tnr-mem">${esc(members.join(' · '))}</span>` : ''}</td>
      ${rounds.map(r => `<td>${sc(e.rounds?.[r - 1], model.points)}</td>`).join('')}
      <td class="tnr-tot">${sc(e.total, model.points)}</td>
      <td>${e.gross !== null && e.gross !== undefined ? esc(e.gross) : '–'}</td>
      ${net ? `<td>${e.netTotal !== null && e.netTotal !== undefined ? esc(e.netTotal) : '–'}</td>` : ''}
      ${live ? `<td>${esc(e.thru || '–')}</td>` : ''}
    </tr>`;
  };
  const cols = 4 + rounds.length + (net ? 1 : 0) + (live ? 1 : 0);
  const cutRow = board.cut.length
    ? `<tr class="tnr-cutrow"><td colspan="${cols}">${t('tnMissedCut')} · ${t('tnCutTop')} ${board.cutSize}</td></tr>`
    : '';
  return `
    ${board.division ? `<div class="tnr-sec">${esc(divisionText(board.division))} · ${board.entries.length}</div>` : ''}
    <div class="sc-scroll">
      <table class="tnr-table">
        ${head}
        <tbody>
          ${board.inPlay.map(e => row(e)).join('')}
          ${cutRow}
          ${board.cut.map(e => row(e, 'tnr-out')).join('')}
          ${board.retired.map(e => row(e, 'tnr-out')).join('')}
          ${board.idle.map(e => row(e, 'tnr-out')).join('')}
        </tbody>
      </table>
    </div>`;
}

function statsHTML(model) {
  const s = model.stats;
  if (!s) return '';
  const tile = (cap, v, sub = '') => `
    <div class="tnr-tile">
      <div class="tnr-tile-cap">${cap}</div>
      <div class="tnr-tile-v">${v}</div>
      ${sub ? `<div class="tnr-tile-s">${sub}</div>` : ''}
    </div>`;
  const low = (r) => r.low.length > 2
    ? `${r.low.length} ${t('tnPlayers')} ${t('tnTied')}`
    : r.low.map(x => esc(x.name)).join(' · ');
  return `
    <div class="tnr-sec">${t('tnStatsTitle')}</div>
    <div class="tnr-stats sc-block">
      ${tile(t('tnPlayers'), `${s.players}`, `${t('tnFinished')}: ${s.finished}`)}
      ${s.rounds.map(r => tile(`${t('tnLowRound')} · R${r.round}`, `${r.low[0].gross} <small>(${esc(resultScoreText(r.low[0].toPar))})</small>`, low(r))).join('')}
      ${s.rounds.map(r => tile(`${t('tnFieldAvg')} · R${r.round}`, r.avg.toFixed(1), `${r.count} ${t('tnRounds')}`)).join('')}
      ${s.hasPars ? tile('Eagle · Birdie', `${s.eagles} · ${s.birdies}`) : ''}
    </div>`;
}

function teamsHTML(model) {
  const side = (k) => {
    const tm = model.teams[k];
    const win = model.winner === k;
    return `
      <div class="tnr-team${win ? ' tnr-team-win' : ''}">
        <div class="tnr-team-bar" style="background:${esc(tm.color)};"></div>
        ${tm.logo ? `<img src="${tm.logo}" alt="" />` : ''}
        <div style="font-size:0.82rem;font-weight:800;">${esc(tm.name)}</div>
        <div class="tnr-team-pts${win ? ' tnr-under' : ''}">${esc(resultPointsText(tm.points))}</div>
        ${win ? `<div class="tnr-champ-cap">🏆 ${t('tnWinner')}</div>` : ''}
      </div>`;
  };
  return `
    <div class="tnr-teams sc-block">
      ${side('a')}
      <div style="align-self:center;font-weight:800;color:#777;">—</div>
      ${side('b')}
    </div>
    ${!model.winner && model.complete ? `<div class="tnr-sec" style="text-align:center;">${t('tnTied')}</div>` : ''}`;
}

function sessionsHTML(model) {
  const a = model.teams.a;
  const b = model.teams.b;
  const names = (list) => esc(list.join(' / ') || '–');
  return model.sessions.filter(s => s.matches.length).map(s => {
    const label = [s.day !== null ? `${t('mpDay')} ${s.day}` : '', s.format].filter(Boolean).join(' — ') || t('tnResultsMatches');
    return `
      <div class="tnr-sec" style="display:flex;gap:8px;">
        <span>${esc(label)}</span>
        <span style="margin-left:auto;color:#111;">${esc(resultPointsText(s.totals.a))} – ${esc(resultPointsText(s.totals.b))}</span>
      </div>
      <div class="sc-scroll">
        <table class="tnr-table">
          <thead><tr><th>#</th><th class="tnr-name" style="color:${esc(a.color)};">${esc(a.short)}</th><th>${t('mpFinal')}</th><th class="tnr-name" style="color:${esc(b.color)};">${esc(b.short)}</th></tr></thead>
          <tbody>
            ${s.matches.map(m => {
              // The side that won — or leads, while play is on — is marked
              // three ways: its team colour on the names, a tick, and the
              // arrow beside the score pointing its way. A bolder weight
              // alone was not readable; a halved match says so in words.
              const done = m.state === 'COMPLETED';
              const side = done ? m.winner : m.leader;
              const team = side ? model.teams[side] : null;
              const color = team && /^#[0-9a-fA-F]{6}$/.test(team.color || '') ? team.color : '#C5780C';
              const cell = (k, list) => side === k
                ? `<td class="tnr-name tnr-win-cell" style="color:${color};background:${color}1A;">✓ ${names(list)}</td>`
                : `<td class="tnr-name${side ? ' tnr-lost' : ''}">${names(list)}</td>`;
              const score = done && m.winner === null ? t('mpHalved') : (m.result || '–');
              const arrow = side ? `<span style="color:${color};">${side === 'a' ? '◀' : '▶'}</span>` : '';
              return `
              <tr class="${done ? '' : 'tnr-out'}">
                <td>${m.number ?? ''}</td>
                ${cell('a', m.a)}
                <td class="tnr-tot">${side === 'a' ? `${arrow} ` : ''}${esc(score)}${side === 'b' ? ` ${arrow}` : ''}${m.state === 'LIVE' ? ` <small class="tnr-hcp">${t('mpThru')} ${m.thru}</small>` : ''}</td>
                ${cell('b', m.b)}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');
}

function standingsHTML(model) {
  if (!model.standings.length) return '';
  return `
    <div class="tnr-sec">${t('mpStandings')}</div>
    <div class="sc-scroll">
      <table class="tnr-table">
        <thead><tr><th>${t('tnPos')}</th><th class="tnr-name">${t('tnPlayer')}</th><th>P</th><th>W</th><th>L</th><th>H</th><th>${t('spPoints')}</th></tr></thead>
        <tbody>
          ${model.standings.map(r => `
            <tr class="${r.rank <= 3 ? 'tnr-top3' : ''}">
              <td>${esc(r.posLabel)}</td><td class="tnr-name">${esc(r.name)}</td>
              <td>${r.played}</td><td>${r.w}</td><td>${r.l}</td><td>${r.h}</td>
              <td class="tnr-tot">${esc(resultPointsText(r.points))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function sponsorsHTML(tn) {
  const list = tnSponsors(tn);
  if (!list.length) return '';
  return `
    <div class="tnr-sec">${t('tnSponsors')}</div>
    <div class="tnr-sponsors sc-block">
      ${list.map(s => `<img src="${s.logo}" alt="${esc(s.name || '')}" title="${esc(s.name || '')}" />`).join('')}
    </div>`;
}

function bodyHTML(tn, model) {
  if (model.kind === 'ryder') return `${teamsHTML(model)}${sessionsHTML(model)}`;
  if (model.kind === 'singles') {
    const lead = model.leaders;
    return `
      ${lead.length ? `
      <div class="tnr-champ sc-block">
        <div style="flex:1;min-width:0;">
          <div class="tnr-champ-cap">🏆 ${model.state === 'final' ? t('tnChampion') : t('tnLeading')}</div>
          <div class="tnr-champ-name">${lead.map(r => esc(r.name)).join(' · ')}</div>
        </div>
        <div class="tnr-champ-score"><b>${esc(resultPointsText(lead[0].points))}</b><small>${t('spPoints')}</small></div>
      </div>` : ''}
      ${standingsHTML(model)}`;
  }
  const empty = !model.boards.some(b => b.entries.length);
  return `
    ${championsHTML(tn, model)}
    ${empty
      ? `<p style="font-size:0.8rem;color:#555;padding:12px 0;">${t('tnEmpty')}</p>`
      : model.boards.map(b => boardTableHTML(tn, model, b)).join('')}
    ${statsHTML(model)}`;
}

const STYLE = `<style>
  .tnr-head { display: flex; gap: 14px; align-items: flex-start; }
  .tnr-crest { width: 64px; height: 64px; border-radius: 12px; border: 1px solid #e3dccb; padding: 6px; background: #fff; flex: none; object-fit: contain; }
  .tnr-title { font-family: var(--font-display), serif; font-weight: 900; font-size: 1.3rem; line-height: 1.15; color: #111; }
  .tnr-sub { font-size: 0.76rem; color: #555; margin-top: 4px; }
  .tnr-state { display: inline-block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #C5780C; margin-top: 8px; }
  .tnr-qrbox { text-align: center; flex: 0 0 auto; }
  .tnr-champ { display: flex; gap: 14px; align-items: center; margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #FBF6EA; border: 1px solid #EAD9B0; }
  .tnr-champ-cap { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #C5780C; }
  .tnr-champ-name { font-family: var(--font-display), serif; font-size: 1.25rem; font-weight: 900; line-height: 1.15; margin-top: 2px; color: #111; }
  .tnr-champ-sub { font-size: 0.72rem; color: #555; margin-top: 3px; }
  .tnr-champ-score { text-align: right; flex: none; }
  .tnr-champ-score b { display: block; font-size: 2rem; font-weight: 800; line-height: 1; color: #111; }
  .tnr-champ-score small { font-size: 0.66rem; color: #555; }
  .tnr-sec { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #555; margin: 16px 0 6px; }
  .sc-sheet .tnr-table { width: 100%; }
  .sc-sheet .tnr-table th { background: #efe9db; font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .sc-sheet .tnr-table td { white-space: nowrap; }
  .sc-sheet .tnr-table .tnr-name { text-align: left; white-space: normal; min-width: 120px; font-weight: 700; }
  .tnr-mem { display: block; font-size: 0.62rem; color: #666; font-weight: 500; }
  .tnr-hcp { font-size: 0.6rem; color: #777; font-weight: 600; }
  .tnr-top3 td:first-child { color: #C5780C; font-weight: 800; }
  .tnr-cutrow td { background: #fbf3e0; color: #C5780C; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; text-align: left; }
  .tnr-out td { color: #666; }
  .tnr-under { color: #D7263D; font-weight: 800; }
  .tnr-tot { font-weight: 800; }
  .sc-sheet .tnr-table .tnr-win-cell { font-weight: 900; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sc-sheet .tnr-table .tnr-lost { color: #666; font-weight: 400; }
  .tnr-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .tnr-tile { border: 1px solid #e3dccb; border-radius: 10px; padding: 8px 10px; }
  .tnr-tile-cap { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #777; }
  .tnr-tile-v { font-size: 1.05rem; font-weight: 800; margin-top: 2px; color: #111; }
  .tnr-tile-v small { font-size: 0.7rem; font-weight: 700; color: #555; }
  .tnr-tile-s { font-size: 0.66rem; color: #555; margin-top: 1px; }
  .tnr-teams { display: flex; gap: 12px; align-items: stretch; margin-top: 14px; }
  .tnr-team { flex: 1; text-align: center; padding: 12px; border-radius: 12px; border: 1px solid #e3dccb; }
  .tnr-team-win { background: #FBF6EA; border-color: #EAD9B0; }
  .tnr-team img { width: 44px; height: 44px; object-fit: contain; display: block; margin: 0 auto 6px; }
  .tnr-team-bar { height: 4px; border-radius: 2px; margin-bottom: 8px; }
  .tnr-team-pts { font-size: 2.2rem; font-weight: 800; line-height: 1.1; color: #111; }
  .tnr-sponsors { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .tnr-sponsors img { height: 34px; max-width: 110px; object-fit: contain; }
  @media (max-width: 480px) { .tnr-qrbox canvas { width: 88px; height: 88px; } .tnr-qrbox .sc-url { max-width: 96px !important; } }
</style>`;

// ---- Sharing ----
//
// Every card is drawn on the phone that shares it, at the moment the sheet
// opens — nothing is rendered ahead of time or stored. The sheet shows the
// picture, the format and option chips, and a caption; the phone's share
// sheet does the rest (Facebook, Instagram, Messenger, Viber), or a download
// where there is no share sheet.

const BADGE_KEY = { champion: 'shBadgeChampion', lowRound: 'shBadgeLowRound', madeCut: 'shBadgeCut', eagle: 'shBadgeEagle' };

// Every word on a card, translated here so the renderer stays i18n-free.
function imageLabels(model) {
  return {
    results: `${t('tnResults')} · ${t('tnFinal')}`,
    after: model?.kind === 'stroke' ? t('tnResultsAfter').replace('{n}', model.round) : `${t('tnResults')} · ${t('tnLive')}`,
    champion: t('tnChampion'), leading: t('tnLeading'), tied: t('tnTied'), winner: t('tnWinner'),
    strokes: t('tnStrokes').toLowerCase(), points: t('spPoints'), players: t('tnPlayers'), thru: t('tnThru'),
    pos: t('tnPos'), total: t('tnTotal'), team: t('tnTeam'), field: t('shField'), beatShort: t('shBeatShort'),
    byHole: t('shByHole'), bestRound: t('tnLowRound'), liveBoard: t('tnFullResults'),
    day: t('mpDay'), matches: t('tnResultsMatches'), scan: t('scScanHint'),
    statsTitle: t('tnStatsTitle'), lowRound: t('tnLowRound'), fieldAvg: t('tnFieldAvg'), finished: t('tnFinished'),
    rounds: t('tnRounds'), sponsors: t('tnSponsors'), live: t('tnLive'),
    division: divisionText,
    badge: (k) => t(BADGE_KEY[k] || k),
    beat: (n) => t('shBeat').replace('{n}', n)
  };
}

// The organiser's hashtag line, or one made from the name: #UBGolf #MCup2026.
function hashtagOf(tn) {
  const own = tnHashtag(tn);
  if (own) return own;
  const slug = String(tn?.name || '').replace(/[^\p{L}\p{N}]+/gu, '');
  return `#UBGolf${slug ? ` #${slug}` : ''}`;
}

// The background chips exist only when the tournament has a cover photo.
function sheetOptions(tn) {
  return tnCover(tn)
    ? { background: { value: 'cover', values: [{ key: 'cover', label: t('shBgCover') }, { key: 'navy', label: t('shBgNavy') }] } }
    : {};
}

function renderOpts(tn, url, model, extra = {}) {
  return {
    url,
    subtitle: subtitleText(tn),
    labels: imageLabels(model),
    cover: tnCover(tn),
    hashtag: hashtagOf(tn),
    sponsors: tnSponsors(tn).map(s => ({ name: s.name, logo: s.logo })),
    teamLogos: model?.kind === 'ryder' ? { a: model.teams.a.logo, b: model.teams.b.logo } : null,
    ...extra
  };
}

const fileSlug = (s) => String(s || 'ubgolf').replace(/[\\/:*?"<>|#]+/g, '').trim().replace(/\s+/g, '-');

/**
 * The tournament's cards — poster, story, carousel. ctx: { showToast,
 * stateOf(tn) → state }.
 */
export function shareTnResults(tn, ctx = {}, opts = {}) {
  if (!tn?.id) return;
  const state = opts.state || (ctx.stateOf ? ctx.stateOf(tn) : 'final');
  const model = tnResultModel(tn, { state });
  const url = pageUrl(`#/tnresult/${tn.id}`);
  const title = `${tn.name || ''} — ${t('tnResults')}`;
  const lead = model.kind === 'stroke'
    ? model.boards.filter(b => b.leaders.length)
      .map(b => `${b.division ? `${divisionText(b.division)}: ` : ''}${b.leaders.map(e => e.name).join(', ')} ${resultScoreText(b.leaders[0].total, model.points)}`)
      .join(' · ')
    : model.kind === 'ryder'
      ? `${model.teams.a.short} ${resultPointsText(model.teams.a.points)} – ${resultPointsText(model.teams.b.points)} ${model.teams.b.short}`
      : '';
  const caption = [title, lead ? `${model.state === 'final' ? t('tnChampion') : t('tnLeading')}: ${lead}` : '', hashtagOf(tn), url]
    .filter(Boolean).join('\n');
  const hasSponsors = tnSponsors(tn).length > 0;
  openShareSheet({
    title,
    kinds: [{ key: 'feed', label: t('shFeed') }, { key: 'story', label: t('shStory') }, { key: 'carousel', label: t('shCarousel') }],
    options: sheetOptions(tn),
    caption,
    fileBase: `${fileSlug(tn.name)}-${fileSlug(t('tnResults'))}`,
    showToast: ctx.showToast,
    build: async (kind, o) => {
      const ro = renderOpts(tn, url, model, { background: o.background });
      if (kind === 'carousel') return buildCarousel(tn, model, carouselPlan(model, { sponsors: hasSponsors }), ro);
      return [await buildShareImage(kind, tn, model, ro)];
    }
  });
}

/**
 * One player's own card — «Миний үр дүн». Anyone may share any card: the
 * data is the public board's. opts.avatar: the member's picture, when the
 * caller knows it is theirs.
 */
export function sharePlayerResult(tn, pid, ctx = {}, opts = {}) {
  if (!tn?.id || !pid) return;
  const state = opts.state || (ctx.stateOf ? ctx.stateOf(tn) : 'final');
  const me = playerShareModel(tn, pid, { state });
  if (!me) { ctx.showToast?.(t('tnShareFail'), 'error'); return; }
  const model = tnResultModel(tn, { state });
  const url = pageUrl(me.kind === 'stroke' ? `#/spcard/${tn.id}/${pid}` : `#/tournament/${tn.id}`);
  const title = `${me.name} — ${tn.name || ''}`;
  const line = me.kind === 'stroke'
    ? `${t('tnPos')} ${me.posLabel} · ${resultScoreText(me.total, me.points)}${me.gross !== null && me.gross !== undefined ? ` (${me.gross})` : ''}`
    : [me.team?.short || '', `${resultPointsText(me.record.points)} ${t('spPoints')}`, `${me.record.w}-${me.record.l}-${me.record.h}`].filter(Boolean).join(' · ');
  const caption = [title, line, hashtagOf(tn), url].filter(Boolean).join('\n');
  const options = {
    ...sheetOptions(tn),
    ...(me.kind === 'stroke' ? { hideStrokes: { value: false, label: t('shHideStrokes') } } : {})
  };
  openShareSheet({
    title: t('shMyResult'),
    kinds: [{ key: 'personal', label: t('shFeed') }, { key: 'personalStory', label: t('shStory') }],
    options,
    caption,
    fileBase: `${fileSlug(me.name)}-${fileSlug(tn.name)}`,
    showToast: ctx.showToast,
    build: async (kind, o) => [await buildShareImage(kind, tn, me,
      renderOpts(tn, url, model, { background: o.background, hideStrokes: o.hideStrokes, avatar: opts.avatar || null }))]
  });
}

/**
 * The page. ctx: { main, user, showToast, onUnsub, stateOf }.
 */
export async function renderTnResultsPage(tnId, ctx) {
  const host = ctx.main();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
  const tn = await store.loadTournament(tnId);
  if (!tn) {
    host.innerHTML = `<div class="detail-container fade-in"><div class="empty-state"><p>${t('tnEmpty')}</p><a href="#/" class="btn btn-outline">← ${t('back')}</a></div></div>`;
    return;
  }
  const state = ctx.stateOf ? ctx.stateOf(tn) : 'final';
  const model = tnResultModel(tn, { state });
  const url = pageUrl(`#/tnresult/${tnId}`);
  setPageTitle(ctx, `${tn.name || ''} — ${t('tnResults')}`);
  const logo = tnLogo(tn);
  const facts = [formatText(tn), model.kind === 'stroke' && tn.rounds ? `${tn.rounds * 18} ${t('tnHoles').toLowerCase()}` : '', tn.par ? `PAR ${tn.par}` : '']
    .filter(Boolean).join(' · ');

  host.innerHTML = `
    <div class="detail-container fade-in sc-clip">
      ${printStyleHTML()}
      ${STYLE}
      <div class="sc-no-print" style="margin-bottom:4px;">
        <a href="#/tournament/${esc(tnId)}" class="back-link" style="margin:0;">← ${t('back')}</a>
        <span style="flex:1;"></span>
        <button class="btn btn-outline btn-sm" id="tnr-copy-btn">${t('copyLink')}</button>
        <button class="btn btn-outline btn-sm" id="tnr-print-btn">🖨 ${t('scPrint')}</button>
        <button class="btn btn-primary btn-sm" id="tnr-share-btn" style="gap:6px;">${icon('share', { size: 14 })} ${t('tnShare')}</button>
      </div>
      <div class="sc-sheet">
        <div class="tnr-head">
          ${logo ? `<img class="tnr-crest" src="${logo}" alt="" />` : ''}
          <div style="flex:1;min-width:0;">
            <div class="tnr-title">${esc(tn.name || '')}</div>
            <div class="tnr-sub">${esc(subtitleText(tn))}</div>
            ${facts ? `<div class="tnr-sub">${esc(facts)}</div>` : ''}
            <div class="tnr-state">${esc(stateText(model))}</div>
          </div>
          <div class="tnr-qrbox">
            <canvas id="tnr-qr" width="120" height="120"></canvas>
            <div class="sc-url" style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
          </div>
        </div>
        ${bodyHTML(tn, model)}
        ${sponsorsHTML(tn)}
        <div style="margin-top:14px;font-size:0.7rem;color:#888;text-align:right;">${esc(tn.name || '')} · ${esc(tn.startDate || '')} · ubgolf.club</div>
      </div>
    </div>`;

  host.querySelector('#tnr-print-btn')?.addEventListener('click', () => window.print());
  host.querySelector('#tnr-copy-btn')?.addEventListener('click', () => copyUrl(url, ctx.showToast, t('copied')));
  host.querySelector('#tnr-share-btn')?.addEventListener('click', () => shareTnResults(tn, ctx, { state }));
  mountQr('tnr-qr', url);
}
