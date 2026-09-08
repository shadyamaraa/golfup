// src/game-share.js
// A casual game's result as the share kit sees it — the same card shapes the
// tournaments draw, fed from the game's own strokes — and the sheet the result
// board opens: the result as a picture, as a story, as text for the chat.
// (The invitation stays the page's own Viber button: that one is for getting
// people to join, this one is for what happened.)
//
// `gameResultModel` is pure (no DOM, no i18n) so the numbers are tested;
// `shareGame` is the only thing here that touches the screen, and it does so
// through the share sheet and the renderer only.

import { t } from './i18n.js';
import {
  gameFormat, isTeamFormat, groupMatches, groupTeamMatches, skinsResult, stablefordResult,
  FORMAT_LABEL_KEY
} from './game-formats.js';
import { gameScoreLine, gamePlayingHcp, isCompMode } from './game-score.js';
import { gameHoleCount } from './handicap.js';
import { coursePar } from './courses.js';
import { buildShareImage } from './results-image.js';
import { openShareSheet } from './share-sheet.js';

const ensureArray = (v) => (!v ? [] : Array.isArray(v) ? v : Object.values(v));
const ensureGroups = (v) => (!v ? [[]] : Array.isArray(v) ? v : Object.values(v));
const groupsOf = (game) => ensureGroups(game?.groups).map(g => ensureArray(g).filter(Boolean));

// The board prints the member's username, the match cards their first name —
// the same two readings the game page uses.
const longName = (users, p) => users?.[p?.id]?.username || users?.[p?.id]?.name || p?.name || '?';
const shortName = (users, p) => users?.[p?.id]?.firstName || p?.name || '?';

// Positions with ties: equal keys share a rank and read T{n}.
function rank(entries, keyOf, { desc = false } = {}) {
  const k = (e) => { const v = keyOf(e); return v === null || v === undefined || isNaN(v) ? (desc ? -Infinity : Infinity) : Number(v); };
  entries.sort((a, b) => (desc ? k(b) - k(a) : k(a) - k(b)) || String(a.name).localeCompare(String(b.name)));
  let prev = null;
  let prevRank = 0;
  entries.forEach((e, i) => {
    const v = k(e);
    e.rank = prev !== null && v === prev ? prevRank : i + 1;
    prev = v;
    prevRank = e.rank;
  });
  const counts = {};
  entries.forEach(e => { counts[e.rank] = (counts[e.rank] || 0) + 1; });
  entries.forEach(e => { e.posLabel = `${counts[e.rank] > 1 ? 'T' : ''}${e.rank}`; });
  return entries;
}

// A board in the results model's shape: everyone ranked, the leaders, the
// top ten. `division` is the group number when the contest is per group.
const board = (entries, division = null) => ({
  division,
  entries,
  inPlay: entries,
  leaders: entries.filter(e => e.rank === 1),
  top: entries.slice(0, 10),
  cut: [], retired: [], idle: [], cutSize: null, cutAfterRound: null
});

function strokeBoards(game, users) {
  const comp = isCompMode(game);
  const rows = groupsOf(game).flat().map(p => {
    const hcp = gamePlayingHcp(game, p.id, users?.[p.id]);
    const line = gameScoreLine(game, p.id, hcp);
    return { pid: p.id, name: longName(users, p), hcp: typeof hcp === 'number' ? hcp : null, ...line };
  }).filter(r => r.thru > 0);
  if (!rows.length) return { boards: [], segments: [], hasHcp: false };
  // Ranked the way the page ranks: net to par when everybody has a
  // handicap, gross to par otherwise, strokes when the course has no pars.
  const byNet = rows.every(r => r.net !== null);
  const entries = rows.map(r => ({
    pid: r.pid, name: r.name, hcp: r.hcp, thru: r.thru,
    gross: r.total,
    total: byNet ? r.netToPar : r.toPar,
    net: r.net, toPar: r.toPar, netToPar: r.netToPar, netF: r.netF, netB: r.netB,
    rounds: []
  }));
  rank(entries, e => byNet ? (e.netToPar ?? e.net) : (e.toPar ?? e.gross));
  // Competition: the nines are contests of their own; name their leaders.
  const segments = comp ? ['netF', 'netB'].map((key, i) => {
    const c = entries.filter(e => e[key] !== null && e[key] !== undefined);
    if (!c.length) return null;
    const best = Math.min(...c.map(e => e[key]));
    return { label: i ? 'B9' : 'F9', leaders: c.filter(e => e[key] === best).map(e => e.name), score: best };
  }).filter(Boolean) : [];
  return { boards: [board(entries)], segments, hasHcp: byNet };
}

