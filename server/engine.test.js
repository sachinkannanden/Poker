import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareScores } from './cards.js';
import * as E from './engine.js';

function makeGame({ n = 3, stacks, mode = 'digital', rules = {} } = {}) {
  const r = E.validateRules(rules, mode);
  const players = Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, name: 'P' + i, chips: stacks ? stacks[i] : r.startingStack,
    rebuys: 0, sittingOut: false, busted: false,
  }));
  return { cardMode: mode, rules: r, status: 'playing', paused: false, players, buttonId: null, handNumber: 0, hand: null };
}
const chipsInPlay = (g) => g.players.reduce((a, p) => a + p.chips, 0) + (g.hand && g.hand.phase !== 'complete' ? E.potTotal(g.hand) : 0);
const to = (g) => g.hand.toActId;
const act = (g, type, amount) => E.act(g, to(g), { type, amount });

test('hand ranking order and ties', () => {
  const s = (c) => evaluate(c.split(' ')).score;
  const sf = s('9h Th Jh Qh Kh 2c 3d');
  const quads = s('9h 9d 9s 9c Kh 2c 3d');
  const fh = s('9h 9d 9s Kc Kh 2c 3d');
  const flush = s('2h 5h 9h Jh Kh 2c 3d');
  const straight = s('9h Td Js Qc Kh 2c 3d');
  const wheel = s('Ah 2d 3s 4c 5h Kc Kd');
  const trips = s('9h 9d 9s 4c Kh 2c 3d');
  const twop = s('9h 9d 4s 4c Kh 2c 3d');
  const pair = s('9h 9d 5s 4c Kh 2c 3d');
  const high = s('9h Td 5s 4c Kh 2c 3d');
  const order = [sf, quads, fh, flush, straight, trips, twop, pair, high];
  for (let i = 0; i < order.length - 1; i++) assert.ok(compareScores(order[i], order[i + 1]) > 0, `rank ${i}`);
  assert.equal(evaluate('Ah 2d 3s 4c 5h Kc Kd'.split(' ')).name, 'Straight');
  assert.ok(compareScores(straight, wheel) > 0);
  // kicker
  assert.ok(compareScores(s('Ah Ad Ks 4c 5h 7c 8d'), s('Ah Ad Qs 4c 5h 7c 8d')) > 0);
  assert.equal(compareScores(s('Ah Kd 2s 3c 9h Tc Jd'), s('Ac Kh 2d 3s 9c Ts Jh')), 0);
});

test('3-handed blinds and preflop order', () => {
  const g = makeGame({ n: 3, rules: { smallBlind: 5, bigBlind: 10, minRaise: 10 } });
  E.startHand(g);
  assert.equal(g.hand.buttonId, 'p0');
  assert.equal(g.hand.sbId, 'p1');
  assert.equal(g.hand.bbId, 'p2');
  assert.equal(to(g), 'p0'); // UTG = button when 3-handed
  assert.equal(g.hand.hole.p0.length, 2);
  act(g, 'call'); act(g, 'call');
  assert.equal(to(g), 'p2'); // BB option
  assert.equal(E.legalActions(g, 'p2').check, true);
  act(g, 'check');
  assert.equal(g.hand.street, 'flop');
  assert.equal(g.hand.board.length, 3);
  assert.equal(to(g), 'p1'); // first left of button
  assert.equal(E.potTotal(g.hand), 30);
});

test('heads-up: button posts SB, acts first preflop, last postflop', () => {
  const g = makeGame({ n: 2 });
  E.startHand(g);
  assert.equal(g.hand.sbId, 'p0');
  assert.equal(to(g), 'p0');
  act(g, 'call'); act(g, 'check');
  assert.equal(to(g), 'p1');
  // next hand button moves
  act(g, 'fold');
  E.startHand(g);
  assert.equal(g.hand.buttonId, 'p1');
});

test('host min-raise increment and raise cap', () => {
  const g = makeGame({ n: 3, rules: { minRaise: 25, raiseCap: 2 } });
  E.startHand(g);
  const l = E.legalActions(g, to(g));
  assert.deepEqual(l.raise, { min: 35, max: 1000 });
  assert.throws(() => act(g, 'raise', 30), /between 35/);
  act(g, 'raise', 35);               // raise 1
  act(g, 'raise', 60);               // raise 2
  const l2 = E.legalActions(g, to(g));
  assert.equal(l2.raise, null);
  assert.equal(l2.allIn, null);
  assert.match(l2.raiseLockedReason, /cap/);
  act(g, 'call');
  act(g, 'call');
  assert.equal(g.hand.street, 'flop');
  // postflop: opening bet is not a raise
  act(g, 'bet', 25); act(g, 'raise', 50); act(g, 'raise', 75);
  assert.equal(E.legalActions(g, to(g)).raise, null);
});

