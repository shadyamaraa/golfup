// A coach's programs: what a coach may say of one, the writes that save,
// publish and remove it, and the writes that ask to join and leave. Pure —
// src/coaching-programs.js. The database rules that guard the same writes are
// tested on the real rules engine in scripts/test-rules.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LEVELS, MAX_OPTIONS, PEOPLE_MAX, POSTER_MAX_CHARS, THUMB_MAX_CHARS,
  programId, enrollKey, optionList, cleanOptions, cleanProgram, programErrors, fromPrice,
  programList, allPrograms, programWrites, publishWrites, enrollWrites, unenrollWrites,
  removeProgramWrites, enrollmentList,
} from '../src/coaching-programs.js';

const NOW = 1795000000000;
const POSTER = 'data:image/webp;base64,POSTER';
const THUMB = 'data:image/webp;base64,THUMB';
const typed = { title: '  Beginner course ', level: 'beginner', summary: ' The basics.\nTen lessons. ',
  options: [{ label: ' 10 хичээл ', price: '1,200,000₮' }, { label: 'Туршилт', price: 200000 }], people: '3' };

test('prices as typed: trimmed, a row with no name dropped, six at most, the amount a whole number', () => {
  assert.deepEqual(cleanOptions([{ label: ' 10 хичээл ', price: '1,200,000₮' }, { label: '', price: 5 }, { label: 'Free', price: '' },
    { label: 'Minus', price: -5 }, null]), [{ label: '10 хичээл', price: 1200000 }, { label: 'Free', price: 0 }, { label: 'Minus', price: 5 }]);
  assert.equal(cleanOptions(Array.from({ length: 9 }, (_, i) => ({ label: 'o' + i, price: i }))).length, MAX_OPTIONS);
  assert.equal(cleanOptions([{ label: 'x'.repeat(60), price: 1 }])[0].label.length, 40);
  assert.equal(cleanOptions([{ label: 'big', price: 1e12 }])[0].price, 100000000);
  assert.deepEqual(cleanOptions(null), []);
});

test('a program as typed → as stored', () => {
  assert.deepEqual(cleanProgram(typed), { title: 'Beginner course', level: 'beginner', summary: 'The basics.\nTen lessons.',
    options: [{ label: '10 хичээл', price: 1200000 }, { label: 'Туршилт', price: 200000 }], people: 3 });
  const bare = cleanProgram({});
  assert.deepEqual(bare, { title: '', level: 'all', summary: '', options: [], people: 1 });
  assert.equal(cleanProgram({ level: 'pro' }).level, 'all');
  assert.deepEqual(LEVELS, ['all', 'beginner', 'intermediate', 'advanced']);
  assert.equal(cleanProgram({ people: 99 }).people, PEOPLE_MAX);
  assert.equal(cleanProgram({ people: 0 }).people, 1);
  assert.equal(cleanProgram({ title: 't'.repeat(200) }).title.length, 80);
  assert.equal(cleanProgram({ summary: 's'.repeat(2000) }).summary.length, 1000);
});

test('what is missing before a program can be published', () => {
  assert.deepEqual(programErrors(typed), []);
  assert.deepEqual(programErrors({}), ['title', 'options']);
  assert.deepEqual(programErrors({ title: '  ', options: [{ label: 'a', price: 1 }] }), ['title']);
  assert.deepEqual(programErrors({ title: 'A', options: [{ label: ' ', price: 1 }] }), ['options']);
});

test('the prices as stored — a list, or the object a database makes of one', () => {
  const list = [{ label: 'A', price: 5 }, { label: 'B', price: 0 }];
  assert.deepEqual(optionList({ options: list }), list);
  assert.deepEqual(optionList({ options: { 0: list[0], 1: list[1] } }), list);
  assert.deepEqual(optionList({ options: [null, { label: ' ', price: 1 }, { label: 'C', price: '7' }] }), [{ label: 'C', price: 7 }]);
  assert.deepEqual(optionList({}), []);
  assert.deepEqual(optionList(null), []);
});

