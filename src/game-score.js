// src/game-score.js
// Casual-game scorecard: #/gscore/:gameId/:groupIdx
//
// The M Cup scorer's little sibling — a group standing on a green, one phone
// or four, entering everyone's strokes for the hole in seconds. Same
// construction as matchplay-score.js: no local scoring state, every tap is a
// path-scoped write and the RTDB listener paints what came back, so several
// markers in one group never diverge and offline taps still feel instant.
//
// Scores are keyed by the member's user id (group entries are the members
// themselves), so regrouping players never detaches a scorecard. When a
// player's round completes, a GHIN-shaped record lands under
// rounds/{ghinNumber}/{gameId} and their WHS handicap index is recomputed —
// see src/handicap.js and src/ghin.js.

import * as store from './store.js';
import { t, getLang } from './i18n.js';
import { gameHoleCount, roundFromGame, handicapIndex, courseHandicap } from './handicap.js';
import { holePar, holeSI } from './courses.js';
import { holeTimeline, HALVED } from './matchplay.js';
import {
  gameFormat, FORMAT_LABEL_KEY, isTeamFormat, isOneBallFormat,
  groupOrder, groupPairs, groupMatches, nextPairing, pairingOptions, allowanceTotal,
  groupTeams, teamContests, groupTeamMatches, teamStrokesOf, teamBallLine, teamHcp,
  skinsResult, stablefordResult
} from './game-formats.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MAX_STROKES = 15;
const DEFAULT_STROKES = 4;

// Which hole the group is looking at. null = follow the round (the first hole
// somebody in the group still has open); a number means they stepped back.
let viewHole = null;
let saving = false;
// Which match play hole has its hand-set chooser open: { key, hole } or null.
let ovOpen = null;

export function resetGameScorerView() {
  viewHole = null;
  saving = false;
  ovOpen = null;
}

// ---- Group helpers (same array/object tolerance as app.js ensureGroups) ----

export function groupsOf(game) {
  const g = game?.groups;
  if (!g) return [[]];
  const arr = Array.isArray(g) ? g : Object.values(g);
  return arr.map(grp => (Array.isArray(grp) ? grp : Object.values(grp || {})).filter(Boolean));
}

// ---- Access ----

// Admin and marshal edit anything; the game's creator their game; and group
// members mark each other — a player's own group is their scoring area, which
// is how paper scorecards work too.
export function canScoreGamePlayer(user, game, playerId) {
  if (!user || !game || !playerId) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  if (game.createdBy === user.id) return true;
  if (user.id === playerId) return true;
  return groupsOf(game).some(players => {
    const ids = players.map(p => p.id);
    return ids.includes(user.id) && ids.includes(playerId);
  });
}

// ---- Derived scoring ----

// "3-р Нүх" / "Hole #3" / "3번 홀" — each language shapes the phrase
// differently, so this is a function rather than an i18n key.
function holeTitle(n) {
  const l = getLang();
  if (l === 'en') return `Hole #${n}`;
  if (l === 'kr') return `${n}번 홀`;
  return `${n}-р Нүх`;
}

// "+4" / "E" / "−2" — golf's to-par notation.
export function fmtToPar(d) {
  if (d === 0) return 'E';
  return d > 0 ? `+${d}` : `−${-d}`;
}

// The playing handicap in force for a player in this game: the hand-entered
// per-game value wins; otherwise it is derived from the player's cached WHS
// index and the game's course rating/slope/par. null = no handicap known.
export function gamePlayingHcp(game, playerId, userRec) {
  const manual = game?.hcp?.[playerId];
  if (typeof manual === 'number') return manual;
  const c = game?.course || {};
  return courseHandicap(userRec?.hcpIndex, c.slope, c.rating, c.par);
}

// Is this game scored as the club's competition format — front 9, back 9,
// and the 18 counted as three separate contests? Chosen at game creation;
// only meaningful on an 18-hole game (a 9-hole game has one segment anyway).
export function isCompMode(game) {
  return game?.scoreMode === 'comp' && gameHoleCount(game) === 18 && gameFormat(game) === 'stroke';
}

// Competition handicap split across the nines: even halves evenly (12 → 6/6),
// an odd handicap puts the bigger half on the front nine (11 → 6/5).
export function splitHcp(hcp) {
  return { front: Math.ceil(hcp / 2), back: Math.floor(hcp / 2) };
}

// Gross total, holes entered, to-par (null without course pars), and net
// (null without a handicap). Net subtracts the playing handicap up front —
// an HCP 12 player opening with a par stands at "Нет −12" and each bogey
// walks it up one — the reading the club asked for. In competition mode the
// front and back nines net separately against their handicap halves
// (netF/netB), and netToPar is their sum — the 18-hole contest.
export function gameScoreLine(game, playerId, hcp) {
  const holeCount = gameHoleCount(game);
  const holes = game?.scores?.[playerId]?.holes || {};
  const comp = isCompMode(game);
  const segHcp = comp && typeof hcp === 'number' ? splitHcp(hcp) : null;
  // seg[0] = the whole round (normal), or the front nine; seg[1] = back nine.
  const segs = comp
    ? [{ from: 1, to: 9, hcp: segHcp?.front }, { from: 10, to: 18, hcp: segHcp?.back }]
    : [{ from: 1, to: holeCount, hcp: typeof hcp === 'number' ? hcp : null }];
  let total = 0, thru = 0, toPar = 0, parsKnown = true;
  const segNets = [], segGross = [];
  for (const seg of segs) {
    let segTotal = 0, segThru = 0, segParSum = 0, segParHoles = 0;
    for (let n = seg.from; n <= seg.to; n++) {
      const s = holes[n];
      if (!s) continue;
      segTotal += s;
      segThru++;
      const par = holePar(game, n);
      if (par) { segParSum += par; segParHoles++; }
    }
    total += segTotal;
    thru += segThru;
    if (segParHoles !== segThru) parsKnown = false;
    const segToPar = segThru && segParHoles === segThru ? segTotal - segParSum : null;
    toPar += segToPar ?? 0;
    segGross.push(segThru ? segTotal : null);
    segNets.push(segThru && segToPar !== null && seg.hcp !== null && seg.hcp !== undefined
      ? segToPar - seg.hcp : null);
  }
  const netToPar = segNets.some(n => n !== null)
    ? segNets.reduce((s, n) => s + (n ?? 0), 0) : null;
  return {
    total, thru,
    toPar: thru && parsKnown ? toPar : null,
    net: thru && typeof hcp === 'number' ? total - hcp : null,
    grossF: comp ? segGross[0] : null,
    grossB: comp ? segGross[1] : null,
    netF: comp ? segNets[0] : null,
    netB: comp ? segNets[1] : null,
    netToPar: thru && parsKnown ? netToPar : null,
  };
}

// What this screen is entering scores FOR: one unit per player, or — in a
// one-ball format — one per team plus one for any player with no team. Three
// places used to ask "has everybody done this hole?" by counting players, and
// in a scramble no player ever has a stroke of their own.
function scoreUnits(game, groupIdx, players) {
  const playerUnit = (p) => ({
    kind: 'player', key: p.id, players: [p],
    has: (n) => !!game?.scores?.[p.id]?.holes?.[n]
  });
  if (!isOneBallFormat(game)) return (players || []).map(playerUnit);
  const { teams, unpaired } = groupTeams(game, groupIdx, players);
  return [
    ...teams.map(tm => ({
      kind: 'team', key: tm.id, players: tm.players,
      has: (n) => teamStrokesOf(game, tm.id, n) !== null
    })),
    ...unpaired.map(playerUnit)
  ];
}

