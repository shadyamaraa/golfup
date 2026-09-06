// src/scorecard.js
// Printable, QR-shareable scorecard: #/scorecard/:gameId
//
// The paper artifact of a finished round, in the Best Approach layout: one
// compact card per player (Hole / Score / Par / HCP rows; 1..9 | F | 10..18 |
// B | TOT columns) with the classic result colors — eagle gold, birdie red,
// par white, bogey blue, worse black — plus the club's three separate
// contests as ranked reports: Front 9 net, Back 9 net, Overall 18 net.
//
// The route is guest-reachable so the QR on the printed card opens the same
// page for anyone; that shows this game's player names and scores, the same
// exposure as the #/join/ share link already blasted into Viber chats.
// Static by design: no live listener, print is the point.

import * as store from './store.js';
import { t } from './i18n.js';
import { gameHoleCount } from './handicap.js';
import { coursePar, courseTees } from './courses.js';
import { gameScoreLine, gamePlayingHcp, isCompMode, splitHcp, fmtToPar, groupsOf } from './game-score.js';
import {
  gameFormat, FORMAT_LABEL_KEY, groupMatches, skinsResult, stablefordResult,
  isTeamFormat, isOneBallFormat, groupTeams, groupTeamMatches, teamBallLine, teamHcp,
  gameHasAnyScore
} from './game-formats.js';
import { holeTimeline, HALVED } from './matchplay.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML, setPageTitle } from './print-common.js';
// The grid itself lives apart, so the tournament's printed card is the same
// card (see src/scorecard-grid.js).
import { segSum, scoreCardHTML, legendHTML } from './scorecard-grid.js';

function segGross(game, playerId, from, to) {
  return segSum(game?.scores?.[playerId]?.holes, from, to);
}

function playerCardHTML(game, p, userRec) {
  const hcp = gamePlayingHcp(game, p.id, userRec);
  const line = gameScoreLine(game, p.id, hcp);
  return scoreCardHTML(game, {
    title: userRec?.username || p.name || '?',
    sub: typeof hcp === 'number'
      ? `<span style="font-size:0.7rem;color:#666;">HCP ${hcp}${line.net !== null ? ` · Net ${line.net}` : ''}</span>` : '',
    holes: game?.scores?.[p.id]?.holes || {},
    line
  });
}

// A scramble or foursome team's one ball, printed as a card of its own —
// neither partner has an individual card to print.
function teamCardHTML(game, team, usersById, hcps) {
  const avg = teamHcp(hcps, team);
  const line = teamBallLine(game, team.id);
  return scoreCardHTML(game, {
    title: team.players.map(p => usersById[p.id]?.username || p.name || '?').join(' + '),
    sub: avg === null ? '' : `<span style="font-size:0.7rem;color:#666;">HCP ${avg}</span>`,
    holes: game?.teamScores?.[team.id]?.holes || {},
    line
  });
}

// ---- Reports: the three contests (F9 / B9 / 18 net) ----