test('the lowest price that is one', () => {
  assert.equal(fromPrice({ options: [{ label: 'A', price: 800000 }, { label: 'B', price: 0 }, { label: 'C', price: 500000 }] }), 500000);
  assert.equal(fromPrice({ options: [{ label: 'Ask', price: 0 }] }), 0);
  assert.equal(fromPrice({}), 0);
});

test('a coach\'s programs as a list: published only, unless all are asked for; newest first', () => {
  const map = { p1: { title: 'Old', active: true, createdAt: 1 }, p2: { title: 'Hidden', active: false, createdAt: 3 },
    p3: { title: 'New', active: true, createdAt: 2 }, junk: 'x', untitled: { active: true } };
  assert.deepEqual(programList(map).map(p => p.id), ['p3', 'p1']);
  assert.deepEqual(programList(map, { all: true }).map(p => p.id), ['p3', 'p1', 'p2']);   // hidden ones last
  assert.deepEqual(programList(null), []);
  assert.equal(programList({ p: { title: 'T', active: 'yes' } }).length, 0);              // only a true switch publishes
});

test('every published program of every coach who is taking bookings', () => {
  const byCoach = { c1: { p1: { title: 'A', active: true, createdAt: 1 } }, c2: { p2: { title: 'B', active: true, createdAt: 5 } },
    off: { p3: { title: 'C', active: true, createdAt: 9 } } };
  const list = allPrograms(byCoach, (id) => id !== 'off');
  assert.deepEqual(list.map(p => [p.coachId, p.id]), [['c2', 'p2'], ['c1', 'p1']]);
  assert.deepEqual(allPrograms(null, () => true), []);
});

test('saving a program: the record whole, and the poster only when it changes', () => {
  const made = programWrites('c1', 'p1', typed, { poster: POSTER, thumb: THUMB, now: NOW });
  assert.deepEqual(Object.keys(made).sort(), ['coachPosters/c1/p1', 'coachPrograms/c1/p1']);
  assert.equal(made['coachPosters/c1/p1'], POSTER);
  assert.deepEqual(made['coachPrograms/c1/p1'], { ...cleanProgram(typed), active: true, hasPoster: true, thumb: THUMB, createdAt: NOW, updatedAt: NOW });

  // An edit that leaves the poster alone: no poster path, the thumbnail and the day it was made kept.
  const existing = made['coachPrograms/c1/p1'];
  const edit = programWrites('c1', 'p1', { ...typed, title: 'Renamed', active: false }, { existing, now: NOW + 5 });
  assert.deepEqual(Object.keys(edit), ['coachPrograms/c1/p1']);
  assert.deepEqual([edit['coachPrograms/c1/p1'].title, edit['coachPrograms/c1/p1'].active, edit['coachPrograms/c1/p1'].hasPoster,
    edit['coachPrograms/c1/p1'].thumb, edit['coachPrograms/c1/p1'].createdAt, edit['coachPrograms/c1/p1'].updatedAt],
  ['Renamed', false, true, THUMB, NOW, NOW + 5]);

  // The poster taken away: the path is cleared, the record says so and drops the thumbnail.
  const bare = programWrites('c1', 'p1', typed, { poster: null, existing, now: NOW + 9 });
  assert.equal(bare['coachPosters/c1/p1'], null);
  assert.equal(bare['coachPrograms/c1/p1'].hasPoster, false);
  assert.equal('thumb' in bare['coachPrograms/c1/p1'], false);

  // A new one with no poster.
  const plain = programWrites('c1', 'p2', typed, { poster: null, now: NOW });
  assert.equal(plain['coachPrograms/c1/p2'].hasPoster, false);
  assert.equal(programWrites('c1', 'p3', typed, { now: NOW })['coachPrograms/c1/p3'].hasPoster, false);
});

test('showing and hiding a program touches only the switch', () => {
  assert.deepEqual(publishWrites('c1', 'p1', false, NOW), { 'coachPrograms/c1/p1/active': false, 'coachPrograms/c1/p1/updatedAt': NOW });
  assert.equal(publishWrites('c1', 'p1', 1, NOW)['coachPrograms/c1/p1/active'], true);
});