// Is every unit's score in for this hole? The strip's gold fill, in one place
// so the first render and the in-place patch can never disagree.
function holeComplete(units, n) {
  return units.length > 0 && units.every(u => u.has(n));
}

// The first hole somebody in the group has not entered yet — where a group
// arriving on the next tee wants to be without tapping anything.
function followHole(game, players, groupIdx = 0) {
  const holeCount = gameHoleCount(game);
  const units = scoreUnits(game, groupIdx, players);
  if (!units.length) return 1;
  for (let n = 1; n <= holeCount; n++) {
    if (!holeComplete(units, n)) return n;
  }
  return holeCount;
}

// ---- Rendering ----

// Golf reading for one hole's score against par: under par red, par muted,
// over par plain ink (same convention as the tournament board's tn-sc-*).
function strokeColor(strokes, par) {
  if (!strokes || !par) return 'var(--text-primary)';
  if (strokes < par) return 'var(--red)';
  if (strokes === par) return 'var(--text-secondary)';
  return 'var(--text-primary)';
}

function totalsLineText(game, pid, hcp) {
  const line = gameScoreLine(game, pid, hcp);
  if (!line.thru) return '—';
  let s = `${t('gsTotal')} ${line.total}`;
  if (line.toPar !== null) s += ` (${fmtToPar(line.toPar)})`;
  if (isCompMode(game)) {
    // Each nine is its own contest — show whichever have started.
    if (line.netF !== null) s += ` · ${t('gsNet')} F${fmtToPar(line.netF)}`;
    if (line.netB !== null) s += ` · B${fmtToPar(line.netB)}`;
  } else if (line.net !== null) {
    s += ` · ${t('gsNet')} ${line.netToPar !== null ? fmtToPar(line.netToPar) : line.net}`;
  }
  return s + ` · ${t('mpThru')} ${line.thru}`;
}

function hcpChipLabel(game, pid, userRec) {
  const hcp = gamePlayingHcp(game, pid, userRec);
  if (typeof hcp !== 'number') return 'HCP —';
  if (isCompMode(game)) {
    const { front, back } = splitHcp(hcp);
    return `HCP ${hcp} (${front}/${back})`;
  }
  return `HCP ${hcp}`;
}

// First name only — the row also carries the running score, HCP chip, and
// stepper, so the full "Овог Нэр" doesn't fit on a phone.
function shortName(p, userRec) {
  return userRec?.firstName || p.name || '?';
}

// A match side's name: a player's first name, or a team's two partners joined.
// Every match renderer below takes sides rather than players, so one card, one
// strip and one chooser serve both the 1 v 1 and the 2 v 2 formats.
function sideName(side, usersById) {
  if (side?.players) return side.players.map(p => shortName(p, usersById?.[p.id])).join(' + ');
  return shortName(side, usersById?.[side?.id]);
}

const sidePlayers = (side) => (side?.players || (side ? [side] : []));

// A side is yours to mark only if every player in it is.
function canScoreSide(user, game, side) {
  const list = sidePlayers(side);
  return list.length > 0 && list.every(p => canScoreGamePlayer(user, game, p.id));
}

// The score the player is "walking on" right now, shown beside their name:
// to-par where the course card is known ("+4"/"E"/"−2"), gross otherwise.
function runningScore(game, pid, hcp) {
  const line = gameScoreLine(game, pid, hcp);
  if (!line.thru) return { text: '', color: 'var(--text-secondary)' };
  if (line.toPar !== null) {
    return {
      text: fmtToPar(line.toPar),
      color: line.toPar < 0 ? 'var(--red)' : line.toPar === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
    };
  }
  return { text: String(line.total), color: 'var(--text-primary)' };
}

function playerRowHTML(game, p, hole, editable, userRec) {
  const strokes = game?.scores?.[p.id]?.holes?.[hole] ?? null;
  const hcp = gamePlayingHcp(game, p.id, userRec);
  const run = runningScore(game, p.id, hcp);
  const stepBtn = (kind, label, disabled) => `
    <button data-gs="${kind}" data-pid="${esc(p.id)}" ${disabled ? 'disabled' : ''}
      style="width:52px;height:52px;border-radius:12px;cursor:pointer;font-family:var(--font);
             border:2px solid var(--border-color);background:var(--bg-card-hover);
             color:var(--text-primary);font-size:1.35rem;font-weight:800;
             ${disabled ? 'opacity:0.35;cursor:default;' : ''}">${label}</button>`;
  // The hand-entered per-game handicap chip; markers tap it to set or fix a
  // player's playing handicap until GHIN can supply one.
  const hcpChip = editable ? `
    <button data-gs="hcp" data-pid="${esc(p.id)}"
      style="border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);
             border-radius:999px;padding:1px 8px;font-size:0.66rem;font-weight:700;cursor:pointer;
             font-family:var(--font);flex-shrink:0;">${hcpChipLabel(game, p.id, userRec)}</button>`
    : (typeof hcp === 'number' ? `<span style="font-size:0.66rem;color:var(--text-secondary);flex-shrink:0;">HCP ${hcp}</span>` : '');
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortName(p, userRec))}</span>
          <b data-gs-run="${esc(p.id)}" style="font-size:0.9rem;flex-shrink:0;color:${run.color};">${run.text}</b>
          ${hcpChip}
        </div>
        <div data-gs-tot="${esc(p.id)}" style="font-size:0.72rem;color:var(--text-secondary);">
          ${totalsLineText(game, p.id, hcp)}
        </div>
      </div>
      ${editable ? stepBtn('minus', '−', strokes === null) : ''}
      <div data-gs-val="${esc(p.id)}" style="width:44px;text-align:center;font-size:1.5rem;font-weight:800;color:${strokeColor(strokes, holePar(game, hole))};">
        ${strokes ?? '·'}
      </div>
      ${editable ? stepBtn('plus', '+', strokes !== null && strokes >= MAX_STROKES) : ''}
    </div>`;
}

// One team's row in a one-ball format: the two partners' names, the team's own
// running ball and a single stepper — because a scramble team writes one score,
// not two.
//
// The per-partner HCP chips underneath are load-bearing, not decoration: the
// individual rows are gone in these formats, so this is the only place a
// marker can set a playing handicap, and without one the team has no average
// and the contest silently plays gross.
function teamRowHTML(game, team, hole, editable, usersById, hcps, diff) {
  const strokes = teamStrokesOf(game, team.id, hole);
  const line = teamBallLine(game, team.id, diff || 0);
  const avg = teamHcp(hcps, team);
  const run = !line.thru ? { text: '', color: 'var(--text-secondary)' }
    : line.toPar !== null
      ? {
        text: fmtToPar(line.toPar),
        color: line.toPar < 0 ? 'var(--red)' : line.toPar === 0 ? 'var(--text-secondary)' : 'var(--text-primary)'
      }
      : { text: String(line.total), color: 'var(--text-primary)' };
  const stepBtn = (kind, label, disabled) => `
    <button data-gs="${kind}" data-team="${esc(team.id)}" ${disabled ? 'disabled' : ''}
      style="width:52px;height:52px;border-radius:12px;cursor:pointer;font-family:var(--font);
             border:2px solid var(--border-color);background:var(--bg-card-hover);
             color:var(--text-primary);font-size:1.35rem;font-weight:800;
             ${disabled ? 'opacity:0.35;cursor:default;' : ''}">${label}</button>`;
  const partnerChip = (p) => editable ? `
    <button data-gs="hcp" data-pid="${esc(p.id)}"
      style="border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);
             border-radius:999px;padding:1px 8px;font-size:0.62rem;font-weight:700;cursor:pointer;
             font-family:var(--font);flex-shrink:0;">${esc(shortName(p, usersById?.[p.id]))} ${hcpChipLabel(game, p.id, usersById?.[p.id])}</button>`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(sideName(team, usersById))}</span>
          <b data-gs-trun="${esc(team.id)}" style="font-size:0.9rem;flex-shrink:0;color:${run.color};">${run.text}</b>
          <span data-gs-thcp="${esc(team.id)}" style="font-size:0.66rem;color:var(--text-secondary);flex-shrink:0;">${avg === null ? '' : `HCP ${avg}`}</span>
        </div>
        <div data-gs-ttot="${esc(team.id)}" style="font-size:0.72rem;color:var(--text-secondary);">
          ${esc(teamLineText(line))}
        </div>
        ${editable ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">${team.players.map(partnerChip).join('')}</div>` : ''}
      </div>
      ${editable ? stepBtn('tminus', '−', strokes === null) : ''}
      <div data-gs-tval="${esc(team.id)}" style="width:44px;text-align:center;font-size:1.5rem;font-weight:800;color:${strokeColor(strokes, holePar(game, hole))};">
        ${strokes ?? '·'}
      </div>
      ${editable ? stepBtn('tplus', '+', strokes !== null && strokes >= MAX_STROKES) : ''}
    </div>`;
}

// The rows this screen enters scores on: one per player, or — in a one-ball
// format — one per team plus one for any player with no team.
function scoreRowsHTML(game, groupIdx, players, hole, user, usersById) {
  if (!isOneBallFormat(game)) {
    return players.map(p => playerRowHTML(game, p, hole,
      canScoreGamePlayer(user, game, p.id), usersById?.[p.id])).join('');
  }
  const hcps = hcpsFor(game, players, usersById);
  const { teams, unpaired } = groupTeams(game, groupIdx, players);
  // Each team's allowance comes from the contest it is playing, so read it off
  // the settled matches rather than working it out a second time here.
  const diffs = {};
  groupTeamMatches(game, groupIdx, players, hcps, game.holeOverrides).matches.forEach(m => {
    diffs[m.pair.a.id] = m.allowance.a;
    diffs[m.pair.b.id] = m.allowance.b;
  });
  return teams.map(tm => teamRowHTML(game, tm, hole,
    canScoreSide(user, game, tm), usersById, hcps, diffs[tm.id])).join('')
    + unpaired.map(p => playerRowHTML(game, p, hole,
      canScoreGamePlayer(user, game, p.id), usersById?.[p.id])).join('');
}

// A compact strip of every hole: the number and how many of the group have it
// entered. Tapping a hole jumps to it — that is the correction affordance.
function stripHTML(game, players, hole, groupIdx = 0) {
  const holeCount = gameHoleCount(game);
  const units = scoreUnits(game, groupIdx, players);
  const cells = [];
  for (let n = 1; n <= holeCount; n++) {
    const entered = units.filter(u => u.has(n)).length;
    const full = holeComplete(units, n);
    const on = n === hole;
    // Gold bg + navy ink for a completed hole — the app's on-gold convention
    // (.filter-tab.active), legible in both themes; #fff would wash out on
    // the cream light theme. The cell's big figure is the hole's PAR (the
    // group reads the next tee off the strip); completion already shows as
    // the gold fill. Courses without a card fall back to the entered count.
    cells.push(`
      <button data-gs="goto" data-hole="${n}"
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
               border:${on ? '2px solid var(--text-primary)' : '1px solid var(--border-color)'};
               background:${full ? 'var(--gold)' : 'transparent'};
               color:${full ? '#0C3051' : 'var(--text-secondary)'};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${n}</div>${holePar(game, n) ?? (entered || '·')}
      </button>`);
  }
  return `<div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:14px;">${cells.join('')}</div>`;
}

