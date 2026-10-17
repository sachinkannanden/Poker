import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from './history.js';

function fakeClient({ failFirst = false } = {}) {
  const calls = [];
  let failed = !failFirst;
  return {
    calls,
    from: (table) => ({
      upsert: async (row, opts) => {
        if (!failed) { failed = true; return { error: { message: 'boom' } }; }
        calls.push({ table, row, opts });
        return { error: null };
      },
    }),
  };
}

const baseGame = () => ({
  code: 'ABC234', name: 'Friday', cardMode: 'digital', hostPlays: true, rules: { structure: 'nl' },
  status: 'playing', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000,
  players: [
    { id: 'a', name: 'Ann', chips: 1100, buyIn: 1000, rebuys: 0 },
    { id: 'b', name: 'Bo', chips: 900, buyIn: 1000, rebuys: 0 },
  ],
  hand: {
    number: 3, phase: 'complete', buttonId: 'a', board: ['As', 'Kd', '7c', '2h', '9s'],
    seats: [
      { id: 'a', name: 'Ann', total: 100, folded: false, allIn: false },
      { id: 'b', name: 'Bo', total: 100, folded: true, allIn: false },
    ],
    hole: { a: ['Ah', 'Kh'], b: ['2c', '3c'] },
    log: ['Hand #3', 'Bo folds'],
    result: {
      pots: [{ amount: 200, eligible: ['a', 'b'], winners: ['a'], handName: 'Two pair' }],
      winnings: { a: 200 }, showdown: { a: { name: 'Two pair' } }, uncontested: true, voided: false,
    },
  },
});

test('does nothing without a client', async () => {
  const h = createHistory(null);
  assert.equal(h.enabled, false);
  await h.sync(baseGame());
});

test('writes the game and a finished hand once', async () => {
  const c = fakeClient();
  const h = createHistory(c);
  const game = baseGame();
  await h.sync(game);
  await h.sync(game); // second state change: nothing new to save

  assert.equal(c.calls.length, 2);
  const [g, hand] = c.calls;
  assert.equal(g.table, 'games');
  assert.equal(g.row.code, 'ABC234');
  assert.equal(g.row.ended_at, null);
  assert.equal(hand.table, 'hands');
  assert.equal(hand.opts.onConflict, 'game_id,hand_number');
  assert.equal(hand.row.game_id, g.row.id);
  assert.equal(hand.row.hand_number, 3);
  assert.equal(hand.row.dealer, 'Ann');
  assert.equal(hand.row.pot_total, 200);
  assert.deepEqual(hand.row.pots[0].winners, ['Ann']);
  assert.deepEqual(hand.row.players.find((p) => p.name === 'Ann').hole, ['Ah', 'Kh']);
  assert.equal(hand.row.players.find((p) => p.name === 'Ann').won, 200);
  assert.deepEqual(hand.row.log, ['Hand #3', 'Bo folds']);
});

test('records the session end with final standings', async () => {
  const c = fakeClient();
  const h = createHistory(c);
  const game = baseGame();
  await h.sync(game);
  game.status = 'ended';
  await h.sync(game);
  const last = c.calls.at(-1);
  assert.equal(last.table, 'games');
  assert.equal(last.row.status, 'ended');
  assert.equal(last.row.final_standings.find((p) => p.name === 'Bo').net, -100);
  assert.ok(last.row.ended_at);
});

test('a failed write is retried on the next state change', async () => {
  const c = fakeClient({ failFirst: true });
  const h = createHistory(c);
  const game = baseGame();
  const quiet = console.error;
  console.error = () => {};
  await h.sync(game); // the game row fails, the hand row after it too
  console.error = quiet;
  await h.sync(game);
  assert.ok(c.calls.some((x) => x.table === 'games'));
  assert.ok(c.calls.some((x) => x.table === 'hands'));
});