test('pot-limit maximum', () => {
  const g = makeGame({ n: 3, rules: { structure: 'pl', minRaise: 10 } });
  E.startHand(g);
  // pot 15, to call 10 → max raise to 10 + 15 + 10 = 35
  assert.deepEqual(E.legalActions(g, to(g)).raise, { min: 20, max: 35 });
  assert.equal(E.legalActions(g, to(g)).allIn, null);
});

test('fixed-limit sizes come from host settings', () => {
  const g = makeGame({ n: 2, rules: { structure: 'fl', flSmallBet: 10, flBigBet: 40 } });
  E.startHand(g);
  assert.deepEqual(E.legalActions(g, to(g)).raise, { min: 20, max: 20 });
  act(g, 'call'); act(g, 'check'); // flop
  assert.deepEqual(E.legalActions(g, to(g)).raise, { min: 10, max: 10 });
  act(g, 'check'); act(g, 'check'); // turn
  assert.deepEqual(E.legalActions(g, to(g)).raise, { min: 40, max: 40 });
});

test('antes from every player, antes-only order', () => {
  const g = makeGame({ n: 3, rules: { forcedBets: 'antes', ante: 3, minRaise: 10 } });
  E.startHand(g);
  assert.equal(E.potTotal(g.hand), 9);
  assert.equal(g.hand.currentBet, 0);
  assert.equal(to(g), 'p1');
  assert.equal(E.legalActions(g, 'p1').kind, 'bet');
});

test('side pots with three all-ins', () => {
  const g = makeGame({ n: 3, stacks: [100, 300, 500], rules: { smallBlind: 5, bigBlind: 10, minRaise: 10 } });
  E.startHand(g);
  const before = chipsInPlay(g);
  act(g, 'allin'); // p0 100
  act(g, 'allin'); // p1 300
  act(g, 'call');  // p2 calls 300
  assert.equal(g.hand.phase, 'complete');
  const pots = g.hand.result.pots;
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), ['p0', 'p1', 'p2']);
  assert.equal(pots[1].amount, 400);
  assert.equal(chipsInPlay(g), before);
});

test('uncalled bet is returned', () => {
  const g = makeGame({ n: 2, stacks: [100, 1000] });
  E.startHand(g);
  act(g, 'call');
  act(g, 'allin'); // p1 shoves 1000 total, p0 has 90 behind
  act(g, 'call');  // p0 all-in for 100 total
  assert.equal(g.hand.phase, 'complete');
  assert.equal(g.hand.result.pots.reduce((a, p) => a + p.amount, 0), 200);
  assert.equal(chipsInPlay(g), 1100);
});

test('short all-in raise does not reopen betting', () => {
  const g = makeGame({ n: 3, stacks: [1000, 1000, 45], rules: { smallBlind: 5, bigBlind: 10, minRaise: 30 } });
  E.startHand(g);
  act(g, 'raise', 40);  // p0 to 40
  act(g, 'call');       // p1 calls 40
  act(g, 'allin');      // p2 (BB) all-in to 45: short raise
  assert.equal(to(g), 'p0');
  const l = E.legalActions(g, 'p0');
  assert.equal(l.call, 5);
  assert.equal(l.raise, null);
  act(g, 'call'); act(g, 'call');
  assert.equal(g.hand.street, 'flop');
});

test('physical mode: host advances streets and splits pots', () => {
  const g = makeGame({ n: 3, mode: 'physical' });
  E.startHand(g);
  assert.equal(g.hand.deck, null);
  assert.deepEqual(g.hand.hole, {});
  act(g, 'call'); act(g, 'call'); act(g, 'check');
  assert.equal(g.hand.phase, 'awaitingStreet');
  assert.throws(() => act(g, 'check'), /not your turn/);
  E.advanceStreet(g);
  assert.equal(g.hand.street, 'flop');
  for (const st of ['turn', 'river']) { act(g, 'check'); act(g, 'check'); act(g, 'check'); E.advanceStreet(g); assert.equal(g.hand.street, st); }
  act(g, 'check'); act(g, 'check'); act(g, 'check');
  assert.equal(g.hand.phase, 'awaitingWinner');
  assert.throws(() => E.declareWinners(g, [[]]), /at least one/);
  E.declareWinners(g, [['p0', 'p1']]);
  // pot 30 split: 15 each
  assert.deepEqual(g.players.map((p) => p.chips), [1005, 1005, 990]);
});

