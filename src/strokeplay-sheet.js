// src/strokeplay-sheet.js
// The tournament's printable score card: #/spsheet/:tnId/:round/:gid
//
// One flight's cards on paper, in exactly the layout the casual game prints —
// the grid comes from scorecard-grid.js, so the two can never drift apart. A
// player who scored on the flight card can walk off with their own card and
// their team's; a marker can print the whole flight and have it signed.
//
// The route is guest-reachable so the printed QR opens for anyone, the same
// exposure the tournament board already has. Static by design: print is the
// point, so there is no live listener.

import * as store from './store.js';
import { t } from './i18n.js';
import { coursePar, courseTees } from './courses.js';
import {
  roundGross, tnPars, tnOneBall, isTeamEntry, teamMemberIds, fourballRound
} from './strokeplay.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML, setPageTitle } from './print-common.js';
import { scoreCardHTML, legendHTML } from './scorecard-grid.js';

// The grid reads a COURSE off the record it is handed, through courses.js. A
// tournament is not a game, so it hands over this stand-in — resolveCourse()
// takes the tournament's course key as readily as a game's location name.
// 'full18' also makes physicalHole() the identity, so a shotgun flight that
// starts on 12 still prints course holes 1..18, the way the scorer shows them.
const cardCtx = (tn) => ({
  location: tn.course || tn.venue,
  holes: 'full18',
  course: { par: Number(tn.par) || coursePar(tn.course || tn.venue) },
});

const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

// What the grid's TOT column and the to-par badge read.
function lineOf(holes, pars) {
  const { gross, holesIn, toPar } = roundGross(holes, pars);
  return { total: gross, thru: holesIn, toPar };
}

const hcpSub = (hcp, gross, thru) => {
  if (hcp === null) return '';
  const net = thru ? gross - hcp : null;
  return `<span style="font-size:0.7rem;color:#666;">HCP ${hcp}${net !== null ? ` · Net ${net}` : ''}</span>`;
};

// Marker and player sign the card; that is what makes it a scorecard rather
// than a printout. Kept off the screen version of nothing — it prints and
// displays alike, because a card shown on a phone is about to be printed.
const signHTML = () => `
  <div style="display:flex;gap:24px;margin-top:6px;font-size:0.68rem;color:#666;">
    <span style="flex:1;">${t('spSignMarker')} <span style="display:inline-block;border-bottom:1px solid #bbb;min-width:90px;">&nbsp;</span></span>
    <span style="flex:1;">${t('spSignPlayer')} <span style="display:inline-block;border-bottom:1px solid #bbb;min-width:90px;">&nbsp;</span></span>
  </div>`;

