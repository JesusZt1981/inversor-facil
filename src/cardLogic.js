'use strict';

function toDate(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Fecha inválida: ${value}`);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

function makeDate(year, monthIndex, day) {
  const safeDay = Math.min(day, daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, safeDay, 12));
}

function addMonths(date, delta) {
  return makeDate(date.getUTCFullYear(), date.getUTCMonth() + delta, date.getUTCDate());
}

function addDays(date, delta) {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}

function statementEndForPurchase(purchaseDate, cutoffDay = 15) {
  const d = toDate(purchaseDate);
  if (d.getUTCDate() <= cutoffDay) {
    return makeDate(d.getUTCFullYear(), d.getUTCMonth(), cutoffDay);
  }
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, cutoffDay);
}

function dueDateForStatement(statementEnd, paymentDay = 3) {
  const end = toDate(statementEnd);
  const sameMonthCandidate = makeDate(end.getUTCFullYear(), end.getUTCMonth(), paymentDay);
  if (sameMonthCandidate > end) return sameMonthCandidate;
  return makeDate(end.getUTCFullYear(), end.getUTCMonth() + 1, paymentDay);
}

function statementPeriod(statementEnd, cutoffDay = 15) {
  const end = toDate(statementEnd);
  const previousEnd = makeDate(end.getUTCFullYear(), end.getUTCMonth() - 1, cutoffDay);
  return { start: addDays(previousEnd, 1), end };
}

function currentOpenStatementEnd(today, cutoffDay = 15) {
  return statementEndForPurchase(today, cutoffDay);
}

function latestClosedStatementEnd(today, cutoffDay = 15) {
  const d = toDate(today);
  const thisMonthCutoff = makeDate(d.getUTCFullYear(), d.getUTCMonth(), cutoffDay);
  return d >= thisMonthCutoff ? thisMonthCutoff : makeDate(d.getUTCFullYear(), d.getUTCMonth() - 1, cutoffDay);
}

function closedStatementEnds(today, cutoffDay = 15, months = 4) {
  const latest = latestClosedStatementEnd(today, cutoffDay);
  return Array.from({ length: months }, (_, i) => makeDate(latest.getUTCFullYear(), latest.getUTCMonth() - i, cutoffDay));
}

function daysBetween(a, b) {
  const ms = toDate(b) - toDate(a);
  return Math.round(ms / 86400000);
}

module.exports = {
  toDate,
  iso,
  makeDate,
  addDays,
  addMonths,
  statementEndForPurchase,
  dueDateForStatement,
  statementPeriod,
  currentOpenStatementEnd,
  latestClosedStatementEnd,
  closedStatementEnds,
  daysBetween,
};