// One ranked table. Complete segments with a net rank first (by net), then
// complete segments without a handicap (by gross), then unfinished cards
// (by holes entered). A mixed net/gross ordering is imperfect, but a
// handicap-less player still deserves a printed line.
function reportTableHTML(title, entries) {
  const rows = entries
    .filter(e => e.thru > 0)
    .sort((x, y) => {
      const g = (e) => e.thru < e.len ? 2 : e.net === null ? 1 : 0;
      return g(x) - g(y) || (x.net ?? x.gross) - (y.net ?? y.gross) || x.gross - y.gross || y.thru - x.thru;
    });
  if (!rows.length) return '';
  return `
    <div style="margin-top:16px;">
      <div style="font-weight:800;font-size:0.9rem;letter-spacing:0.03em;">${title}</div>
      <table style="margin-top:5px;min-width:260px;">
        <thead>
        <tr class="sc-head">
          <th style="width:24px;">#</th><th class="sc-lbl" style="text-align:left;">${t('tnPlayer')}</th>
          <th style="width:52px;">Gross</th><th style="width:44px;">HCP</th><th style="width:52px;">Net</th>
        </tr>
        </thead>
        <tbody>
        ${rows.map((r, i) => `
        <tr${i === 0 && r.net !== null && r.thru === r.len ? ' style="font-weight:700;background:#f3ecd9;"' : ''}>
          <td>${i + 1}</td>
          <td style="text-align:left;white-space:nowrap;">${esc(r.name)}${r.thru < r.len ? ` <span style="color:#999;">(${r.thru}/${r.len})</span>` : ''}</td>
          <td>${r.gross}</td><td>${r.hcp ?? ''}</td><td style="font-weight:700;">${r.net ?? ''}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Match play, and the three 2 v 2 team formats: one table per group — each
// contest, its result, and the hole-by-hole reading (A / B / –), hand-set holes
// starred. A side is a player in the 1 v 1 format and a two-player team in the
// others, which is the only difference between them here.
function matchReportHTML(game, usersById) {
  const holeCount = gameHoleCount(game);
  const team = isTeamFormat(game);
  const name = (side) => side?.players
    ? side.players.map(p => esc(usersById[p.id]?.username || p.name || '?')).join(' + ')
    : esc(usersById[side?.id]?.username || side?.name || '?');
  const groups = groupsOf(game);
  const tables = groups.map((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, usersById[p.id])]));
    const { matches } = team
      ? groupTeamMatches(game, gi, players, hcps, game.holeOverrides)
      : groupMatches(game, gi, players, hcps, game.holeOverrides);
    const live = matches.filter(m => m.thru > 0);
    if (!live.length) return '';
    let starred = false;
    const rows = live.map(m => {
      const cells = holeTimeline({ holes: m.holes, totalHoles: holeCount }).map(r => {
        const hand = m.source[r.hole] === 'override';
        if (hand) starred = true;
        const mark = r.result === 'a' ? 'A' : r.result === 'b' ? 'B' : r.result === HALVED ? '–' : '';
        return `<td style="${r.result === 'a' ? 'background:#e6efe9;' : r.result === 'b' ? 'background:#f5e5e3;' : ''}">${mark}${hand ? '*' : ''}</td>`;
      }).join('');
      const s = m.settled;
      const result = s.finished
        ? (s.winner === 'a' ? `<b>${name(m.pair.a)}</b> ${esc(m.status)}` : s.winner === 'b' ? `<b>${name(m.pair.b)}</b> ${esc(m.status)}` : 'HALVED')
        : `${esc(m.status)} (${m.thru}/${holeCount})`;
      // The one-ball formats have no individual cards on this sheet, so each
      // team's own gross rides along with its name.
      const ball = (line) => line && line.thru
        ? ` <span style="color:#777;font-weight:400;">${line.total}${line.toPar !== null ? ` (${fmtToPar(line.toPar)})` : ''}</span>` : '';
      return `
        <tr>
          <td style="text-align:left;white-space:nowrap;">${name(m.pair.a)}${ball(m.lines?.a)}<br><span style="color:#777;">v</span> ${name(m.pair.b)}${ball(m.lines?.b)}</td>
          <td style="text-align:left;white-space:nowrap;">${result}</td>
          ${cells}
        </tr>`;
    }).join('');
    return `
      <div style="margin-top:16px;">
        <div style="font-weight:800;font-size:0.9rem;letter-spacing:0.03em;">${t(team ? 'gsTeams' : 'gsMatches')}${groups.length > 1 ? ` — ${t('group')} ${gi + 1}` : ''}</div>
        <div class="sc-scroll"><table style="margin-top:5px;">
          <thead>
          <tr class="sc-head">
            <th class="sc-lbl" style="text-align:left;">Match</th><th class="sc-lbl" style="text-align:left;">Result</th>
            ${Array.from({ length: holeCount }, (_, i) => `<th style="width:22px;">${i + 1}</th>`).join('')}
          </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${starred ? `<div style="font-size:0.66rem;color:#777;margin-top:3px;">* ${t('gsHandSet')}</div>` : ''}
      </div>`;
  }).filter(Boolean).join('');
  return tables;
}