function stablefordBoards(game, users) {
  const entries = [];
  let hasHcp = false;
  groupsOf(game).forEach(players => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, users?.[p.id])]));
    const r = stablefordResult(game, players, hcps);
    if (!r || !r.thru || !r.parsKnown) return;
    hasHcp = hasHcp || r.net;
    players.forEach(p => {
      const e = r.perPlayer[p.id];
      if (!e || !e.thru) return;
      entries.push({
        pid: p.id, name: longName(users, p), hcp: typeof e.hcp === 'number' ? e.hcp : null,
        thru: e.thru, total: e.points, gross: gameScoreLine(game, p.id, e.hcp).total || null, rounds: []
      });
    });
  });
  if (!entries.length) return { boards: [], hasHcp };
  rank(entries, e => e.total, { desc: true });
  return { boards: [board(entries)], hasHcp };
}

function skinsBoards(game, users) {
  const groups = groupsOf(game);
  const holes = gameHoleCount(game);
  const boards = [];
  groups.forEach((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, users?.[p.id])]));
    const r = skinsResult(game, players, hcps);
    if (!r || !r.thru) return;
    const entries = players.map(p => ({
      pid: p.id, name: longName(users, p), hcp: typeof hcps[p.id] === 'number' ? hcps[p.id] : null,
      thru: r.thru, total: r.totals[p.id], gross: null, rounds: []
    }));
    rank(entries, e => e.total, { desc: true });
    const b = board(entries, groups.length > 1 ? gi + 1 : null);
    b.carry = r.carry ? { skins: r.carry, unclaimed: r.thru >= holes } : null;
    boards.push(b);
  });
  return { boards, hasHcp: boards.length > 0 };
}

// Match play and the 2 v 2 formats: the group's matches as they stand.
function matchGroups(game, users) {
  const team = isTeamFormat(game);
  const groups = groupsOf(game);
  const sideName = (side) => side?.players
    ? side.players.map(p => shortName(users, p)).join(' + ')
    : shortName(users, side);
  const line = (l) => (l && l.thru ? { total: l.total, toPar: l.toPar ?? null } : null);
  return groups.map((players, gi) => {
    const hcps = Object.fromEntries(players.map(p => [p.id, gamePlayingHcp(game, p.id, users?.[p.id])]));
    const { matches } = team
      ? groupTeamMatches(game, gi, players, hcps, game.holeOverrides)
      : groupMatches(game, gi, players, hcps, game.holeOverrides);
    return {
      label: groups.length > 1 ? gi + 1 : null,
      matches: matches.filter(m => m.thru > 0).map(m => ({
        a: sideName(m.pair.a),
        b: sideName(m.pair.b),
        result: m.status,
        thru: m.thru,
        finished: !!m.settled.finished,
        halved: !!m.settled.finished && !m.settled.winner,
        winner: m.settled.winner || null,
        leader: m.settled.finished ? null : (m.settled.leader || null),
        lines: m.lines ? { a: line(m.lines.a), b: line(m.lines.b) } : null
      }))
    };
  }).filter(g => g.matches.length);
}

/**
 * The game's result in the results model's shape, so the tournament cards
 * draw it: kind 'stroke' (a board — stroke play, Stableford, skins) or
 * 'matches' (match play and the team formats). `users` is the member map
 * the page has (names, handicap index); `state` is 'live' | 'final'.
 */
export function gameResultModel(game, { users = {}, state = 'live' } = {}) {
  const format = gameFormat(game);
  const comp = isCompMode(game);
  const holes = gameHoleCount(game);
  const par = Number(game?.course?.par) || coursePar(game?.location) || null;
  const players = groupsOf(game).flat().length;
  const base = {
    state, format, formatKey: FORMAT_LABEL_KEY[format], comp, holes, par, players,
    team: false, teamSize: 0, rounds: 1, round: 1, stats: null
  };
  if (format === 'match' || isTeamFormat(game)) {
    const groups = matchGroups(game, users);
    return { ...base, kind: 'matches', points: false, hasHcp: false, groups, boards: [], segments: [],
      played: groups.reduce((n, g) => n + g.matches.length, 0) };
  }
  const r = format === 'stableford' ? stablefordBoards(game, users)
    : format === 'skins' ? skinsBoards(game, users)
      : strokeBoards(game, users);
  return { ...base, kind: 'stroke', points: format === 'stableford' || format === 'skins',
    hasHcp: r.hasHcp, boards: r.boards, segments: r.segments || [] };
}

const toPar = (v) => (v === null || v === undefined ? '–' : v === 0 ? 'E' : v < 0 ? `−${Math.abs(v)}` : `+${v}`);
const scoreOf = (v, points) => (v === null || v === undefined ? '–' : points ? String(v) : toPar(v));

/**
 * The result as text for a chat: the Viber groups are where the club talks.
 * `L` carries the words: { group, thru, final, carry, unclaimed, tied }.
 */
