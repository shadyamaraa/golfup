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
import { holePar, holeSI, coursePar, courseTees, physicalHole } from './courses.js';
import { gameScoreLine, gamePlayingHcp, isCompMode, splitHcp, fmtToPar, groupsOf } from './game-score.js';
import { gameFormat, FORMAT_LABEL_KEY, groupMatches, skinsResult, stablefordResult } from './game-formats.js';
import { holeTimeline, HALVED } from './matchplay.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML, setPageTitle } from './print-common.js';

// Result colors, matching the printed legend. Under par is red here as on
// the club's cards (tokens-redesign.css keeps the same convention).
const CELL = {
  eagle: 'background:#c8a951;color:#fff;font-weight:700;',
  birdie: 'background:#c0392b;color:#fff;font-weight:700;',
  par: 'background:#fff;',
  bogey: 'background:#2e6da4;color:#fff;font-weight:700;',
  other: 'background:#1c1c1c;color:#fff;font-weight:700;',
};

function scoreCellStyle(strokes, par) {
  if (!strokes || !par) return CELL.par;
  const d = strokes - par;
  if (d <= -2) return CELL.eagle;
  if (d === -1) return CELL.birdie;
  if (d === 0) return CELL.par;
  if (d === 1) return CELL.bogey;
  return CELL.other;
}

const toParColor = (v) => v === null || v === 0 ? '#666' : v < 0 ? '#c0392b' : '#2e6da4';

// Sum of entered strokes over card holes from..to; thru counts entries.
function segGross(game, playerId, from, to) {
  const holes = game?.scores?.[playerId]?.holes || {};
  let gross = 0, thru = 0;
  for (let n = from; n <= to; n++) {
    const s = holes[n];
    if (s) { gross += s; thru++; }
  }
  return { gross, thru };
}

// ---- Player card (Best Approach layout) ----

function playerCardHTML(game, p, userRec) {
  const holeCount = gameHoleCount(game);
  const holes = game?.scores?.[p.id]?.holes || {};
  const hcp = gamePlayingHcp(game, p.id, userRec);
  const line = gameScoreLine(game, p.id, hcp);
  const hasPars = holePar(game, 1) !== null;
  const two9 = holeCount === 18;

  const segs = two9 ? [{ from: 1, to: 9, label: 'F' }, { from: 10, to: 18, label: 'B' }] : [{ from: 1, to: holeCount, label: null }];

  const holeCells = [], scoreCells = [], parCells = [], siCells = [];
  for (const seg of segs) {
    let segPar = 0;
    for (let n = seg.from; n <= seg.to; n++) {
      const s = holes[n] || null;
      const par = holePar(game, n);
      if (par) segPar += par;
      holeCells.push(`<th>${physicalHole(game, n)}</th>`);
      scoreCells.push(`<td style="${scoreCellStyle(s, par)}">${s ?? ''}</td>`);
      parCells.push(`<td>${par ?? ''}</td>`);
      siCells.push(`<td>${holeSI(game, n) ?? ''}</td>`);
    }
    if (seg.label) {
      const g = segGross(game, p.id, seg.from, seg.to);
      holeCells.push(`<th class="sc-sum">${seg.label}</th>`);
      scoreCells.push(`<td class="sc-sum">${g.thru ? g.gross : ''}</td>`);
      parCells.push(`<td class="sc-sum">${hasPars ? segPar : ''}</td>`);
      siCells.push(`<td class="sc-sum"></td>`);
    }
  }
  const totalPar = game.course?.par ?? coursePar(game.location);
  holeCells.push(`<th class="sc-sum">TOT</th>`);
  scoreCells.push(`<td class="sc-sum">${line.thru ? line.total : ''}</td>`);
  parCells.push(`<td class="sc-sum">${hasPars && totalPar ? totalPar : ''}</td>`);
  siCells.push(`<td class="sc-sum"></td>`);

  const badge = line.toPar !== null && line.thru
    ? `<span style="font-weight:800;font-size:0.95rem;color:${toParColor(line.toPar)};">${fmtToPar(line.toPar)}</span>` : '';
  const sub = typeof hcp === 'number'
    ? `<span style="font-size:0.7rem;color:#666;">HCP ${hcp}${line.net !== null ? ` · Net ${line.net}` : ''}</span>` : '';

  return `
    <div class="sc-block" style="margin-top:14px;">
      <div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-weight:700;font-size:0.95rem;">${esc(userRec?.username || p.name || '?')}</span>
        ${sub}
        <span style="margin-left:auto;">${badge}</span>
      </div>
      <div class="sc-scroll" style="margin-top:5px;">
        <table>
          <tr class="sc-head"><th class="sc-lbl">Hole</th>${holeCells.join('')}</tr>
          <tr><th class="sc-lbl">Score</th>${scoreCells.join('')}</tr>
          ${hasPars ? `<tr class="sc-head"><th class="sc-lbl">Par</th>${parCells.join('')}</tr>
          <tr class="sc-head"><th class="sc-lbl">HCP</th>${siCells.join('')}</tr>` : ''}
        </table>
      </div>
    </div>`;
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

// Match play: one table per group — each match, its result, and the hole-by-
// hole reading (A / B / –), hand-set holes starred.
function matchReportHTML(game, usersById) {
  const holeCount = gameHoleCount(game);
  const name = (p) => esc(usersById[p.id]?.username || p.name || '?');
  const groups = groupsOf(game);
  const tables = groups.map((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, usersById[p.id])]));
    const { matches } = groupMatches(game, gi, players, hcps, game.holeOverrides);
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
      return `
        <tr>
          <td style="text-align:left;white-space:nowrap;">${name(m.pair.a)}<br><span style="color:#777;">v</span> ${name(m.pair.b)}</td>
          <td style="text-align:left;white-space:nowrap;">${result}</td>
          ${cells}
        </tr>`;
    }).join('');
    return `
      <div style="margin-top:16px;">
        <div style="font-weight:800;font-size:0.9rem;letter-spacing:0.03em;">${t('gsMatches')}${groups.length > 1 ? ` — ${t('group')} ${gi + 1}` : ''}</div>
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

const legendHTML = () => `
  <div style="margin-top:16px;font-size:0.7rem;color:#333;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
    ${[['Eagle', CELL.eagle], ['Birdie', CELL.birdie], ['Par', CELL.par + 'border:1px solid #999;'], ['Bogey', CELL.bogey], ['Other', CELL.other]]
      .map(([n, s]) => `<span style="display:inline-flex;align-items:center;gap:5px;">${n} <span style="display:inline-block;width:12px;height:12px;${s}"></span></span>`).join('')}
  </div>`;

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

  const groups = groupsOf(game).filter(g => g.length > 0);
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
  const anyScores = players.some(p => segGross(game, p.id, 1, gameHoleCount(game)).thru > 0);

  const cardsHTML = groups.map((grp, i) => `
    ${groups.length > 1 ? `<div style="margin-top:18px;font-weight:800;font-size:0.85rem;color:#555;letter-spacing:0.05em;">${t('group')} ${i + 1}</div>` : ''}
    ${grp.map(p => playerCardHTML(game, p, usersById[p.id])).join('')}
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