// Skins: each group's standings and the holes each player took.
function skinsReportHTML(game, usersById) {
  const name = (p) => esc(usersById[p.id]?.username || p.name || '?');
  const groups = groupsOf(game);
  return groups.map((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, usersById[p.id])]));
    const r = skinsResult(game, players, hcps);
    if (!r || !r.thru) return '';
    const rows = [...players].sort((x, y) => r.totals[y.id] - r.totals[x.id]).map((p, i) => `
      <tr${i === 0 && r.totals[p.id] > 0 ? ' style="font-weight:700;background:#f3ecd9;"' : ''}>
        <td>${i + 1}</td>
        <td style="text-align:left;white-space:nowrap;">${name(p)}</td>
        <td>${typeof hcps[p.id] === 'number' ? hcps[p.id] : ''}</td>
        <td style="font-weight:700;">${r.totals[p.id]}</td>
        <td style="text-align:left;">${r.perHole.filter(h => h.winner === p.id).map(h => h.pot > 1 ? `${h.hole} (${h.pot})` : h.hole).join(', ')}</td>
      </tr>`).join('');
    return `
      <div style="margin-top:16px;">
        <div style="font-weight:800;font-size:0.9rem;letter-spacing:0.03em;">${t('fmtSkins')}${groups.length > 1 ? ` — ${t('group')} ${gi + 1}` : ''}
          <span style="font-weight:400;color:#777;font-size:0.78rem;"> · ${r.net ? `${t('gsNet')} · HCP ${r.base}` : t('gsGrossPlay')}</span></div>
        <table style="margin-top:5px;min-width:260px;">
          <thead>
          <tr class="sc-head">
            <th style="width:24px;">#</th><th class="sc-lbl" style="text-align:left;">${t('tnPlayer')}</th>
            <th style="width:44px;">HCP</th><th style="width:52px;">Skins</th><th class="sc-lbl" style="text-align:left;">${t('tnHoles')}</th>
          </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${r.carry ? `<div style="font-size:0.72rem;color:#777;margin-top:3px;">${t('gsSkinsCarry')} ${r.carry} · ${t('gsSkinsUnclaimed')}</div>` : ''}
      </div>`;
  }).filter(Boolean).join('');
}