export function gameResultText(model, L = {}) {
  const lines = [];
  if (model.kind === 'matches') {
    model.groups.forEach(g => {
      if (g.label) lines.push(`${L.group || 'Group'} ${g.label}`);
      g.matches.forEach(m => {
        const res = m.halved ? (L.tied || 'HALVED') : m.result;
        const state = m.finished ? '' : ` (${L.thru || 'Thru'} ${m.thru})`;
        const a = m.winner === 'a' ? `🏆 ${m.a}` : m.a;
        const b = m.winner === 'b' ? `${m.b} 🏆` : m.b;
        lines.push(`${a}  ${res}  ${b}${state}`);
      });
    });
    return lines.join('\n');
  }
  if (model.segments?.length) {
    lines.push(`🏆 ${model.segments.map(s => `${s.label}: ${s.leaders.join(', ')} ${toPar(s.score)}`).join(' · ')}`);
  }
  model.boards.forEach(b => {
    if (b.division) lines.push(`${L.group || 'Group'} ${b.division}`);
    b.entries.forEach(e => {
      const bits = [scoreOf(e.total, model.points)];
      if (!model.points && e.gross !== null && e.gross !== undefined) bits[0] += ` (${e.gross})`;
      if (model.points && e.gross) bits.push(String(e.gross));
      if (e.hcp !== null && e.hcp !== undefined) bits.push(`HCP ${e.hcp}`);
      bits.push(e.thru < model.holes ? `${L.thru || 'Thru'} ${e.thru}` : (L.final || 'F'));
      lines.push(`${e.posLabel}. ${e.name} ${bits.join(' · ')}`);
    });
    if (b.carry) lines.push(`${L.carry || 'Carry'} ${b.carry.skins}${b.carry.unclaimed ? ` · ${L.unclaimed || 'unclaimed'}` : ''}`);
  });
  return lines.join('\n');
}

const fileSlug = (s) => String(s || 'ubgolf').replace(/[\\/:*?"<>|#]+/g, '').trim().replace(/\s+/g, '-');

/**
 * The result board's share sheet. ctx: { showToast, users, state, url (the
 * result's page — the printable card, open to anyone), dateText }.
 */
export function shareGame(game, ctx = {}) {
  if (!game?.id) return;
  const model = gameResultModel(game, { users: ctx.users || {}, state: ctx.state || 'live' });
  const scored = model.kind === 'matches' ? model.groups.length > 0 : model.boards.length > 0;
  if (!scored) { ctx.showToast?.(t('tnShareFail'), 'error'); return; }
  const formatText = [t(model.formatKey), model.comp ? t('gsModeComp') : '', model.holes === 9 ? '9' : ''].filter(Boolean).join(' · ');
  const dateText = ctx.dateText || game.date || '';
  const subtitle = [dateText, game.time, formatText].filter(Boolean).join(' · ');
  const tn = { id: game.id, name: game.location || '', logo: null };
  const url = ctx.url || '';
  const hashtag = '#UBGolf';
  const title = `${game.location || ''} · ${dateText}`;
  const L = {
    results: `${t('tnResults')} · ${t('mpFinal')}`,
    after: `${t('tnResults')} · ${t('tnLive')}`,
    champion: t('tnWinner'), leading: t('tnLeading'), tied: t('tnTied'), winner: t('tnWinner'),
    strokes: t('tnStrokes').toLowerCase(), points: t('spPoints'), players: t('tnPlayers'), thru: t('mpThru'),
    pos: t('tnPos'), total: t('tnTotal'), team: t('tnTeam'), finished: t('mpFinal'), live: t('tnLive'),
    matches: t('gsMatches'), scan: t('scScanHint'), liveBoard: t('gsTitle'), sponsors: '',
    division: (d) => (d ? `${t('group')} ${d}` : ''),
    badge: (k) => k,
    beat: (n) => `${n}%`
  };
  const resultText = () => {
    const head = `${model.state === 'final' ? '🏁' : '🏌️'} ${game.location || ''} · ${dateText} ${game.time || ''}\n${formatText}`;
    const body = gameResultText(model, {
      group: t('group'), thru: t('mpThru'), final: 'F', carry: t('gsSkinsCarry'),
      unclaimed: t('gsSkinsUnclaimed'), tied: t('mpHalved')
    });
    return [head, body, url ? `🔗 ${url}` : ''].filter(Boolean).join('\n\n');
  };
  const kinds = [
    { key: 'feed', label: t('shFeed') },
    { key: 'story', label: t('shStory') },
    { key: 'result', label: t('shText'), text: true }
  ];
  const carryNote = (b) => (b.carry ? `${t('gsSkinsCarry')} ${b.carry.skins}${b.carry.unclaimed ? ` · ${t('gsSkinsUnclaimed')}` : ''}` : '');
  const note = model.boards.map(carryNote).filter(Boolean).join(' · ');
  openShareSheet({
    title: t('tnShare'),
    kinds,
    caption: [title, formatText, hashtag, url].filter(Boolean).join('\n'),
    fileBase: `${fileSlug(game.location)}-${fileSlug(game.date)}`,
    showToast: ctx.showToast,
    viber: true,
    build: async (kind) => {
      if (kind === 'result') return [{ text: resultText() }];
      return [await buildShareImage(kind, tn, { ...model, note }, { url, subtitle, labels: L, hashtag })];
    }
  });
}