test('physical mode: all-in with side pot asks for each pot', () => {
  const g = makeGame({ n: 3, mode: 'physical', stacks: [50, 1000, 1000] });
  E.startHand(g);
  act(g, 'allin'); act(g, 'call'); act(g, 'call');
  assert.equal(g.hand.phase, 'awaitingStreet'); // p1/p2 can still bet
  E.advanceStreet(g);
  act(g, 'bet', 100); act(g, 'call');
  E.advanceStreet(g); act(g, 'check'); act(g, 'check');
  E.advanceStreet(g); act(g, 'check'); act(g, 'check');
  const pots = E.computePots(g.hand);
  assert.equal(pots.length, 2);
  assert.throws(() => E.declareWinners(g, [['p0'], ['p0']]), /not eligible/);
  E.declareWinners(g, [['p0'], ['p2']]);
  assert.equal(g.players[0].chips, 150);
  assert.equal(g.players[0].busted, false);
  assert.equal(chipsInPlay(g), 2050);
});

test('bust, spectate and rebuy', () => {
  const g = makeGame({ n: 2, stacks: [10, 1000], rules: { smallBlind: 5, bigBlind: 10 } });
  g.hand = null;
  E.startHand(g);
  // force a fold so p1 wins p0's blind... instead make p0 lose all: p0 all-in, p1 wins by rigging hole cards
  g.hand.hole.p0 = ['2c', '3d']; g.hand.hole.p1 = ['Ah', 'Ad'];
  g.hand.deck = ['7s', '8s', '9d', 'Jc', 'Qh', 'Kc', '4h', '5s', '6c', 'Td'].reverse();
  act(g, 'call'); // p0 calls all-in (has 5 left after SB)
  assert.equal(g.hand.phase, 'complete');
  assert.equal(g.players[0].busted, true);
  assert.throws(() => E.startHand(g), /At least 2/);
  E.rebuy(g, 'p0');
  assert.equal(g.players[0].chips, 1000);
  assert.equal(g.players[0].rebuys, 1);
  g.rules.allowRebuys = false;
});

test('fuzz: random legal play conserves chips', () => {
  for (const mode of ['digital', 'physical']) for (const structure of ['nl', 'pl', 'fl']) {
    for (const forcedBets of ['blinds', 'antes', 'both']) {
      const g = makeGame({ n: 5, mode, stacks: [200, 500, 80, 1000, 330], rules: { structure, forcedBets, ante: 2, raiseCap: 3, minRaise: 15 } });
      const total = chipsInPlay(g);
      for (let h = 0; h < 60; h++) {
        for (const p of g.players) if (p.busted) E.rebuy(g, p.id);
        E.startHand(g);
        let guard = 0;
        while (g.hand.phase !== 'complete' && guard++ < 200) {
          if (g.hand.phase === 'awaitingStreet') { E.advanceStreet(g); continue; }
          if (g.hand.phase === 'awaitingWinner') {
            const pots = E.computePots(g.hand);
            E.declareWinners(g, pots.map((p) => [p.eligible[Math.floor(Math.random() * p.eligible.length)]]));
            continue;
          }
          if (Math.random() < 0.03) {
            const live = g.hand.seats.filter((x) => !x.folded);
            E.forceFold(g, live[Math.floor(Math.random() * live.length)].id);
            continue;
          }
          if (Math.random() < 0.03) { E.timeoutAction(g); continue; }
          const l = E.legalActions(g, to(g));
          const opts = ['fold'];
          if (l.check) opts.push('check', 'check');
          if (l.call) opts.push('call', 'call', 'call');
          if (l.raise) opts.push('raise');
          if (l.allIn) opts.push('allin');
          const pick = opts[Math.floor(Math.random() * opts.length)];
          if (pick === 'raise') act(g, l.kind, l.raise.min + Math.floor(Math.random() * (Math.min(l.raise.max, l.raise.min + 100) - l.raise.min + 1)));
          else act(g, pick);
        }
        assert.equal(g.hand.phase, 'complete', 'hand finished');
        const rebuys = g.players.reduce((a, p) => a + p.rebuys, 0);
        assert.equal(chipsInPlay(g), total + rebuys * g.rules.startingStack, `chips conserved ${mode}/${structure}/${forcedBets}`);
        for (const p of g.players) assert.ok(p.chips >= 0);
      }
    }
  }
});
