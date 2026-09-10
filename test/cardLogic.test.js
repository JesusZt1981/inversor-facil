'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  iso,
  statementEndForPurchase,
  dueDateForStatement,
  statementPeriod,
} = require('../src/cardLogic');

test('compra el 10 de septiembre corta el 15 de septiembre', () => {
  assert.equal(iso(statementEndForPurchase('2026-09-10', 15)), '2026-09-15');
});

test('compra el 20 de septiembre corta el 15 de octubre', () => {
  assert.equal(iso(statementEndForPurchase('2026-09-20', 15)), '2026-10-15');
});

test('corte 15 de septiembre vence el 3 de octubre', () => {
  assert.equal(iso(dueDateForStatement('2026-09-15', 3)), '2026-10-03');
});

test('periodo del corte 15 de septiembre es 16 agosto a 15 septiembre', () => {
  const p = statementPeriod('2026-09-15', 15);
  assert.equal(iso(p.start), '2026-08-16');
  assert.equal(iso(p.end), '2026-09-15');
});