// One flight → the cards it prints. Which cards a format produces is the same
// rule the flight scorer follows: a one-ball team has no member cards because
// no member has strokes of their own, and a fourball pair has both — the
// members' own cards and the pair's best ball.
function flightCards(tn, round, flightPids, mine) {
  const players = tn.sp.players || {};
  const pars = tnPars(tn);
  const fourball = tn.format === 'fourball';
  const cards = [];

  const playerCard = (pid, team = null) => {
    const holes = tn.sp.scores?.[pid]?.[round] || {};
    const line = lineOf(holes, pars);
    const hcp = num(players[pid]?.hcp);
    return {
      pid, team,
      html: scoreCardHTML(cardCtx(tn), {
        title: players[pid]?.name || pid,
        sub: hcpSub(hcp, line.total, line.thru),
        holes, line,
      }),
    };
  };

  // A scramble or foursome team's one ball, printed as a card of its own.
  const teamBallCard = (pid) => {
    const holes = tn.sp.scores?.[pid]?.[round] || {};
    const line = lineOf(holes, pars);
    const hcp = num(players[pid]?.hcp);
    return {
      pid,
      html: scoreCardHTML(cardCtx(tn), {
        title: players[pid]?.name || pid,
        sub: [
          hcpSub(hcp, line.total, line.thru),
          `<span style="font-size:0.7rem;color:#888;">${esc(teamMemberIds(players[pid])
            .map(m => players[m]?.name || m).join(' · '))}</span>`,
        ].filter(Boolean).join(' '),
        holes, line,
      }),
    };
  };

  // A fourball pair scores no ball of its own — the card is derived, hole by
  // hole, from whichever partner's ball was better.
  const fourballTeamCard = (pid) => {
    const r = fourballRound(tn, players[pid], round);
    const line = { total: r.grossRound.gross, thru: r.grossRound.holesIn, toPar: r.grossRound.toPar };
    return {
      pid,
      html: scoreCardHTML(cardCtx(tn), {
        title: players[pid]?.name || pid,
        sub: `<span style="font-size:0.7rem;color:#666;">${t('spTeamBestBall')}${
          r.netRound.holesIn ? ` · ${t('spNet')} ${r.netRound.gross}` : ''}</span>`,
        holes: r.holes, line,
      }),
    };
  };

  for (const pid of flightPids) {
    if (!isTeamEntry(players[pid])) { cards.push(playerCard(pid)); continue; }
    if (fourball) {
      teamMemberIds(players[pid]).filter(m => players[m]).forEach(m => cards.push(playerCard(m, pid)));
      cards.push(fourballTeamCard(pid));
    } else {
      cards.push(teamBallCard(pid));
    }
  }

  // A pair's cards stay together — its members and then its ball — because a
  // marker printing the whole flight reads it pair by pair. The reader's own
  // pair leads, and inside it their own card is first, so the two cards they
  // came for are the two at the top whichever way the sheet is scoped.
  const blockOf = (c) => c.team || c.pid;
  const order = [];
  cards.forEach(c => { if (!order.includes(blockOf(c))) order.push(blockOf(c)); });
  const myBlock = mine.teamPid || mine.pid;
  const blockRank = (c) => (myBlock && blockOf(c) === myBlock ? -1 : order.indexOf(blockOf(c)));
  const isMine = (c) => c.pid === mine.pid || c.pid === mine.teamPid;
  return cards
    .map((c, i) => ({ ...c, i, mine: isMine(c) }))
    .sort((a, b) => blockRank(a) - blockRank(b)
      || (isMine(a) ? 0 : 1) - (isMine(b) ? 0 : 1)
      || a.i - b.i);
}

// Which entry in this flight is the signed-in member, and which team is theirs.
function mineIn(tn, user, flightPids) {
  const players = tn.sp.players || {};
  if (!user) return { pid: null, teamPid: null };
  const isMe = (pid) => pid === user.id || players[pid]?.userId === user.id;
  const teamPid = flightPids.find(pid => isTeamEntry(players[pid])
    && teamMemberIds(players[pid]).some(isMe)) || null;
  const pid = teamPid
    ? (teamMemberIds(players[teamPid]).find(isMe) || null)
    : (flightPids.find(isMe) || null);
  // A one-ball team plays no member card, so the team's ball IS their card.
  return { pid: tnOneBall(tn) ? null : pid, teamPid };
}

