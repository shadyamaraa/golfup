// src/scorecard-grid.js
// The printed score card's grid, shared by the casual game's card page
// (#/scorecard/:gameId) and the tournament's (#/spsheet/…) so the two cannot
// drift apart. This is the club's Best Approach layout: Hole / Score / Par /
// HCP rows across 1..9 | F | 10..18 | B | TOT, with the classic result colours.
//
// Everything that varies comes in as arguments — a plain hole map and a
// heading — and the only thing read off the record is its COURSE, through
// courses.js. A tournament is not a game, so it passes a three-field stand-in:
//
//   { location: tn.course || tn.venue, holes: 'full18',
//     course: { par: Number(tn.par) || coursePar(tn.course) } }
//
// resolveCourse() takes a course key as readily as a name, so that is enough
// for the pars and stroke indexes to come out right.

import { gameHoleCount } from './handicap.js';
import { holePar, holeSI, coursePar, physicalHole } from './courses.js';
import { fmtToPar } from './game-score.js';
import { esc } from './print-common.js';

// Result colors, matching the printed legend. Under par is red here as on
// the club's cards (tokens-redesign.css keeps the same convention).
export const CELL = {
  eagle: 'background:#c8a951;color:#fff;font-weight:700;',
  birdie: 'background:#c0392b;color:#fff;font-weight:700;',
  par: 'background:#fff;',
  bogey: 'background:#2e6da4;color:#fff;font-weight:700;',
  other: 'background:#1c1c1c;color:#fff;font-weight:700;',
};

export function scoreCellStyle(strokes, par) {
  if (!strokes || !par) return CELL.par;
  const d = strokes - par;
  if (d <= -2) return CELL.eagle;
  if (d === -1) return CELL.birdie;
  if (d === 0) return CELL.par;
  if (d === 1) return CELL.bogey;
  return CELL.other;
}

export const toParColor = (v) => v === null || v === 0 ? '#666' : v < 0 ? '#c0392b' : '#2e6da4';

// Sum of entered strokes over card holes from..to; thru counts entries.
export function segSum(holes, from, to) {
  let gross = 0, thru = 0;
  for (let n = from; n <= to; n++) {
    const score = holes?.[n];
    if (score) { gross += score; thru++; }
  }
  return { gross, thru };
}

// ---- Score card (Best Approach layout) ----

// The printed grid, for a player's card or a team's ball. Everything it needs
// comes in as a plain hole map and a heading, so one table serves both rather
// than the one-ball formats growing a copy of it.
export function scoreCardHTML(game, { title, sub, holes, line }) {
  const holeCount = gameHoleCount(game);
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
      const g = segSum(holes, seg.from, seg.to);
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

  return `
    <div class="sc-block" style="margin-top:14px;">
      <div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-weight:700;font-size:0.95rem;">${esc(title)}</span>
        ${sub || ''}
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

export const legendHTML = () => `
  <div style="margin-top:16px;font-size:0.7rem;color:#333;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
    ${[['Eagle', CELL.eagle], ['Birdie', CELL.birdie], ['Par', CELL.par + 'border:1px solid #999;'], ['Bogey', CELL.bogey], ['Other', CELL.other]]
      .map(([n, s]) => `<span style="display:inline-flex;align-items:center;gap:5px;">${n} <span style="display:inline-block;width:12px;height:12px;${s}"></span></span>`).join('')}
  </div>`;