// Stableford: each group's players by points, with the hole-by-hole points
// beside them so the card can be checked against the paper one.
function stablefordReportHTML(game, usersById) {
  const holeCount = gameHoleCount(game);
  const name = (p) => esc(usersById[p.id]?.username || p.name || '?');
  const groups = groupsOf(game);
  return groups.map((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, usersById[p.id])]));
    const r = stablefordResult(game, players, hcps);
    if (!r || !r.thru) return '';
    if (!r.parsKnown) return `<div style="margin-top:16px;font-size:0.8rem;">${t('gsNoCourseCard')}</div>`;
    const rows = r.order.map((pid, i) => {
      const p = players.find(x => x.id === pid) || { id: pid };
      const e = r.perPlayer[pid];
      const cells = e.perHole.map(h => `<td${h.given ? ' style="font-weight:700;"' : ''}>${h.points === null ? '' : h.points}</td>`).join('');
      return `
        <tr${i === 0 ? ' style="font-weight:700;background:#f3ecd9;"' : ''}>
          <td>${i + 1}</td>
          <td style="text-align:left;white-space:nowrap;">${name(p)}</td>
          <td>${typeof e.hcp === 'number' ? e.hcp : ''}</td>
          <td style="font-weight:700;">${e.points}</td>
          ${cells}
        </tr>`;
    }).join('');
    return `
      <div style="margin-top:16px;">
        <div style="font-weight:800;font-size:0.9rem;letter-spacing:0.03em;">${t('fmtStableford')}${groups.length > 1 ? ` — ${t('group')} ${gi + 1}` : ''}
          <span style="font-weight:400;color:#777;font-size:0.78rem;"> · ${r.net ? t('gsNet') : t('gsGrossPlay')}</span></div>
        <div class="sc-scroll"><table style="margin-top:5px;">
          <thead>
          <tr class="sc-head">
            <th style="width:24px;">#</th><th class="sc-lbl" style="text-align:left;">${t('tnPlayer')}</th>
            <th style="width:44px;">HCP</th><th style="width:52px;">${t('gsPoints')}</th>
            ${Array.from({ length: holeCount }, (_, i) => `<th style="width:22px;">${i + 1}</th>`).join('')}
          </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).filter(Boolean).join('');
}

// Which printed report each format gets. A map, not a ternary: a format with
// no entry here prints nothing rather than another format's table.
const FORMAT_REPORT = {
  match: matchReportHTML,
  skins: skinsReportHTML,
  stableford: stablefordReportHTML,
  // The three 2 v 2 formats settle as matches, so they print as matches — with
  // teams in the Match column and, for the one-ball pair, each team's gross.
  scramble: matchReportHTML,
  fourball: matchReportHTML,
  foursome: matchReportHTML,
};

function reportsHTML(game, players, usersById) {
  const fmt = gameFormat(game);
  if (fmt !== 'stroke') {
    const body = FORMAT_REPORT[fmt] ? FORMAT_REPORT[fmt](game, usersById) : '';
    if (!body) return '';
    return `
      <div class="sc-page-break" style="margin-top:20px;border-top:2px solid #999;padding-top:8px;">
        <div style="font-weight:800;font-size:1rem;">${t('scReports')}</div>
        ${body}
      </div>`;
  }
  const holeCount = gameHoleCount(game);
  const entry = (p, from, to, hcpPart) => {
    const { gross, thru } = segGross(game, p.id, from, to);
    const len = to - from + 1;
    const u = usersById[p.id];
    return {
      name: u?.username || p.name || '?', gross, thru, len, hcp: hcpPart,
      net: thru === len && typeof hcpPart === 'number' ? gross - hcpPart : null,
    };
  };
  const withHcp = (p) => gamePlayingHcp(game, p.id, usersById[p.id]);

  let tables;
  if (holeCount === 18) {
    tables = [
      reportTableHTML(t('scFront9Net'), players.map(p => {
        const h = withHcp(p);
        return entry(p, 1, 9, typeof h === 'number' ? splitHcp(h).front : null);
      })),
      reportTableHTML(t('scBack9Net'), players.map(p => {
        const h = withHcp(p);
        return entry(p, 10, 18, typeof h === 'number' ? splitHcp(h).back : null);
      })),
      reportTableHTML(t('scOverallNet'), players.map(p => entry(p, 1, 18, withHcp(p)))),
    ];
  } else {
    tables = [reportTableHTML(t('gsNet'), players.map(p => entry(p, 1, holeCount, withHcp(p))))];
  }
  const body = tables.filter(Boolean).join('');
  if (!body) return '';
  return `
    <div class="sc-page-break" style="margin-top:20px;border-top:2px solid #999;padding-top:8px;">
      <div style="font-weight:800;font-size:1rem;">${t('scReports')}</div>
      ${body}
    </div>`;
}

// ---- Page ----

function headerHTML(game, url) {
  const c = game.course || {};
  const totalPar = c.par ?? coursePar(game.location);
  const teeLabel = c.tee
    ? (courseTees(game.location).find(x => x.key === c.tee)?.label || c.tee) : null;
  const meta = [
    `${esc(game.date || '')} ${esc(game.time || '')}`,
    c.rating ? `${t('gsCourseRating')} ${c.rating}` : null,
    c.slope ? `${t('gsSlope')} ${c.slope}` : null,
    totalPar ? `${t('gsPar')} ${totalPar}` : null,
    isCompMode(game) ? t('gsModeComp') : null,
    gameFormat(game) !== 'stroke' ? t(FORMAT_LABEL_KEY[gameFormat(game)]) : null,
  ].filter(Boolean).join(' · ');
  return `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:1.15rem;">${esc(c.name || game.location || '')}</div>
        <div style="font-size:0.78rem;color:#555;margin-top:3px;">${meta}</div>
        ${teeLabel ? `<div style="font-size:0.78rem;color:#555;margin-top:2px;">Tees: ${esc(teeLabel)}</div>` : ''}
      </div>
      <div style="text-align:center;flex:0 0 auto;">
        <canvas id="sc-qr" width="120" height="120"></canvas>
        <div class="sc-url" style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
      </div>
    </div>`;
}

export async function renderScorecardPage(gameId, ctx) {
  const host = ctx.main();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let game = null;
  try { game = await store.loadGame(gameId); } catch (_) { }
  if (!game || game.status === 'deleted') {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${t('gsGameNotFound')}</p></div></div>`;
    return;
  }

  setPageTitle(ctx, `${game.course?.name || game.location || ''} ${game.date || ''} — ${t('gsTitle')}`);

  // Empty groups are not printed, but the group INDEX still has to be the real
  // one: pairing (and so the teams) is stored per group index, and printing a
  // different split from the one the scorer shows would be worse than useless.
  const allGroups = groupsOf(game);
  const groups = allGroups.filter(g => g.length > 0);
  const groupIdxOf = (grp) => allGroups.indexOf(grp);
  const players = groups.flat();

  // Fresher usernames and the WHS-index → course-handicap fallback. Loaded
  // per player id (this is a public page — no reason to pull every user);
  // the card renders fine from the denormalized names if any of it fails.
  let usersById = {};
  try {
    const recs = await Promise.all(players.map(p => store.loadUserById(p.id).catch(() => null)));
    usersById = Object.fromEntries(recs.filter(Boolean).map(u => [u.id, u]));
  } catch (_) { }

  const url = pageUrl(`#/scorecard/${gameId}`);
  const anyScores = gameHasAnyScore(game);

  // A one-ball format prints one card per TEAM — a player card there would be
  // blank, since no player has strokes of their own — plus an individual card
  // for anyone with no team.
  const groupCards = (grp, gi) => {
    if (!isOneBallFormat(game)) return grp.map(p => playerCardHTML(game, p, usersById[p.id])).join('');
    const hcps = Object.fromEntries(grp.map(p => [p.id, gamePlayingHcp(game, p.id, usersById[p.id])]));
    const { teams, unpaired } = groupTeams(game, gi, grp);
    return teams.map(tm => teamCardHTML(game, tm, usersById, hcps)).join('')
      + unpaired.map(p => playerCardHTML(game, p, usersById[p.id])).join('');
  };

  const cardsHTML = groups.map((grp, i) => `
    ${groups.length > 1 ? `<div style="margin-top:18px;font-weight:800;font-size:0.85rem;color:#555;letter-spacing:0.05em;">${t('group')} ${groupIdxOf(grp) + 1}</div>` : ''}
    ${groupCards(grp, groupIdxOf(grp))}
  `).join('');

  host.innerHTML = `
    <div class="detail-container fade-in sc-clip">
      ${printStyleHTML()}
      <style>
        .sc-sheet .sc-lbl { min-width: 42px; background: #efe9db; text-align: left; padding-left: 6px; }
        .sc-sheet .sc-head th, .sc-sheet .sc-head td { background: #efe9db; font-weight: 700; }
        .sc-sheet .sc-sum { background: #ddd6c4; font-weight: 700; min-width: 26px; }
      </style>
      <div class="sc-no-print" style="margin-bottom:4px;">
        <a href="${ctx.user ? `#/game/${esc(gameId)}` : '#/'}" class="back-link" style="margin:0;">← ${t('back')}</a>
        <span style="flex:1;"></span>
        ${anyScores ? '' : `<span style="font-size:0.8rem;color:var(--text-secondary);">${t('scNoScores')}</span>`}
        <button class="btn btn-outline btn-sm" id="sc-copy-btn">${t('copyLink')}</button>
        <button class="btn btn-primary btn-sm" id="sc-print-btn">🖨 ${t('scPrint')}</button>
      </div>
      <div class="sc-sheet">
        ${headerHTML(game, url)}
        ${cardsHTML}
        ${legendHTML()}
        ${reportsHTML(game, players, usersById)}
        <div style="margin-top:14px;font-size:0.7rem;color:#888;text-align:right;">${esc(game.location || '')} - ${esc(game.date || '')}</div>
      </div>
    </div>`;

  document.getElementById('sc-print-btn')?.addEventListener('click', () => window.print());
  document.getElementById('sc-copy-btn')?.addEventListener('click', () => copyUrl(url, ctx.showToast, t('copied')));
  mountQr('sc-qr', url);
}
