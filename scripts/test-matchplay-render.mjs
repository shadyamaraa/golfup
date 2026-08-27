// scripts/test-matchplay-render.mjs
// Smoke tests for the Live Match Center's rendering: a full M Cup-shaped
// tournament goes in, and the HTML is checked for the facts a spectator has
// to be able to read. Catches template crashes and silently empty sections
// that the pure engine tests cannot see.
//
// A four-method host stub stands in for the DOM — enough for innerHTML and
// the click wiring the module does, and nothing more.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }
};

const { renderMatchCenter } = await import('../src/matchplay-view.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const HALVED = 'h';
const holes = (...r) => Object.fromEntries(r.map((v, i) => [i + 1, v]));

function hostStub() {
  return {
    innerHTML: '',
    // The module only ever wires the match-card buttons, and the stub does
    // not parse HTML — returning nothing is honest, and the render path is
    // what these tests are about.
    querySelectorAll: () => []
  };
}

// An M Cup shaped like the real one: two teams, two sessions, matches in
// every state.
const TN = {
  id: 'mcup',
  format: 'match',
  mp: {
    teams: {
      a: { name: 'Altai Eagles', short: 'ALTAI', color: '#1f6f43' },
      b: { name: 'Wellcom Diesels', short: 'WELLCOM', color: '#b3382c' }
    },
    roster: {
      p1: { teamId: 'a', name: 'Margad Jambaldorj' },
      p2: { teamId: 'a', name: 'Bat-Amgalan Chinbat' },
      p3: { teamId: 'a', name: 'Ganbat Dorj' },
      q1: { teamId: 'b', name: 'Samadi Batbold' },
      q2: { teamId: 'b', name: 'Solongobat Otgonbaatar' },
      q3: { teamId: 'b', name: 'Enkhjin Tur' }
    },
    sessions: {
      s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES', startTime: '08:00' },
      s2: { id: 's2', day: 1, number: 2, format: 'FOURBALL', startTime: '13:00' }
    },
    matches: {
      // Completed: ALTAI closes out 3 & 2.
      m1: {
        id: 'm1', sessionId: 's1', number: 1, teeTime: '08:00',
        players: { a: ['p1', 'p2'], b: ['q1', 'q2'] },
        holes: holes('a', 'a', HALVED, 'a', HALVED, HALVED, HALVED, HALVED,
          HALVED, HALVED, HALVED, HALVED, HALVED, HALVED, HALVED, HALVED)
      },
      // Halved over 18.
      m2: {
        id: 'm2', sessionId: 's1', number: 2, teeTime: '08:10',
        players: { a: ['p3'], b: ['q3'] },
        holes: holes(...Array(18).fill(HALVED))
      },
      // Live: ALTAI 2 UP thru 11. Carries an assigned scorer who is not a
      // player — the enter-score tests below depend on that.
      m3: {
        id: 'm3', sessionId: 's2', number: 3, teeTime: '13:00',
        players: { a: ['p1', 'p2'], b: ['q1', 'q2'] },
        scorerIds: { scorekeeper: true },
        holes: holes('a', HALVED, 'a', HALVED, HALVED, 'b', 'a', HALVED, HALVED, HALVED, HALVED)
      },
      // Upcoming.
      m4: {
        id: 'm4', sessionId: 's2', number: 4, teeTime: '13:10',
        players: { a: ['p3'], b: ['q3'] },
        holes: {}
      }
    }
  }
};

test('the scoreboard shows both team names and their derived points', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  // m1 → ALTAI 1, m2 → ½ each. m3/m4 unfinished, so nothing yet.
  assert.match(host.innerHTML, /Altai Eagles/);
  assert.match(host.innerHTML, /Wellcom Diesels/);
  assert.match(host.innerHTML, />1\.5</);
  assert.match(host.innerHTML, />0\.5</);
});

test('the running session is named on the scoreboard', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  assert.match(host.innerHTML, /DAY 1 — FOURBALL/);
});

