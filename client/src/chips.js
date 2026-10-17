// Chip maths: split an amount into a realistic assortment of casino denominations, and move
// chips between a tray and a bet (making change when a bigger chip has to be broken).
export const DENOMS = [100000, 25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1]; // largest first

// value → [face colour, edge-spot colour, label colour, label]
export const CHIP_STYLE = {
  1: ['#f2eee4', '#3b3b40', '#25252a'],
  5: ['#c93a2e', '#ffffff', '#ffffff'],
  10: ['#2c63b8', '#ffffff', '#ffffff'],
  25: ['#1f8c4e', '#ffffff', '#ffffff'],
  100: ['#1c1c20', '#e8c872', '#e8c872'],
  50: ['#e2792b', '#ffffff', '#ffffff'],
  500: ['#6d3ca8', '#ffffff', '#ffffff'],
  1000: ['#e3ab3b', '#ffffff', '#3a2a08'],
  5000: ['#8c2f45', '#ffffff', '#ffffff'],
  25000: ['#1b8d9d', '#ffffff', '#ffffff'],
  100000: ['#d9527f', '#ffffff', '#ffffff'],
};

export function chipLabel(d) {
  if (d >= 1000) return `${d / 1000}K`;
  return String(d);
}

// Spread the value over several denominations (the way a banker racks a stack), then let
// the remainder fall to the fewest chips possible.
export function rack(amount) {
  let rem = Math.max(0, Math.floor(Number(amount) || 0));
  const out = {};
  for (const d of DENOMS) {
    if (d < 10 || d > rem) continue;
    const n = Math.min(Math.floor((rem * 0.5) / d), 5);
    if (n > 0) { out[d] = (out[d] || 0) + n; rem -= n * d; }
  }
  for (const d of DENOMS) {
    const n = Math.floor(rem / d);
    if (n > 0) { out[d] = (out[d] || 0) + n; rem -= n * d; }
  }
  return out;
}

export const value = (counts) => Object.entries(counts).reduce((s, [d, n]) => s + Number(d) * n, 0);

function addChange(counts, amount, below) {
  let rem = amount;
  for (const d of DENOMS) {
    if (d >= below) continue;
    const n = Math.floor(rem / d);
    if (n > 0) { counts[d] = (counts[d] || 0) + n; rem -= n * d; }
  }
}

// Take one chip of denomination d out of `from`, breaking the next bigger chip if needed.
// Returns the new `from`, or null when it can't be done.
function takeOne(from, d) {
  const next = { ...from };
  if ((next[d] || 0) > 0) { next[d] -= 1; return next; }
  const bigger = [...DENOMS].reverse().find((x) => x > d && (next[x] || 0) > 0);
  if (!bigger) return null;
  next[bigger] -= 1;
  addChange(next, bigger - d, bigger);
  return next;
}

export function canTake(from, d) {
  return takeOne(from, d) !== null;
}

// Move one chip of denomination d between zones ('tray' | 'bet' | 'bank').
// Tray → bet auto-breaks a bigger chip when there's no exact one.
export function moveChip(state, d, from, to) {
  if (from === 'tray' && to === 'bet') {
    const t = takeOne(state.tray, d);
    return t ? { ...state, tray: t, bet: { ...state.bet, [d]: (state.bet[d] || 0) + 1 } } : state;
  }
  if ((state[from][d] || 0) <= 0) return state;
  return { ...state, [from]: { ...state[from], [d]: state[from][d] - 1 }, [to]: { ...state[to], [d]: (state[to][d] || 0) + 1 } };
}

const merge = (...all) => {
  const out = {};
  for (const c of all) for (const [d, n] of Object.entries(c || {})) out[d] = (out[d] || 0) + n;
  return out;
};

function fill(tray, staged) {
  let state = { tray, bet: {}, bank: {} };
  let rem = Math.max(0, Math.floor(staged) || 0);
  for (const d of DENOMS) {
    while (rem >= d) {
      const taken = takeOne(state.tray, d);
      if (!taken) break;
      state = { ...state, tray: taken, bet: { ...state.bet, [d]: (state.bet[d] || 0) + 1 } };
      rem -= d;
    }
  }
  return state;
}

// Fresh tray holding `stack`, with `staged` of it already pushed into the bet.
export function stage(stack, staged) {
  return fill(rack(stack), Math.min(staged, stack));
}

// Re-stage an amount while keeping the player's current mix of chips (their cashier changes).
export function restage(state, staged) {
  const pool = merge(state.tray, state.bet, state.bank);
  return fill(pool, Math.min(staged, value(pool)));
}

// Ways to swap what's in the bank for other chips of the same total value.
export function exchangeOptions(bank) {
  const V = value(bank);
  if (!V) return [];
  const held = DENOMS.filter((d) => bank[d] > 0);
  const out = [];
  for (const d of DENOMS) {
    if (V % d || V / d > 40) continue;
    if (held.length === 1 && held[0] === d) continue;
    out.push({ key: String(d), label: `${V / d} × ${chipLabel(d)}`, counts: { [d]: V / d } });
  }
  const mixed = rack(V);
  const fewest = {};
  let rem = V;
  for (const d of DENOMS) { const n = Math.floor(rem / d); if (n) { fewest[d] = n; rem -= n * d; } }
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const seen = out.map((o) => o.counts);
  if (!seen.some((c) => same(c, fewest)) && !same(fewest, bank)) out.unshift({ key: 'fewest', label: 'Fewest chips', counts: fewest });
  if (!seen.some((c) => same(c, mixed)) && !same(mixed, fewest) && !same(mixed, bank)) out.push({ key: 'mixed', label: 'Mixed', counts: mixed });
  return out;
}

export function applyExchange(state, counts) {
  return { ...state, bank: {}, tray: merge(state.tray, counts) };
}