// May this member finish/reopen the round? Same circle as the scoring-mode
// toggle: the game's creator and officials.
function canFinishGame(user, game) {
  return !!user && (game?.createdBy === user.id
    || user.role === 'admin' || user.role === 'marshal');
}

// The final-results report shown under the score table once the round is
// finished: per player, gross and net for F9 / B9 / the 18 in competition
// mode, or just the 18 in normal mode.
function reportHTML(game, players, usersById, groupIdx = 0) {
  if (!game?.finishedAt) return '';
  const comp = isCompMode(game);
  const rows = players.map(p => {
    const hcp = gamePlayingHcp(game, p.id, usersById?.[p.id]);
    return { p, ...gameScoreLine(game, p.id, hcp) };
  }).filter(r => r.thru > 0);
  rows.sort((a, b) => (a.netToPar ?? a.total) - (b.netToPar ?? b.total));
  const cell = (gross, net) => `
    <td style="padding:6px 4px;text-align:right;white-space:nowrap;">
      ${gross !== null ? `<b>${gross}</b>` : '—'}${net !== null ? ` <span style="color:${net < 0 ? 'var(--red)' : 'var(--text-secondary)'};font-weight:700;">${fmtToPar(net)}</span>` : ''}
    </td>`;
  const head = (label) => `<th style="padding:4px;text-align:right;font-size:0.62rem;letter-spacing:0.06em;color:var(--text-secondary);">${label}</th>`;
  return `
    <div id="gs-report" style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;margin-top:10px;">
      <div style="font-weight:800;font-size:0.85rem;display:flex;align-items:center;gap:6px;">
        🏁 ${t('gsReport')}
        ${rows.length ? '<span style="margin-left:auto;font-size:0.66rem;font-weight:600;color:var(--text-secondary);">G · N</span>' : ''}
      </div>
      ${formatReportHTML(game, players, usersById, groupIdx)}
      ${!rows.length ? '' : `
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-variant-numeric:tabular-nums;font-size:0.82rem;">
        <tr>
          <th style="padding:4px;text-align:left;font-size:0.62rem;letter-spacing:0.06em;color:var(--text-secondary);"></th>
          ${comp ? head('F9') + head('B9') + head('18') : head('18')}
        </tr>
        ${rows.map(r => `
          <tr style="border-top:1px solid var(--border-color);">
            <td style="padding:6px 4px;font-weight:700;overflow:hidden;text-overflow:ellipsis;max-width:110px;white-space:nowrap;">${esc(shortName(r.p, usersById?.[r.p.id]))}</td>
            ${comp
              ? cell(r.grossF, r.netF) + cell(r.grossB, r.netB) + cell(r.total, r.netToPar)
              : cell(r.total, r.netToPar)}
          </tr>`).join('')}
      </table>`}
    </div>`;
}

// ---- Format panels: match play and skins, derived from the strokes above ----

const MP_A = '#1f6f43';
const MP_B = '#b3382c';

function hcpsFor(game, players, usersById) {
  return Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, usersById?.[p.id])]));
}

// A match's per-hole strip: A / B / – like the M Cup scorer's, a small dot
// after a hand-set hole, a dashed ring on the hole the walk is waiting for.
// Tapping a cell opens the hand-set chooser — the concession affordance.
function matchStripHTML(m, editable) {
  const rows = holeTimeline({ holes: m.holes, totalHoles: m.totalHoles });
  const cell = (r) => {
    const res = r.result;
    const bg = res === 'a' ? MP_A : res === 'b' ? MP_B : 'transparent';
    const fg = res === 'a' || res === 'b' ? '#fff' : 'var(--text-secondary)';
    const mark = res === 'a' ? 'A' : res === 'b' ? 'B' : res === HALVED ? '–' : '·';
    const hand = m.source[r.hole] === 'override';
    const on = ovOpen && ovOpen.key === m.pair.key && ovOpen.hole === r.hole;
    const gap = m.gapHole === r.hole;
    return `
      <button data-gs="ov-open" data-key="${esc(m.pair.key)}" data-hole="${r.hole}" ${editable ? '' : 'disabled'}
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:${editable ? 'pointer' : 'default'};font-family:var(--font);
               border:${on ? '2px solid var(--text-primary)' : gap ? '2px dashed var(--amber)' : '1px solid var(--border-color)'};
               background:${bg};color:${fg};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${r.hole}</div>${mark}${hand ? '<span style="font-size:0.5rem;vertical-align:top;">•</span>' : ''}
      </button>`;
  };
  return `<div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:10px;">${rows.map(cell).join('')}</div>`;
}