test('asking to join: the request and the member\'s own list, the price copied as it stands', () => {
  const program = { options: { 0: { label: '10 хичээл', price: 1200000 }, 1: { label: 'Туршилт', price: 200000 } } };
  assert.deepEqual(enrollWrites('c1', 'p1', 'u9', program, 1, '  weekends ', NOW), {
    'coachEnrollments/c1/p1/u9': { option: '1', label: 'Туршилт', price: 200000, at: NOW, note: 'weekends' },
    'playerPrograms/u9/c1_p1': { coachId: 'c1', programId: 'p1', at: NOW },
  });
  assert.equal('note' in enrollWrites('c1', 'p1', 'u9', program, 0, '  ', NOW)['coachEnrollments/c1/p1/u9'], false);
  assert.equal(enrollWrites('c1', 'p1', 'u9', program, 0, 'n'.repeat(500), NOW)['coachEnrollments/c1/p1/u9'].note.length, 300);
  assert.equal(enrollWrites('c1', 'p1', 'u9', program, 2, '', NOW), null);      // a price the program does not have
  assert.equal(enrollWrites('c1', 'p1', 'u9', {}, 0, '', NOW), null);
  assert.equal(enrollKey('c1', 'p1'), 'c1_p1');
});

test('leaving, and removing a program whole', () => {
  assert.deepEqual(unenrollWrites('c1', 'p1', 'u9'), { 'coachEnrollments/c1/p1/u9': null, 'playerPrograms/u9/c1_p1': null });
  assert.deepEqual(removeProgramWrites('c1', 'p1', ['u9', 'u8']), {
    'coachPrograms/c1/p1': null, 'coachPosters/c1/p1': null,
    'coachEnrollments/c1/p1/u9': null, 'playerPrograms/u9/c1_p1': null,
    'coachEnrollments/c1/p1/u8': null, 'playerPrograms/u8/c1_p1': null,
  });
  assert.deepEqual(Object.keys(removeProgramWrites('c1', 'p1')), ['coachPrograms/c1/p1', 'coachPosters/c1/p1']);
});

test('who asked to join, newest first', () => {
  const list = enrollmentList({ u1: { label: 'A', price: 5, at: 10 }, u2: { label: 'B', price: '7', note: 'hi', at: 20 }, junk: null });
  assert.deepEqual(list, [{ playerId: 'u2', label: 'B', price: 7, note: 'hi', at: 20 }, { playerId: 'u1', label: 'A', price: 5, note: '', at: 10 }]);
  assert.deepEqual(enrollmentList(null), []);
});

test('a program\'s key: made of the moment, later ones sort after', () => {
  const a = programId(NOW, 0), b = programId(NOW + 1, 0.99);
  assert.match(a, /^p[0-9a-z]+$/);
  assert.ok(a < b);
  assert.notEqual(programId(NOW, 0.1), programId(NOW, 0.9));
});

test('the limits here and in the database rules are the same', () => {
  const rules = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
  const block = rules.slice(rules.indexOf('"coachPrograms"'), rules.indexOf('"playerPrograms"'));
  assert.ok(block.includes(`newData.val().length <= ${POSTER_MAX_CHARS} && newData.val().beginsWith('data:image/')`), 'poster size');
  assert.ok(block.includes(`newData.val().length <= ${THUMB_MAX_CHARS} && newData.val().beginsWith('data:image/')`), 'thumbnail size');
  assert.ok(block.includes(`$i.matches(/^[0-${MAX_OPTIONS - 1}]$/)`), 'how many prices');
  assert.ok(block.includes(`newData.val() >= 1 && newData.val() <= ${PEOPLE_MAX}`), 'how many people');
  for (const level of LEVELS) assert.ok(block.includes(`newData.val() === '${level}'`), 'level ' + level);
  // what cleanProgram cuts to is what the rules accept
  const longest = cleanProgram({ title: 't'.repeat(999), summary: 's'.repeat(9999), options: [{ label: 'l'.repeat(999), price: 1 }] });
  assert.ok(block.includes(`newData.val().length > 0 && newData.val().length <= ${longest.title.length}`), 'title length');
  assert.ok(block.includes(`newData.isString() && newData.val().length <= ${longest.summary.length}`), 'summary length');
  assert.ok(block.includes(`newData.val().length > 0 && newData.val().length <= ${longest.options[0].label.length}`), 'price name length');
});