export async function renderSpSheetPage(tnId, round, gid, ctx) {
  const host = ctx.main();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let tn = null;
  try { tn = await store.loadTournament(tnId); } catch (_) { }
  const g = tn?.sp?.groups?.[round]?.[gid];
  if (!tn || !g) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${t(tn ? 'spNoGroups' : 'tnNotFound')}</p></div></div>`;
    return;
  }

  const players = tn.sp.players || {};
  const flightPids = Object.keys(g.players || {})
    .filter(pid => players[pid])
    .sort((a, b) => String(players[a].name || '').localeCompare(String(players[b].name || '')));
  const mine = mineIn(tn, ctx.user, flightPids);
  const cards = flightCards(tn, round, flightPids, mine);
  const hasMine = cards.some(c => c.mine);

  setPageTitle(ctx, `${tn.name || ''} R${round} ${t('spGroupCard')} ${g.number ?? ''} — ${t('gsTitle')}`);
  const url = pageUrl(`#/spsheet/${tnId}/${round}/${gid}`);

  const teeLabel = tn.tee
    ? (courseTees(tn.course || tn.venue).find(x => x.key === tn.tee)?.label || tn.tee) : null;
  const totalPar = Number(tn.par) || coursePar(tn.course || tn.venue);
  const meta = [
    `${t('tnRoundShort')}${round}`,
    g.teeTime ? `${t('scTeeTime')} ${g.teeTime}` : null,
    g.startHole ? `${t('spStartHole')} ${g.startHole}` : null,
    tn.rating ? `${t('gsCourseRating')} ${tn.rating}` : null,
    tn.slope ? `${t('gsSlope')} ${tn.slope}` : null,
    totalPar ? `${t('gsPar')} ${totalPar}` : null,
  ].filter(Boolean).map(esc).join(' · ');

  host.innerHTML = `
    <div class="detail-container fade-in sc-clip">
      ${printStyleHTML()}
      <div class="sc-no-print" style="margin-bottom:4px;">
        <a href="${ctx.user ? `#/spgroup/${esc(tnId)}/${esc(round)}/${esc(gid)}` : '#/'}" class="back-link" style="margin:0;">← ${t('back')}</a>
        <span style="flex:1;"></span>
        ${hasMine ? `
          <button class="btn btn-outline btn-sm" data-spsh-scope="all">${t('spSheetAll')}</button>
          <button class="btn btn-outline btn-sm" data-spsh-scope="mine">${t('spSheetMine')}</button>` : ''}
        <button class="btn btn-outline btn-sm" id="spsh-copy-btn">${t('copyLink')}</button>
        <button class="btn btn-primary btn-sm" id="spsh-print-btn">🖨 ${t('scPrint')}</button>
      </div>
      <div class="sc-sheet">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:1.15rem;">${esc(tn.name || '')}</div>
            <div style="font-size:0.78rem;color:#555;margin-top:3px;">${meta}</div>
            <div style="font-size:0.78rem;color:#555;margin-top:2px;">
              ${esc(tn.venue || '')}${teeLabel ? ` · Tees: ${esc(teeLabel)}` : ''}
            </div>
          </div>
          <div style="text-align:center;flex:0 0 auto;">
            <canvas id="spsh-qr" width="120" height="120"></canvas>
            <div class="sc-url" style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
          </div>
        </div>
        ${cards.map(c => `
          <div data-spsh-card${c.mine ? ' data-spsh-mine="1"' : ''}>
            ${c.html}
            ${signHTML()}
          </div>`).join('')}
        ${legendHTML()}
        <div style="margin-top:14px;font-size:0.7rem;color:#888;text-align:right;">
          ${esc(tn.name || '')} · ${t('tnRoundShort')}${esc(round)} · ${t('spGroupCard')} ${esc(g.number ?? '')}
        </div>
      </div>
    </div>`;

  document.getElementById('spsh-print-btn')?.addEventListener('click', () => window.print());
  document.getElementById('spsh-copy-btn')?.addEventListener('click', () => copyUrl(url, ctx.showToast, t('copied')));
  mountQr('spsh-qr', url);

  // Scope: hiding with `hidden` rather than a print rule means the page prints
  // exactly what is on screen, so nobody discovers at the printer that they
  // asked for one card and got four.
  const scope = (which) => {
    host.querySelectorAll('[data-spsh-card]').forEach(el => {
      el.hidden = which === 'mine' && el.dataset.spshMine !== '1';
    });
    host.querySelectorAll('[data-spsh-scope]').forEach(b => {
      b.className = `btn btn-${b.dataset.spshScope === which ? 'primary' : 'outline'} btn-sm`;
    });
  };
  host.querySelectorAll('[data-spsh-scope]').forEach(b =>
    b.addEventListener('click', () => scope(b.dataset.spshScope)));
  if (hasMine) scope('all');
}