// The four-way chooser for one hole: A won / halved / B won / back to auto.
function overrideChooserHTML(m, usersById) {
  const hole = ovOpen.hole;
  const cur = m.holes[hole] ?? null;
  const hand = m.source[hole] === 'override';
  const btn = (value, label, color, active) => `
    <button data-gs="ov-set" data-key="${esc(m.pair.key)}" data-hole="${hole}" data-value="${esc(value)}"
      style="flex:1;min-width:62px;padding:10px 6px;border-radius:10px;cursor:pointer;font-family:var(--font);
             border:2px solid ${color};background:${active ? color : 'transparent'};
             color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.8rem;font-weight:800;">${esc(label)}</button>`;
  return `
    <div style="margin-top:8px;padding:8px;border:1px dashed var(--border-color);border-radius:10px;">
      <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">${t('mpHole')} ${hole} · ${t('gsHandSet')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${btn(m.pair.a.id, sideName(m.pair.a, usersById), MP_A, hand && cur === 'a')}
        ${btn(HALVED, t('mpHalved'), 'var(--text-secondary)', hand && cur === HALVED)}
        ${btn(m.pair.b.id, sideName(m.pair.b, usersById), MP_B, hand && cur === 'b')}
        ${btn('', t('gsAuto'), 'var(--border-color)', !hand)}
      </div>
    </div>`;
}

// One team's own ball as a line under its name — scramble and foursome only,
// where no player has a card of their own to read it off.
function teamLineText(line) {
  if (!line || !line.thru) return '—';
  let out = `${t('gsTotal')} ${line.total}`;
  if (line.toPar !== null) out += ` (${fmtToPar(line.toPar)})`;
  if (line.given) {
    out += ` · ${t('gsNet')} ${line.netToPar !== null ? fmtToPar(line.netToPar) : line.net}`;
  }
  return out;
}

// One match: names either side of the status line, the allowance, the strip.
// A "side" is a player in the 1 v 1 format and a two-player team in the 2 v 2
// ones, which is why nothing here reads .name or .id directly.
function matchCardHTML(game, m, editable, usersById) {
  const aName = sideName(m.pair.a, usersById);
  const bName = sideName(m.pair.b, usersById);
  const s = m.settled;
  const leadName = s.leader === 'a' ? aName : s.leader === 'b' ? bName : '';
  const status = s.finished
    ? (s.winner ? `${leadName} ${m.status}` : t('mpHalved'))
    : (s.leader ? `${leadName} ${m.status}` : 'AS');
  const sub = s.finished ? t('mpFinal') : `${t('mpThru')} ${m.thru}${s.dormie ? ` · ${t('mpDormie')}` : ''}`;
  const al = m.allowance;
  const diff = al.a || al.b;
  // Fourball's allowance is four separate differences off the lowest of the
  // four, which does not fit one line — name the base the way skins does.
  const allowText = !al.net ? t('gsGrossPlay')
    : al.strokes ? `${t('gsNet')} · HCP ${al.base}`
      : !diff ? t('gsNet')
        : `${al.a ? aName : bName} +${allowanceTotal(game, diff)} ${t('gsStrokesShort')}`;
  const open = ovOpen && ovOpen.key === m.pair.key;
  return `
    <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;margin-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${MP_A};">${esc(aName)}</span>
        <span style="flex:0 0 auto;text-align:center;">
          <div style="font-size:1.05rem;font-weight:800;line-height:1.2;">${esc(status)}</div>
          <div style="font-size:0.64rem;color:var(--text-secondary);">${esc(sub)}</div>
        </span>
        <span style="flex:1;min-width:0;text-align:right;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${MP_B};">${esc(bName)}</span>
      </div>
      <div style="font-size:0.68rem;color:var(--text-secondary);text-align:center;margin-top:3px;">${esc(allowText)}</div>
      ${m.lines ? `
        <div style="display:flex;gap:8px;margin-top:5px;font-size:0.7rem;color:var(--text-secondary);">
          <span style="flex:1;min-width:0;">${esc(teamLineText(m.lines.a))}</span>
          <span style="flex:1;min-width:0;text-align:right;">${esc(teamLineText(m.lines.b))}</span>
        </div>` : ''}
      ${m.gapHole && editable ? `
        <div style="font-size:0.72rem;color:var(--amber);font-weight:700;text-align:center;margin-top:6px;">
          ${esc(t('gsGapHint').replace('{n}', m.gapHole))}
        </div>` : ''}
      ${matchStripHTML(m, editable)}
      <div style="font-size:0.66rem;color:var(--text-muted);margin-top:5px;text-align:center;">
        A = ${esc(aName)} · B = ${esc(bName)} · – = ${t('mpHalved')}${editable ? ` · ${t('gsTapHoleHint')}` : ''}
      </div>
      ${open && editable ? overrideChooserHTML(m, usersById) : ''}
    </div>`;
}