test('every match state gets a card, with players named', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  ['Margad Jambaldorj', 'Samadi Batbold', 'Ganbat Dorj', 'Enkhjin Tur']
    .forEach(name => assert.match(host.innerHTML, new RegExp(name)));
  assert.equal((host.innerHTML.match(/data-mpv="open"/g) || []).length, 4);
});

test('a live card reads the lead with the team named, and THRU', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  assert.match(host.innerHTML, /ALTAI 2 UP/);
  assert.match(host.innerHTML, /Thru 11/);
});

test('a finished card carries its result, not a running status', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  assert.match(host.innerHTML, /ALTAI 3 &amp; 2/);
  assert.match(host.innerHTML, /TIED/); // the halved match
});

test('an upcoming card shows its tee time instead of THRU', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  assert.match(host.innerHTML, /Tee time 13:10/);
});

test('LIVE comes before FINAL, which comes before UPCOMING', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  const at = (s) => host.innerHTML.indexOf(s);
  assert.ok(at('>LIVE ') < at('>Final '), 'live group precedes final');
  assert.ok(at('>Final ') < at('>UPCOMING '), 'final group precedes upcoming');
});

test('the session breakdown lists every session', () => {
  const host = hostStub();
  renderMatchCenter(host, TN);
  assert.match(host.innerHTML, /Session results/);
  assert.match(host.innerHTML, /Day 1 — FOURSOMES/);
  assert.match(host.innerHTML, /1\.5 — 0\.5/); // session 1 settled
});

test('a tournament with no matches still renders, without crashing', () => {
  const host = hostStub();
  renderMatchCenter(host, { id: 'x', format: 'match', mp: { teams: {}, matches: {} } });
  assert.match(host.innerHTML, /No matches set up yet/);
});

test('a tournament with no mp block renders an empty state', () => {
  const host = hostStub();
  renderMatchCenter(host, { id: 'x', format: 'match' });
  assert.match(host.innerHTML, /No matches set up yet/);
});

test('rendering escapes player names rather than trusting them', () => {
  const host = hostStub();
  const evil = JSON.parse(JSON.stringify(TN));
  evil.mp.roster.p1.name = '<img src=x onerror=alert(1)>';
  renderMatchCenter(host, evil);
  assert.ok(!host.innerHTML.includes('<img src=x'), 'raw tag must not reach the DOM');
  assert.match(host.innerHTML, /&lt;img src=x/);
});

// ---- The shipped sample tournament ----
// The demo is what anyone reviewing this feature looks at first, so it has to
// stay internally consistent: no lineup warnings, everyone plays, and every
// match state represented. A careless edit to it should fail here, not on a
// reviewer's screen.

const { MP_DEMO } = await import('../src/matchplay-demo.js');
const { teamTotals, matchState, participation, lineupIssues } =
  await import('../src/matchplay.js');

test('the sample M Cup passes its own lineup rules', () => {
  const mp = MP_DEMO.mp;
  const matches = Object.values(mp.matches);
  Object.keys(mp.sessions).forEach(sid => {
    const issues = lineupIssues(matches.filter(m => m.sessionId === sid), mp.roster);
    assert.deepEqual(issues, [], `session ${sid} must have no lineup issues`);
  });
});

test('every sample player gets a match, 14 per team', () => {
  const part = participation(MP_DEMO.mp.roster, Object.values(MP_DEMO.mp.matches));
  assert.deepEqual(part.a, { used: 14, total: 14, unused: [] });
  assert.deepEqual(part.b, { used: 14, total: 14, unused: [] });
});

test('the sample covers all four match states', () => {
  const states = new Set(Object.values(MP_DEMO.mp.matches).map(matchState));
  ['LIVE', 'COMPLETED', 'UPCOMING', 'SUSPENDED']
    .forEach(s => assert.ok(states.has(s), `sample must include a ${s} match`));
});

// ---- The score-entry shortcut ----
// Shown to exactly who the scorer screen would let in: fielded players,
// assigned scorers, and admin/marshal members — never to a spectator, and
// never on a completed match.

