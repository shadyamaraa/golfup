// scripts/test-game-names.mjs
// The names on the casual scoring screen: nickname, else first name, else
// the stored name — and two players who would read the same told apart.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { groupNameLabels } = await import('../src/game-score.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const P = (id, name) => ({ id, name });

test('nickname first, then first name, then the stored name', () => {
  const labels = groupNameLabels([P('a', 'Маргад Жамбалдорж'), P('b', 'Буянжаргал Дорж'), P('c', 'Эрдэнэбаатар')], {
    a: { username: 'bobi', firstName: 'Маргад' },
    b: { username: '', firstName: 'Буянжаргал' },
    c: { username: '', firstName: '' }
  });
  assert.deepEqual([...labels.values()], ['bobi', 'Буянжаргал', 'Эрдэнэбаатар']);
});

test('two of the same first name get their last-name initial', () => {
  const labels = groupNameLabels([P('a', 'Маргад'), P('b', 'Маргад'), P('c', 'Дорж')], {
    a: { firstName: 'Маргад', lastName: 'Жамбалдорж' },
    b: { firstName: 'Маргад', lastName: 'Батболд' },
    c: { firstName: 'Дорж' }
  });
  assert.deepEqual([...labels.values()], ['Маргад Ж.', 'Маргад Б.', 'Дорж']);
});

test('no last name on record: the initial comes from the stored full name', () => {
  const labels = groupNameLabels([P('a', 'Маргад Жамбалдорж'), P('b', 'Маргад Батболд')], {
    a: { firstName: 'Маргад' }, b: { firstName: 'Маргад' }
  });
  assert.deepEqual([...labels.values()], ['Маргад Ж.', 'Маргад Б.']);
});

test('same initial too: the full name tells them apart; a nickname that reads like a first name is marked as well', () => {
  const labels = groupNameLabels([P('a', 'Маргад Жамбалдорж'), P('b', 'Маргад Жаргалсайхан'), P('c', 'Очир Маргад')], {
    a: { firstName: 'Маргад', lastName: 'Жамбалдорж', fullName: 'Маргад Жамбалдорж' },
    b: { firstName: 'Маргад', lastName: 'Жаргалсайхан', fullName: 'Маргад Жаргалсайхан' },
    c: { username: 'Маргад', lastName: 'Очир' }
  });
  assert.deepEqual([...labels.values()], ['Маргад Жамбалдорж', 'Маргад Жаргалсайхан', 'Маргад О.']);
  // Nothing on record at all: the stored names, untouched.
  assert.deepEqual([...groupNameLabels([P('a', 'Бат'), P('b', 'Бат')], {}).values()], ['Бат', 'Бат']);
  assert.equal(groupNameLabels([], {}).size, 0);
});