// The panel every match format shows: one card per contest, a note for whoever
// has nobody to play, and the ⇄ that re-splits the group. It serves the 1 v 1
// match and all three 2 v 2 team formats — only where the contests come from
// differs, because a team match settles through the same engine.
function matchPanelHTML(game, groupIdx, players, user, usersById) {
  const hcps = hcpsFor(game, players, usersById);
  const team = isTeamFormat(game);
  const { matches, unpaired, spareTeams = [] } = team
    ? groupTeamMatches(game, groupIdx, players, hcps, game.holeOverrides)
    : groupMatches(game, groupIdx, players, hcps, game.holeOverrides);
  if (!matches.length && !unpaired.length && !spareTeams.length) return '';
  const cards = matches.map(m => matchCardHTML(game, m,
    canScoreSide(user, game, m.pair.a) && canScoreSide(user, game, m.pair.b), usersById)).join('');
  const noContest = (side, label) => `
    <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:6px;padding:0 4px;">
      ${esc(sideName(side, usersById))} · ${label}
    </div>`;
  // A team with nobody to play still keeps its ball; so does a player with no
  // team, exactly as the odd player of a 1 v 1 group does.
  const odd = spareTeams.map(tm => noContest(tm, t('gsNoTeamMatch'))).join('')
    + unpaired.map(p => noContest(p, t('gsNoMatch'))).join('');
  // Four players can be split three ways; whoever can score this group may
  // pick the split — the pairing is settled on the first tee by the people
  // standing there, and cycling it loses nothing (strokes are per player or
  // per team, and hand-set holes are per contest).
  const canRepair = pairingOptions(players).length > 1 && players.some(p => canScoreGamePlayer(user, game, p.id));
  const pairingLine = pairingOptions(players).length > 1 ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:0 4px;font-size:0.72rem;color:var(--text-secondary);">
      <span style="flex:1;min-width:0;">${t(team ? 'gsTeams' : 'gsPairing')}: ${matches.map(m =>
        `${esc(sideName(m.pair.a, usersById))}–${esc(sideName(m.pair.b, usersById))}`).join(' · ')}</span>
      ${canRepair ? `<button data-gs="repair" class="btn btn-outline btn-sm" style="font-size:0.68rem;flex-shrink:0;">⇄ ${t('gsRepair')}</button>` : ''}
    </div>` : '';
  return `<div id="gs-format" style="margin-top:10px;">${cards}${odd}${pairingLine}</div>`;
}

// Skins: standings chips, then the strip — a won hole carries the winner's
// initial on gold with the pot beside the hole number, a tie shows the carry
// arrow, and the cells still jump to the hole like the strokes strip below.
function skinsPanelHTML(game, players, usersById) {
  const hcps = hcpsFor(game, players, usersById);
  const r = skinsResult(game, players, hcps);
  if (!r) return '';
  const nameOf = (pid) => shortName(players.find(x => x.id === pid) || { id: pid }, usersById?.[pid]);
  const standing = [...players]
    .sort((x, y) => r.totals[y.id] - r.totals[x.id])
    .map(p => `
      <span style="display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:999px;padding:2px 9px;font-size:0.76rem;font-weight:700;">
        ${esc(nameOf(p.id))} <b style="font-size:0.92rem;">${r.totals[p.id]}</b>
      </span>`).join('');
  const holeCount = gameHoleCount(game);
  const byHole = Object.fromEntries(r.perHole.map(h => [h.hole, h]));
  const cells = [];
  for (let n = 1; n <= holeCount; n++) {
    const h = byHole[n];
    const won = !!(h && h.winner);
    const mark = !h ? '·' : won ? esc(nameOf(h.winner).charAt(0).toUpperCase()) : '↷';
    cells.push(`
      <button data-gs="goto" data-hole="${n}"
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
               border:1px solid var(--border-color);background:${won ? 'var(--gold)' : 'transparent'};
               color:${won ? '#0C3051' : 'var(--text-secondary)'};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${n}${h ? ` · ${h.pot}` : ''}</div>${mark}
      </button>`);
  }
  const netText = r.net ? `${t('gsNet')} · HCP ${r.base}` : t('gsGrossPlay');
  return `
    <div id="gs-format" style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <b style="font-size:0.8rem;">${t('fmtSkins')}</b>
        <span style="font-size:0.7rem;color:var(--text-secondary);">${esc(netText)}</span>
        ${r.carry ? `<span class="pill-soft" style="font-size:0.7rem;margin-left:auto;">${t('gsSkinsCarry')} ${r.carry}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${standing}</div>
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:10px;">${cells.join('')}</div>
    </div>`;
}

// Stableford: every player against par off their full handicap. The chips
// carry each player's running points; the strip shows the hole's points for
// whoever leads the card, so the group can see at a glance which holes paid.
// Par is two points, and a hole nobody finished simply scores nothing.
function stablefordPanelHTML(game, players, usersById) {
  const hcps = hcpsFor(game, players, usersById);
  const r = stablefordResult(game, players, hcps);
  if (!r) return '';
  const nameOf = (pid) => shortName(players.find(x => x.id === pid) || { id: pid }, usersById?.[pid]);

  if (!r.parsKnown) {
    return `
      <div id="gs-format" style="background:rgba(221,137,16,0.10);border:1px solid var(--amber);border-radius:12px;padding:10px 12px;margin-top:10px;">
        <b style="font-size:0.8rem;">${t('fmtStableford')}</b>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:4px;">${t('gsNoCourseCard')}</div>
      </div>`;
  }

  const standing = r.order.map(pid => {
    const e = r.perPlayer[pid];
    return `
      <span style="display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:999px;padding:2px 9px;font-size:0.76rem;font-weight:700;">
        ${esc(nameOf(pid))} <b style="font-size:0.92rem;">${e.points}</b>
        ${e.given ? `<span style="font-weight:600;color:var(--text-secondary);font-size:0.66rem;">+${e.given}</span>` : ''}
      </span>`;
  }).join('');

  // The strip reads the leader's card — one row cannot show four players, and
  // the leader is the line the group is chasing.
  const lead = r.perPlayer[r.order[0]];
  const cells = lead.perHole.map(h => {
    const pts = h.points;
    const paid = pts !== null && pts >= 2;
    return `
      <button data-gs="goto" data-hole="${h.hole}"
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
               border:1px solid var(--border-color);background:${paid ? 'var(--gold)' : 'transparent'};
               color:${paid ? '#0C3051' : 'var(--text-secondary)'};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${h.hole}${h.given ? '•' : ''}</div>${pts === null ? '·' : pts}
      </button>`;
  }).join('');

  const netText = r.net ? t('gsNet') : t('gsGrossPlay');
  return `
    <div id="gs-format" style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <b style="font-size:0.8rem;">${t('fmtStableford')}</b>
        <span style="font-size:0.7rem;color:var(--text-secondary);">${esc(netText)}</span>
        <span class="pill-soft" style="font-size:0.7rem;margin-left:auto;">${t('mpThru')} ${r.thru}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${standing}</div>
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:10px;">${cells}</div>
      <div style="font-size:0.66rem;color:var(--text-muted);margin-top:5px;text-align:center;">
        ${esc(nameOf(r.order[0]))} · ${t('gsPoints')} · ${t('gsStablefordHint')}
      </div>
    </div>`;
}

// Empty for stroke play — the strokes table is the whole screen there.
function formatPanelHTML(game, groupIdx, players, user, usersById) {
  const fmt = gameFormat(game);
  if (fmt === 'match' || isTeamFormat(game)) {
    const html = matchPanelHTML(game, groupIdx, players, user, usersById);
    if (html) return html;
    // A team panel must never come back empty. updateInPlace replaces
    // #gs-format by outerHTML, so an empty string deletes the node for good —
    // and whether a team panel is empty turns on the pairing, which a repaint
    // does not necessarily follow. Say why there is no contest instead.
    return isTeamFormat(game) ? `
      <div id="gs-format" style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;margin-top:10px;">
        <b style="font-size:0.8rem;">${t(FORMAT_LABEL_KEY[fmt])}</b>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:4px;">${t('gsNoTeams')}</div>
      </div>` : '';
  }
  if (fmt === 'skins') return skinsPanelHTML(game, players, usersById);
  if (fmt === 'stableford') return stablefordPanelHTML(game, players, usersById);
  return '';
}

// The format's own result lines at the top of the final report; the strokes
// table stays under them — the strokes were entered and remain the record.
function formatReportHTML(game, players, usersById, groupIdx) {
  const fmt = gameFormat(game);
  if (fmt === 'stroke') return '';
  const hcps = hcpsFor(game, players, usersById);
  const nameOf = (p) => esc(shortName(p, usersById?.[p.id]));
  let body = '';
  if (fmt === 'match' || isTeamFormat(game)) {
    const { matches } = isTeamFormat(game)
      ? groupTeamMatches(game, groupIdx, players, hcps, game.holeOverrides)
      : groupMatches(game, groupIdx, players, hcps, game.holeOverrides);
    body = matches.filter(m => m.thru > 0).map(m => {
      const a = esc(sideName(m.pair.a, usersById));
      const b = esc(sideName(m.pair.b, usersById));
      const s = m.settled;
      const line = s.finished
        ? (s.winner === 'a' ? `<b>${a}</b> ${esc(m.status)} ${b}`
          : s.winner === 'b' ? `${a} ${esc(m.status)} <b>${b}</b>`
            : `${a} · ${t('mpHalved')} · ${b}`)
        : `${a} – ${b} · ${esc(m.status)} · ${t('mpThru')} ${m.thru}`;
      // A one-ball format has no individual cards under this, so the teams'
      // own balls are the only strokes the report can show.
      const balls = m.lines ? `
        <div style="font-size:0.72rem;color:var(--text-secondary);">
          ${a}: ${esc(teamLineText(m.lines.a))} · ${b}: ${esc(teamLineText(m.lines.b))}
        </div>` : '';
      return `<div style="padding:5px 0;border-top:1px solid var(--border-color);font-size:0.84rem;">${line}${balls}</div>`;
    }).join('');
  } else if (fmt === 'skins') {
    const r = skinsResult(game, players, hcps);
    if (r) {
      body = [...players].sort((x, y) => r.totals[y.id] - r.totals[x.id]).map(p => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--border-color);font-size:0.84rem;">
          <span>${nameOf(p)}</span><b>${r.totals[p.id]}</b>
        </div>`).join('')
        + (r.carry ? `<div style="font-size:0.72rem;color:var(--text-secondary);padding-top:4px;">${t('gsSkinsCarry')} ${r.carry} · ${t('gsSkinsUnclaimed')}</div>` : '');
    }
  } else if (fmt === 'stableford') {
    const r = stablefordResult(game, players, hcps);
    if (r && r.parsKnown) {
      body = r.order.map(pid => {
        const p = players.find(x => x.id === pid) || { id: pid };
        const e = r.perPlayer[pid];
        return `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--border-color);font-size:0.84rem;">
          <span>${nameOf(p)}${e.given ? `<span style="color:var(--text-secondary);font-size:0.72rem;"> +${e.given}</span>` : ''}</span>
          <b>${e.points} ${t('gsPoints').toLowerCase()}</b>
        </div>`;
      }).join('');
    } else if (r) {
      body = `<div style="font-size:0.76rem;color:var(--text-secondary);padding-top:4px;">${t('gsNoCourseCard')}</div>`;
    }
  }
  return body ? `<div style="margin:4px 0 8px;">${body}</div>` : '';
}

// The hole header: "3-р Нүх · Пар 4 · SI 9" over a small "3 / 18" where the
// course card is known; the plain "НҮХ 3 / 18" otherwise.
function holeHeaderHTML(game, hole, holeCount) {
  const par = holePar(game, hole);
  const si = holeSI(game, hole);
  if (!par) return `${t('mpHole')} ${hole} / ${holeCount}`;
  return `${holeTitle(hole)} · ${t('gsPar')} ${par}${si ? ` · SI ${si}` : ''}
    <div style="font-size:0.68rem;font-weight:700;color:var(--text-secondary);letter-spacing:0.06em;">${hole} / ${holeCount}</div>`;
}

function screenHTML(game, groupIdx, user, fade, usersById) {
  const players = groupsOf(game)[groupIdx] || [];
  const holeCount = gameHoleCount(game);
  const hole = Math.min(viewHole ?? followHole(game, players, groupIdx), holeCount);
  return `
    <div class="detail-container${fade ? ' fade-in' : ''}" style="max-width:560px;">
      <a href="#/game/${esc(game.id)}" class="back-link">${t('back')}</a>

      <div style="margin-top:8px;">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;">
          ⛳ ${t('gsTitle')} · ${esc(game.location || '')}
        </div>
        <div style="font-size:1.15rem;font-weight:800;margin-top:2px;">
          ${t('group')} ${groupIdx + 1}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-top:14px;">
        <button data-gs="prev" ${hole <= 1 ? 'disabled' : ''} class="btn btn-outline btn-sm" style="width:52px;">‹</button>
        <div id="gs-hole-label" style="flex:1;text-align:center;font-size:1.15rem;font-weight:800;letter-spacing:0.04em;">
          ${holeHeaderHTML(game, hole, holeCount)}
        </div>
        <button data-gs="next" ${hole >= holeCount ? 'disabled' : ''} class="btn btn-outline btn-sm" style="width:52px;">›</button>
      </div>

      <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:4px 14px;margin-top:10px;">
        ${scoreRowsHTML(game, groupIdx, players, hole, user, usersById)
          || `<div style="padding:14px 0;color:var(--text-secondary);">${t('emptySlot')}</div>`}
      </div>

      ${formatPanelHTML(game, groupIdx, players, user, usersById)}

      ${reportHTML(game, players, usersById, groupIdx)}

      ${stripHTML(game, players, hole, groupIdx)}
      ${canFinishGame(user, game) ? `
        <button data-gs="finish" class="btn ${game.finishedAt ? 'btn-outline' : 'btn-primary'} btn-sm"
          style="width:100%;margin-top:14px;gap:6px;">🏁 ${game.finishedAt ? t('gsResume') : t('gsFinish')}</button>` : ''}
      <div id="gs-note" style="font-size:0.75rem;color:var(--text-secondary);margin-top:10px;text-align:center;min-height:1.2em;"></div>
    </div>`;
}

// ---- Round completion → handicap ----

// Once a player's card is full, mirror it into rounds/{ghinNumber}/{gameId}
// and refresh their cached WHS index. Fire-and-forget: nothing here may block
// or fail the score entry itself. Players without a GHIN number simply keep
// their in-game scores. Match play, skins, Stableford and fourball change
// nothing here: the strokes are real individual scores, and a conceded hole
// with no strokes leaves the card incomplete, so nothing posts — the right WHS
// outcome for a pick-up.
async function finalizeRoundIfComplete(game, playerId) {
  // Scramble and foursome play one ball a team, so no player has a card of
  // their own and nothing may post — a "complete" round there would be partly
  // somebody else's shots. The check lives here rather than in handicap.js
  // because game-formats.js imports handicap.js, and asking handicap.js for
  // the format would close that circle.
  if (isOneBallFormat(game)) return;
  try {
    const round = roundFromGame(game, playerId);
    if (!round) return;
    const u = await store.loadUserById(playerId);
    const ghin = u?.ghinNumber;
    if (!ghin) return;
    await store.upsertRound(ghin, round);
    const rounds = await store.loadRounds(ghin);   // newest first
    const diffs = rounds.map(r => r.differential).filter(d => typeof d === 'number');
    await store.saveUserHcp(playerId, handicapIndex(diffs));
  } catch (err) {
    console.warn('[gscore] round finalize failed', err);
  }
}

// ---- Mount ----

/**
 * Render the group scorecard.
 * ctx: { main() → the page element, user, showToast(msg, type),
 *        onUnsub(fn) — register a listener teardown }
 */
export async function renderGameScorePage(gameId, groupIdx, ctx) {
  const host = ctx.main();
  resetGameScorerView();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let data = null;
  try { data = await store.loadGame(gameId); } catch (_) { }
  let denied = false;
  // User records back the profile-index → course-handicap fallback for
  // players with no hand-entered game handicap. Loaded once; best-effort.
  let usersById = {};
  try {
    usersById = Object.fromEntries((await store.loadAllUsers()).map(u => [u.id, u]));
  } catch (_) { }
  // What the current DOM was built for. While it matches, paints update the
  // existing elements in place instead of replacing the whole screen —
  // replacing it re-ran the fade-in animation on every tap and listener
  // event, which read as the page "refreshing" mid-round.
  let paintedKey = null;

  // The playing ORDER is part of the structure, not just the roster: a ⇄ moves
  // which players are on a team, and team rows live outside #gs-format, so an
  // in-place patch would leave the old teams on screen. Including it forces a
  // full repaint on a re-split.
  const structureKey = (players) =>
    groupIdx + '|' + (data.finishedAt ? 'fin' : 'live') + '|' + gameFormat(data) + '|'
    + groupOrder(data, groupIdx, players).join('>') + '|'
    + players.map(p => p.id + (canScoreGamePlayer(ctx.user, data, p.id) ? '+' : '-')).join(',');

  const notFound = (msg, back) => {
    paintedKey = null;
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="${back}" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${msg}</p></div></div>`;
  };

  const setStep = (btn, disabled) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.35' : '1';
    btn.style.cursor = disabled ? 'default' : 'pointer';
  };

  // Refresh only what a score or hole change touches: the hole header, each
  // row's value/total/stepper state, and the hole strip. Buttons are never
  // replaced, so their listeners survive and nothing flashes or reflows.
  const updateInPlace = (players) => {
    const holeCount = gameHoleCount(data);
    const hole = Math.min(viewHole ?? followHole(data, players, groupIdx), holeCount);
    const label = host.querySelector('#gs-hole-label');
    if (label) label.innerHTML = holeHeaderHTML(data, hole, holeCount);
    const prev = host.querySelector('button[data-gs="prev"]');
    if (prev) prev.disabled = hole <= 1;
    const next = host.querySelector('button[data-gs="next"]');
    if (next) next.disabled = hole >= holeCount;
    for (const p of players) {
      const strokes = data.scores?.[p.id]?.holes?.[hole] ?? null;
      const val = host.querySelector(`[data-gs-val="${p.id}"]`);
      if (val) {
        val.textContent = strokes ?? '·';
        val.style.color = strokeColor(strokes, holePar(data, hole));
      }
      const hcp = gamePlayingHcp(data, p.id, usersById[p.id]);
      const tot = host.querySelector(`[data-gs-tot="${p.id}"]`);
      if (tot) tot.textContent = totalsLineText(data, p.id, hcp);
      const run = host.querySelector(`[data-gs-run="${p.id}"]`);
      if (run) {
        const rs = runningScore(data, p.id, hcp);
        run.textContent = rs.text;
        run.style.color = rs.color;
      }
      const chip = host.querySelector(`button[data-gs="hcp"][data-pid="${p.id}"]`);
      if (chip) chip.textContent = hcpChipLabel(data, p.id, usersById[p.id]);
      setStep(host.querySelector(`button[data-gs="minus"][data-pid="${p.id}"]`), strokes === null);
      setStep(host.querySelector(`button[data-gs="plus"][data-pid="${p.id}"]`), strokes !== null && strokes >= MAX_STROKES);
    }
    // Team rows in a one-ball format, patched the same way. The per-partner
    // HCP chips inside them carry data-pid and were refreshed by the loop
    // above; only the team's own ball is left.
    if (isOneBallFormat(data)) {
      const hcps = hcpsFor(data, players, usersById);
      const diffs = {};
      groupTeamMatches(data, groupIdx, players, hcps, data.holeOverrides).matches.forEach(m => {
        diffs[m.pair.a.id] = m.allowance.a;
        diffs[m.pair.b.id] = m.allowance.b;
      });
      for (const tm of groupTeams(data, groupIdx, players).teams) {
        const strokes = teamStrokesOf(data, tm.id, hole);
        const val = host.querySelector(`[data-gs-tval="${tm.id}"]`);
        if (val) {
          val.textContent = strokes ?? '·';
          val.style.color = strokeColor(strokes, holePar(data, hole));
        }
        const line = teamBallLine(data, tm.id, diffs[tm.id] || 0);
        const tot = host.querySelector(`[data-gs-ttot="${tm.id}"]`);
        if (tot) tot.textContent = teamLineText(line);
        const run = host.querySelector(`[data-gs-trun="${tm.id}"]`);
        if (run) {
          run.textContent = !line.thru ? ''
            : line.toPar !== null ? fmtToPar(line.toPar) : String(line.total);
          run.style.color = line.toPar !== null && line.toPar < 0 ? 'var(--red)'
            : line.toPar === 0 ? 'var(--text-secondary)' : 'var(--text-primary)';
        }
        // The team's average moves whenever a partner's handicap is edited from
        // the chips inside this very row, so it is patched like any other total.
        const chip = host.querySelector(`[data-gs-thcp="${tm.id}"]`);
        if (chip) {
          const avg = teamHcp(hcps, tm);
          chip.textContent = avg === null ? '' : `HCP ${avg}`;
        }
        setStep(host.querySelector(`button[data-gs="tminus"][data-team="${tm.id}"]`), strokes === null);
        setStep(host.querySelector(`button[data-gs="tplus"][data-team="${tm.id}"]`), strokes !== null && strokes >= MAX_STROKES);
      }
    }
    // The final report recomputes with every correction while it is shown.
    const report = host.querySelector('#gs-report');
    if (report) report.outerHTML = reportHTML(data, players, usersById, groupIdx);
    // The format panel has no persistent focus and an arbitrary shape (a
    // chooser may be open, the pairing may have changed), so it is replaced
    // wholesale and re-wired below rather than patched.
    const panel = host.querySelector('#gs-format');
    if (panel) panel.outerHTML = formatPanelHTML(data, groupIdx, players, ctx.user, usersById);
    const units = scoreUnits(data, groupIdx, players);
    for (let n = 1; n <= holeCount; n++) {
      const cell = host.querySelector(`button[data-gs="goto"][data-hole="${n}"]`);
      if (!cell) continue;
      const entered = units.filter(u => u.has(n)).length;
      const full = holeComplete(units, n);
      cell.style.border = n === hole ? '2px solid var(--text-primary)' : '1px solid var(--border-color)';
      cell.style.background = full ? 'var(--gold)' : 'transparent';
      cell.style.color = full ? '#0C3051' : 'var(--text-secondary)';
      cell.innerHTML = `<div style="font-size:0.58rem;opacity:0.75;">${n}</div>${holePar(data, n) ?? (entered || '·')}`;
    }
    // onclick assignment is idempotent, so re-wiring the whole screen only
    // gives the freshly inserted panel and report their handlers.
    wire();
  };

  const paint = () => {
    // Writes are awaited, so a member who taps a score and immediately leaves
    // would otherwise have this repaint land on the page they moved to.
    if (ctx.alive?.() === false) return;
    if (!data || data.status === 'deleted') {
      if (!store.isUsingFirebase()) notFound(t('gsGameNotFound'), '#/');
      return;
    }
    const players = groupsOf(data)[groupIdx] || [];
    // The screen is for entering scores: a viewer who may not mark anyone in
    // this group reads the game page's summary instead.
    if (!players.some(p => canScoreGamePlayer(ctx.user, data, p.id))) {
      denied = true;
      notFound(t('gsNoAccess'), `#/game/${esc(gameId)}`);
      return;
    }
    denied = false;
    const key = structureKey(players);
    if (key === paintedKey && host.querySelector('#gs-hole-label')) {
      updateInPlace(players);
      return;
    }
    // Full render only when the screen's structure changed (first paint, or
    // the group's members/permissions did); fade-in only the very first time.
    host.innerHTML = screenHTML(data, groupIdx, ctx.user, paintedKey === null, usersById);
    paintedKey = key;
    wire();
  };

  // One tap: write the hole, let the listener paint the result. `saving` only
  // guards a double-tap racing itself — offline the write resolves locally.
  const write = async (playerId, hole, strokes) => {
    if (saving) return;
    saving = true;
    const note = document.getElementById('gs-note');
    try {
      const local = await store.saveGameScoreHole(gameId, playerId, hole, strokes, ctx.user?.id);
      if (local) {
        // localStorage mode has no listener — repaint from the returned game.
        data = local;
        paint();
      } else {
        // Optimistic mirror so the completion check below sees this tap even
        // if the listener has not fired yet; the listener overwrites `data`
        // wholesale anyway.
        data.scores = data.scores || {};
        data.scores[playerId] = data.scores[playerId] || {};
        data.scores[playerId].holes = data.scores[playerId].holes || {};
        if (strokes === null) delete data.scores[playerId].holes[hole];
        else data.scores[playerId].holes[hole] = strokes;
        paint();
      }
      if (note) note.textContent = '';
      finalizeRoundIfComplete(data, playerId);
    } catch (err) {
      console.error('[gscore]', err);
      if (note) note.textContent = '⚠ ' + (err?.message || t('mpSaveFailed'));
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  // One tap on a team row: the strokes a scramble or foursome team's single
  // ball took. Deliberately never calls finalizeRoundIfComplete — a team ball
  // is nobody's card, so there is no WHS round to complete from it.
  const writeTeamHole = async (teamKey, hole, strokes) => {
    if (saving) return;
    saving = true;
    const note = document.getElementById('gs-note');
    try {
      const local = await store.saveGameTeamScoreHole(gameId, teamKey, hole, strokes, ctx.user?.id);
      if (local) data = local;
      else {
        data.teamScores = data.teamScores || {};
        const tm = (data.teamScores[teamKey] = data.teamScores[teamKey] || {});
        tm.holes = tm.holes || {};
        if (strokes === null) delete tm.holes[hole];
        else tm.holes[hole] = strokes;
      }
      if (note) note.textContent = '';
      paint();
    } catch (err) {
      console.error('[gscore]', err);
      if (note) note.textContent = '⚠ ' + (err?.message || t('mpSaveFailed'));
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  // A hand-set match play hole (or its removal). Not a stroke, so no
  // handicap round can complete from it.
  const writeOverride = async (key, hole, value) => {
    if (saving) return;
    saving = true;
    try {
      const local = await store.saveGameHoleOverride(gameId, key, hole, value || null, ctx.user?.id);
      if (local) data = local;
      else {
        data.holeOverrides = data.holeOverrides || {};
        const pair = (data.holeOverrides[key] = data.holeOverrides[key] || {});
        if (!value) delete pair[hole]; else pair[hole] = value;
      }
      ovOpen = null;
      paint();
    } catch (err) {
      console.error('[gscore]', err);
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  const writePairing = async (order) => {
    if (saving) return;
    saving = true;
    try {
      const local = await store.saveGamePairing(gameId, groupIdx, order);
      if (local) data = local;
      else {
        data.pairing = data.pairing || {};
        data.pairing[groupIdx] = order;
      }
      ovOpen = null;
      paint();
    } catch (err) {
      console.error('[gscore]', err);
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  const wire = () => {
    host.querySelectorAll('button[data-gs]').forEach(b => b.onclick = () => {
      const kind = b.dataset.gs;
      // Read the game at click time, never from a render-time closure — a
      // group-mate's tap arrives through the listener between paints.
      if (!data) return;
      const players = groupsOf(data)[groupIdx] || [];
      const holeCount = gameHoleCount(data);
      const hole = Math.min(viewHole ?? followHole(data, players, groupIdx), holeCount);
      if (kind === 'plus' || kind === 'minus') {
        const pid = b.dataset.pid;
        if (!canScoreGamePlayer(ctx.user, data, pid)) return;
        // Pin the hole being entered: without this, the last player's FIRST
        // tap completes the hole and the follow-mode repaint jumps to the
        // next one before their score can be adjusted. Auto-advance still
        // lands on the first open hole when the scorer is (re)opened; moving
        // on mid-session is the › arrow or the strip.
        viewHole = hole;
        const cur = data.scores?.[pid]?.holes?.[hole] ?? null;
        let next;
        // An empty hole starts at its par — most scores land around it, so
        // that is the fewest taps; 4 stays the fallback where no card exists.
        if (kind === 'plus') next = cur === null ? (holePar(data, hole) ?? DEFAULT_STROKES) : Math.min(MAX_STROKES, cur + 1);
        else next = cur === null ? null : (cur <= 1 ? null : cur - 1);
        if (next !== cur) write(pid, hole, next);
      } else if (kind === 'tplus' || kind === 'tminus') {
        // The team stepper, the same shape as a player's: pin the hole being
        // entered, seed an empty hole at its par, and clear below one.
        const teamId = b.dataset.team;
        const team = groupTeams(data, groupIdx, players).teams.find(x => x.id === teamId);
        if (!team || !canScoreSide(ctx.user, data, team)) return;
        viewHole = hole;
        const cur = teamStrokesOf(data, teamId, hole);
        let next;
        if (kind === 'tplus') next = cur === null ? (holePar(data, hole) ?? DEFAULT_STROKES) : Math.min(MAX_STROKES, cur + 1);
        else next = cur === null ? null : (cur <= 1 ? null : cur - 1);
        if (next !== cur) writeTeamHole(teamId, hole, next);
      } else if (kind === 'hcp') {
        const pid = b.dataset.pid;
        if (!canScoreGamePlayer(ctx.user, data, pid)) return;
        const cur = data.hcp?.[pid];
        const raw = prompt(t('gsHcpPrompt'), typeof cur === 'number' ? String(cur) : '');
        if (raw === null) return;                      // cancelled
        const trimmed = raw.trim();
        const next = trimmed === '' ? null : parseInt(trimmed, 10);
        if (next !== null && (isNaN(next) || next < 0 || next > 54)) {
          ctx.showToast?.('⚠️ ' + t('gsHcpPrompt'), 'error');
          return;
        }
        store.saveGamePlayerHcp(gameId, pid, next).then(local => {
          if (local) data = local;
          else {
            data.hcp = data.hcp || {};
            if (next === null) delete data.hcp[pid];
            else data.hcp[pid] = next;
          }
          paint();
        }).catch(err => {
          console.error('[gscore]', err);
          ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
        });
      } else if (kind === 'finish') {
        if (!canFinishGame(ctx.user, data)) return;
        const next = !data.finishedAt;
        store.saveGameFinished(gameId, next).then(local => {
          if (local) data = local;
          else data.finishedAt = next ? Date.now() : null;
          paint();
        }).catch(err => {
          console.error('[gscore]', err);
          ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
        });
      } else if (kind === 'prev') {
        viewHole = Math.max(1, hole - 1);
        paint();
      } else if (kind === 'next') {
        viewHole = Math.min(holeCount, hole + 1);
        paint();
      } else if (kind === 'goto') {
        viewHole = Number(b.dataset.hole);
        paint();
      } else if (kind === 'ov-open') {
        const key = b.dataset.key;
        const h = Number(b.dataset.hole);
        ovOpen = ovOpen && ovOpen.key === key && ovOpen.hole === h ? null : { key, hole: h };
        paint();
      } else if (kind === 'ov-set') {
        // Permission is re-checked at click time against the contest as it
        // stands now, not as it was rendered — and a team contest needs all
        // four players, not two.
        const key = b.dataset.key;
        const contest = (isTeamFormat(data)
          ? teamContests(data, groupIdx, players).contests
          : groupPairs(data, groupIdx, players).pairs).find(c => c.key === key);
        if (!contest || !canScoreSide(ctx.user, data, contest.a) || !canScoreSide(ctx.user, data, contest.b)) return;
        writeOverride(key, Number(b.dataset.hole), b.dataset.value || null);
      } else if (kind === 'repair') {
        if (!players.some(p => canScoreGamePlayer(ctx.user, data, p.id))) return;
        writePairing(nextPairing(data, groupIdx, players));
      }
    });
  };

  if (!data && store.isUsingFirebase()) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/game/${esc(gameId)}" class="back-link">${t('back')}</a>
      <div class="loading-spinner" style="margin:40px auto;"></div></div>`;
  }
  paint();

  if (store.isUsingFirebase()) {
    const unsub = store.onGameChanged(gameId, (fresh) => {
      if (!fresh || fresh.status === 'deleted') return;
      data = fresh;
      const players = groupsOf(fresh)[groupIdx] || [];
      // A repaint must not silently reinstate a screen access was refused on.
      if (!denied || players.some(p => canScoreGamePlayer(ctx.user, fresh, p.id))) paint();
    });
    if (unsub) ctx.onUnsub?.(unsub);
  }
}