test('a fielded player sees enter-score on their unfinished match only', () => {
  const host = hostStub();
  renderMatchCenter(host, TN, { user: { id: 'p3' } });
  // p3 plays m2 (completed) and m4 (upcoming) — only m4 gets the button.
  assert.equal((host.innerHTML.match(/data-mpv-go/g) || []).length, 1);
  assert.match(host.innerHTML, new RegExp(`#/score/${TN.id}/m4`));
});

test('an admin sees enter-score on every unfinished match', () => {
  const host = hostStub();
  renderMatchCenter(host, TN, { user: { id: 'boss', role: 'admin' } });
  // m3 live + m4 upcoming; m1/m2 are completed.
  assert.equal((host.innerHTML.match(/data-mpv-go/g) || []).length, 2);
});

test('an assigned scorer sees enter-score on their match only', () => {
  const host = hostStub();
  renderMatchCenter(host, TN, { user: { id: 'scorekeeper' } });
  assert.equal((host.innerHTML.match(/data-mpv-go/g) || []).length, 1);
  assert.match(host.innerHTML, new RegExp(`#/score/${TN.id}/m3`));
});

test('a spectator sees no enter-score buttons', () => {
  const host = hostStub();
  renderMatchCenter(host, TN, { user: { id: 'stranger' } });
  assert.equal((host.innerHTML.match(/data-mpv-go/g) || []).length, 0);
});

// ---- Plain match play (1v1 singles, no teams) ----
// The Match format reuses the whole engine but must never show team chrome:
// the board is a standings table plus the match cards, and every side is a
// player's name.

const SINGLES_TN = {
  id: 'sgl',
  format: 'match',
  mp: {
    roster: {
      p1: { name: 'Bat', userId: 'p1' },
      p2: { name: 'Dorj', userId: 'p2' },
      p3: { name: 'Saruul', userId: 'p3' },
      p4: { name: 'Tulga', userId: 'p4' }
    },
    matches: {
      // Bat closes out Dorj 3 & 2.
      m1: {
        id: 'm1', number: 1, format: 'SINGLES', teeTime: '09:00',
        players: { a: ['p1'], b: ['p2'] },
        holes: holes('a', 'a', HALVED, 'a', HALVED, HALVED, HALVED, HALVED,
          HALVED, HALVED, HALVED, HALVED, HALVED, HALVED, HALVED, HALVED)
      },
      // Saruul 1 UP on Tulga thru 3, live.
      m2: {
        id: 'm2', number: 2, format: 'SINGLES', teeTime: '09:10',
        players: { a: ['p3'], b: ['p4'] },
        holes: holes('a', HALVED, HALVED)
      }
    }
  }
};

test('a singles board shows standings, not a team scoreboard', () => {
  const host = hostStub();
  renderMatchCenter(host, SINGLES_TN);
  assert.match(host.innerHTML, /Standings/);
  ['Bat', 'Dorj', 'Saruul', 'Tulga'].forEach(n =>
    assert.match(host.innerHTML, new RegExp(n)));
  assert.ok(!/Session results/.test(host.innerHTML), 'no session breakdown');
  assert.ok(!/Team A|Team B/.test(host.innerHTML), 'no team fallback labels');
});

test('singles cards lead with the player, not a team short', () => {
  const host = hostStub();
  renderMatchCenter(host, SINGLES_TN);
  assert.match(host.innerHTML, /Bat 3 &amp; 2/);
  assert.match(host.innerHTML, /Saruul 1 UP/);
  assert.equal((host.innerHTML.match(/data-mpv="open"/g) || []).length, 2);
});

test('the sample renders the whole board', () => {
  const host = hostStub();
  renderMatchCenter(host, MP_DEMO);
  assert.deepEqual(teamTotals(Object.values(MP_DEMO.mp.matches)), { a: 3.5, b: 2.5 });
  assert.match(host.innerHTML, />3\.5</);
  assert.match(host.innerHTML, /ALTAI 2 UP/);   // the spec's own example card
  assert.match(host.innerHTML, /ALTAI 3 &amp; 2/);
  assert.equal((host.innerHTML.match(/data-mpv="open"/g) || []).length, 24);
});
