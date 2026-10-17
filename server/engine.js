// Pure Texas Hold'em table engine. All functions mutate the `game` object passed in
// and throw GameError with a player-facing message when an action is not allowed.
import { newDeck, evaluate, compareScores } from './cards.js';

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

export const DEFAULT_RULES = {
  structure: 'nl',          // 'nl' | 'pl' | 'fl'
  forcedBets: 'blinds',     // 'blinds' | 'antes' | 'both'
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,                  // paid by every player each hand when antes are on
  startingStack: 1000,
  raiseCap: 0,              // max raises per betting round; 0 = unlimited
  minRaise: 10,             // NL/PL: every bet/raise must add at least this much
  flSmallBet: 10,           // FL: bet/raise size pre-flop and flop
  flBigBet: 20,             // FL: bet/raise size turn and river
  turnTimeSec: 0,           // 0 = no turn timer
  autoFoldOnTimeout: false,
  rabbitHunt: false,        // digital mode only
  allowRebuys: true,
};

const STREETS = ['preflop', 'flop', 'turn', 'river'];

export function validateRules(input, cardMode) {
  const r = { ...DEFAULT_RULES, ...input };
  const ints = ['smallBlind', 'bigBlind', 'ante', 'startingStack', 'raiseCap', 'minRaise',
    'flSmallBet', 'flBigBet', 'turnTimeSec'];
  for (const k of ints) {
    r[k] = Number(r[k]);
    if (!Number.isInteger(r[k]) || r[k] < 0) fail(`${k} must be a whole number ≥ 0`);
  }
  if (!['nl', 'pl', 'fl'].includes(r.structure)) fail('Unknown betting structure');
  if (!['blinds', 'antes', 'both'].includes(r.forcedBets)) fail('Unknown ante/blind setup');
  const blinds = r.forcedBets !== 'antes';
  const antes = r.forcedBets !== 'blinds';
  if (blinds) {
    if (r.smallBlind < 1) fail('Small blind must be at least 1');
    if (r.bigBlind < r.smallBlind) fail('Big blind must be at least the small blind');
  }
  if (antes && r.ante < 1) fail('Ante must be at least 1');
  if (r.startingStack < 1) fail('Starting stack must be at least 1');
  if (r.structure === 'fl') {
    if (r.flSmallBet < 1 || r.flBigBet < 1) fail('Fixed-limit bet sizes must be at least 1');
  } else if (r.minRaise < 1) fail('Minimum raise increment must be at least 1');
  if (r.turnTimeSec > 0 && r.turnTimeSec < 5) fail('Turn timer must be 0 (off) or at least 5 seconds');
  r.autoFoldOnTimeout = !!r.autoFoldOnTimeout;
  r.rabbitHunt = cardMode === 'digital' ? !!r.rabbitHunt : false;
  r.allowRebuys = !!r.allowRebuys;
  return {
    structure: r.structure, forcedBets: r.forcedBets,
    smallBlind: blinds ? r.smallBlind : 0, bigBlind: blinds ? r.bigBlind : 0,
    ante: antes ? r.ante : 0, startingStack: r.startingStack, raiseCap: r.raiseCap,
    minRaise: r.minRaise, flSmallBet: r.flSmallBet, flBigBet: r.flBigBet,
    turnTimeSec: r.turnTimeSec, autoFoldOnTimeout: r.autoFoldOnTimeout,
    rabbitHunt: r.rabbitHunt, allowRebuys: r.allowRebuys,
  };
}

// ---------- helpers ----------
const seatOf = (hand, id) => hand.seats.find((s) => s.id === id);
const playerOf = (game, id) => game.players.find((p) => p.id === id);
const handActive = (game) => game.hand && game.hand.phase !== 'complete';
const nameOf = (game, id) => playerOf(game, id)?.name ?? seatOf(game.hand, id)?.name ?? '?';

function log(game, text) {
  game.hand.log.push(text);
  if (game.hand.log.length > 60) game.hand.log.shift();
}

// next seat index (circular) after i satisfying pred
function nextIdx(hand, i, pred) {
  const n = hand.seats.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (pred(hand.seats[j])) return j;
  }
  return -1;
}

function pay(game, seat, amount, live) {
  const p = playerOf(game, seat.id);
  const amt = Math.min(amount, p.chips);
  p.chips -= amt;
  seat.total += amt;
  if (live) seat.committed += amt;
  if (p.chips === 0) seat.allIn = true;
  return amt;
}

export const potTotal = (hand) => hand.seats.reduce((a, s) => a + s.total, 0);

// ---------- hand start ----------
export function eligibleToPlay(p) {
  return !p.busted && !p.sittingOut && p.chips > 0;
}

export function startHand(game) {
  if (game.status !== 'playing') fail('The game has not started');
  if (game.paused) fail('The game is paused');
  if (handActive(game)) fail('A hand is already in progress');
  const participants = game.players.filter(eligibleToPlay);
  if (participants.length < 2) fail('At least 2 players with chips (not sitting out) are needed');

  // Button: next participant after the previous button, in seat order.
  let buttonId;
  if (!game.buttonId) buttonId = participants[0].id;
  else {
    const order = game.players.map((p) => p.id);
    let i = order.indexOf(game.buttonId);
    if (i === -1) i = (game.lastButtonSeat ?? -1);
    for (let k = 1; k <= order.length; k++) {
      const p = game.players[(i + k + order.length) % order.length];
      if (eligibleToPlay(p)) { buttonId = p.id; break; }
    }
  }
  game.buttonId = buttonId;
  game.lastButtonSeat = game.players.findIndex((p) => p.id === buttonId);
  game.handNumber += 1;

  const rules = game.rules;
  const hand = {
    number: game.handNumber,
    phase: 'betting',
    street: 'preflop',
    seats: participants.map((p) => ({
      id: p.id, name: p.name, committed: 0, total: 0,
      folded: false, allIn: false, acted: false, raiseLocked: false,
    })),
    buttonId, sbId: null, bbId: null,
    deck: null, hole: {}, board: [],
    currentBet: 0, raisesThisRound: 0, toActId: null, turnDeadline: null,
    log: [], result: null, rabbit: [],
  };
  game.hand = hand;
  const n = hand.seats.length;
  const bIdx = hand.seats.findIndex((s) => s.id === buttonId);
  log(game, `Hand #${hand.number} — ${nameOf(game, buttonId)} has the button`);

  if (rules.ante > 0) {
    for (const s of hand.seats) pay(game, s, rules.ante, false);
    log(game, `Everyone antes ${rules.ante}`);
  }

  let firstIdx;
  if (rules.bigBlind > 0) {
    const sbIdx = n === 2 ? bIdx : (bIdx + 1) % n;
    const bbIdx = (sbIdx + 1) % n;
    hand.sbId = hand.seats[sbIdx].id;
    hand.bbId = hand.seats[bbIdx].id;
    const sbPaid = pay(game, hand.seats[sbIdx], rules.smallBlind, true);
    const bbPaid = pay(game, hand.seats[bbIdx], rules.bigBlind, true);
    log(game, `${nameOf(game, hand.sbId)} posts small blind ${sbPaid}`);
    log(game, `${nameOf(game, hand.bbId)} posts big blind ${bbPaid}`);
    hand.currentBet = rules.bigBlind;
    firstIdx = bbIdx;
  } else {
    firstIdx = bIdx;
  }

  if (game.cardMode === 'digital') {
    hand.deck = newDeck();
    // Deal one card at a time starting left of the button, like a real dealer.
    for (let round = 0; round < 2; round++)
      for (let k = 1; k <= n; k++) {
        const s = hand.seats[(bIdx + k) % n];
        (hand.hole[s.id] ||= []).push(hand.deck.pop());
      }
  }

  beginActionFrom(game, firstIdx);
  return hand;
}

function canAct(s) { return !s.folded && !s.allIn; }

// Find the next player to act after index i, or close the round.
function beginActionFrom(game, i) {
  const hand = game.hand;
  if (roundComplete(hand)) return endBettingRound(game);
  const j = nextIdx(hand, i, (s) => canAct(s) && (!s.acted || s.committed < hand.currentBet));
  if (j === -1) return endBettingRound(game);
  hand.toActId = hand.seats[j].id;
  hand.turnDeadline = game.rules.turnTimeSec > 0 ? Date.now() + game.rules.turnTimeSec * 1000 : null;
}

function roundComplete(hand) {
  const live = hand.seats.filter((s) => !s.folded);
  if (live.length <= 1) return true;
  const actors = live.filter((s) => !s.allIn);
  if (actors.length === 0) return true;
  if (actors.length === 1 && actors[0].committed >= hand.currentBet) {
    // Nobody left to bet against; only close if nobody all-in is above them.
    return true;
  }
  return actors.every((s) => s.acted && s.committed === hand.currentBet);
}

// ---------- legal actions ----------
function betSize(game) {
  const { street } = game.hand;
  return street === 'preflop' || street === 'flop' ? game.rules.flSmallBet : game.rules.flBigBet;
}

export function legalActions(game, playerId) {
  const hand = game.hand;
  if (!handActive(game) || hand.phase !== 'betting' || hand.toActId !== playerId || game.paused) return null;
  const s = seatOf(hand, playerId);
  const p = playerOf(game, playerId);
  const rules = game.rules;
  const stack = p.chips;
  const maxTo = s.committed + stack; // everything in
  const owe = hand.currentBet - s.committed;
  const toCall = Math.min(owe, stack);
  const opponentsCanAct = hand.seats.some((o) => o.id !== s.id && canAct(o));
  const capReached = rules.raiseCap > 0 && hand.currentBet > 0 && hand.raisesThisRound >= rules.raiseCap;

  const res = {
    fold: true,
    check: owe === 0,
    call: owe > 0 ? toCall : 0,
    callIsAllIn: owe > 0 && toCall === stack,
    kind: hand.currentBet === 0 ? 'bet' : 'raise',
    raise: null, // { min, max } in "raise to" terms
    allIn: null, // amount of the all-in ("to" total for this street), when it's a distinct option
    stack,
    currentBet: hand.currentBet,
    committed: s.committed,
    raiseLockedReason: null,
  };

  const raisePossible = stack > owe && opponentsCanAct && !s.raiseLocked && !capReached;
  if (s.raiseLocked) res.raiseLockedReason = 'An all-in short raise does not reopen betting for you';
  else if (capReached) res.raiseLockedReason = `Raise cap reached (${rules.raiseCap})`;

  if (raisePossible) {
    let minTo, capTo;
    if (rules.structure === 'fl') {
      minTo = capTo = hand.currentBet + betSize(game);
    } else {
      minTo = hand.currentBet + rules.minRaise;
      capTo = rules.structure === 'pl' ? hand.currentBet + potTotal(hand) + owe : Infinity;
      // If the pot is smaller than the host's minimum increment, the minimum is still allowed.
      capTo = Math.max(capTo, minTo);
    }
    if (minTo <= maxTo) res.raise = { min: minTo, max: Math.min(capTo, maxTo) };
    // Going all-in is a legal (possibly short) raise whenever it doesn't exceed the limit.
    if (maxTo <= capTo) res.allIn = maxTo;
  }
  return res;
}

// ---------- actions ----------
export function act(game, playerId, action) {
  const legal = legalActions(game, playerId);
  if (!legal) fail(game.paused ? 'The game is paused' : 'It is not your turn');
  const hand = game.hand;
  const s = seatOf(hand, playerId);
  const name = nameOf(game, playerId);
  const type = action?.type;

  if (type === 'fold') {
    s.folded = true;
    log(game, `${name} folds`);
  } else if (type === 'check') {
    if (!legal.check) fail('You cannot check — there is a bet to call');
    log(game, `${name} checks`);
  } else if (type === 'call') {
    if (!legal.call) fail('There is nothing to call');
    pay(game, s, legal.call, true);
    log(game, `${name} calls ${legal.call}${s.allIn ? ' (all-in)' : ''}`);
  } else if (type === 'bet' || type === 'raise') {
    if (!legal.raise) fail(legal.raiseLockedReason || 'You cannot raise here');
    const to = Number(action.amount);
    if (!Number.isInteger(to)) fail('Enter a whole-number amount');
    if (to < legal.raise.min || to > legal.raise.max)
      fail(`Amount must be between ${legal.raise.min} and ${legal.raise.max}`);
    applyRaise(game, s, to, true);
    log(game, `${name} ${legal.kind === 'bet' ? 'bets' : 'raises to'} ${to}${s.allIn ? ' (all-in)' : ''}`);
  } else if (type === 'allin') {
    const p = playerOf(game, playerId);
    const to = s.committed + p.chips;
    if (to <= hand.currentBet) {
      const amt = pay(game, s, p.chips, true);
      log(game, `${name} calls ${amt} (all-in)`);
    } else {
      if (legal.allIn == null) fail(legal.raiseLockedReason || 'You cannot go all-in for more here');
      const full = game.rules.structure === 'fl'
        ? to - hand.currentBet >= betSize(game)
        : to - hand.currentBet >= game.rules.minRaise;
      applyRaise(game, s, to, full || hand.currentBet === 0);
      log(game, `${name} goes all-in for ${to}`);
    }
  } else fail('Unknown action');

  s.acted = true;
  const idx = hand.seats.indexOf(s);
  beginActionFrom(game, idx);
}

function applyRaise(game, s, to, full) {
  const hand = game.hand;
  const wasBet = hand.currentBet === 0;
  pay(game, s, to - s.committed, true);
  hand.currentBet = to;
  for (const o of hand.seats) {
    if (o === s || !canAct(o)) continue;
    if (full) { o.acted = false; o.raiseLocked = false; }
    else if (o.acted) { o.acted = false; o.raiseLocked = true; }
  }
  if (full && !wasBet) hand.raisesThisRound += 1;
}

// Remove a player from the current hand (kick / timeout fold when it isn't their turn).
export function forceFold(game, playerId) {
  if (!handActive(game)) return;
  const hand = game.hand;
  const s = seatOf(hand, playerId);
  if (!s || s.folded) return;
  s.folded = true;
  log(game, `${s.name} is folded out of the hand`);
  const live = hand.seats.filter((x) => !x.folded);
  if (live.length === 1) return finishUncontested(game);
  if (hand.phase === 'betting' && hand.toActId === playerId) beginActionFrom(game, hand.seats.indexOf(s));
  else if (hand.phase === 'betting' && roundComplete(hand)) endBettingRound(game);
}

export function timeoutAction(game) {
  const hand = game.hand;
  if (!handActive(game) || hand.phase !== 'betting' || !hand.toActId) return false;
  const id = hand.toActId;
  const legal = legalActions(game, id);
  if (!legal) return false;
  log(game, `${nameOf(game, id)} ran out of time`);
  act(game, id, { type: legal.check ? 'check' : 'fold' });
  return true;
}

// ---------- streets ----------
function endBettingRound(game) {
  const hand = game.hand;
  hand.toActId = null;
  hand.turnDeadline = null;
  const live = hand.seats.filter((s) => !s.folded);
  if (live.length === 1) return finishUncontested(game);

  for (const s of hand.seats) { s.committed = 0; s.acted = false; s.raiseLocked = false; }
  hand.currentBet = 0;
  hand.raisesThisRound = 0;

  const moreBetting = live.filter((s) => !s.allIn).length >= 2;
  const lastStreet = hand.street === 'river';

  if (game.cardMode === 'physical') {
    if (lastStreet || !moreBetting) return toAwaitWinner(game, !moreBetting && !lastStreet);
    hand.phase = 'awaitingStreet';
    return;
  }
  // digital
  if (lastStreet || !moreBetting) {
    while (hand.board.length < 5) dealStreetCards(game);
    return showdown(game);
  }
  dealStreetCards(game);
  openStreet(game);
}

function dealStreetCards(game) {
  const hand = game.hand;
  hand.deck.pop(); // burn
  const next = STREETS[STREETS.indexOf(hand.street) + 1];
  const n = next === 'flop' ? 3 : 1;
  for (let i = 0; i < n; i++) hand.board.push(hand.deck.pop());
  hand.street = next;
  log(game, `${next[0].toUpperCase() + next.slice(1)}: ${hand.board.slice(-n).join(' ')}`);
}

function openStreet(game) {
  const hand = game.hand;
  hand.phase = 'betting';
  const bIdx = hand.seats.findIndex((s) => s.id === hand.buttonId);
  // first to act post-flop: first live player left of the button
  beginActionFrom(game, bIdx);
}

// Physical mode: host taps "Deal flop/turn/river".
export function advanceStreet(game) {
  const hand = game.hand;
  if (!handActive(game) || hand.phase !== 'awaitingStreet') fail('Betting is still open on this street');
  if (game.paused) fail('The game is paused');
  hand.street = STREETS[STREETS.indexOf(hand.street) + 1];
  log(game, `Dealer: ${hand.street}`);
  openStreet(game);
}

function refundUncalled(game) {
  const hand = game.hand;
  const sorted = [...hand.seats].sort((a, b) => b.total - a.total);
  if (sorted.length < 2) return;
  const [top, second] = sorted;
  const extra = top.total - second.total;
  if (extra > 0) {
    top.total -= extra;
    playerOf(game, top.id) && (playerOf(game, top.id).chips += extra);
    log(game, `${top.name} gets back ${extra} uncalled`);
  }
}

// Main pot + side pots from everyone's total contribution this hand.
export function computePots(hand) {
  const live = hand.seats.filter((s) => !s.folded);
  const levels = [...new Set(live.map((s) => s.total))].filter((v) => v > 0).sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const s of hand.seats) amount += Math.max(0, Math.min(s.total, L) - prev);
    const eligible = live.filter((s) => s.total >= L).map((s) => s.id);
    const last = pots[pots.length - 1];
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  // dead money above the highest live level (rare) goes to the last pot
  const leftover = hand.seats.reduce((a, s) => a + Math.max(0, s.total - prev), 0);
  if (leftover && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

function toAwaitWinner(game, runOut) {
  const hand = game.hand;
  refundUncalled(game);
  hand.phase = 'awaitingWinner';
  hand.toActId = null;
  if (runOut) log(game, 'Betting is closed — deal out the remaining cards, then declare the winner');
  else log(game, 'Showdown — host declares the winner');
}

// Order winners starting left of the button (who gets odd chips).
function oddChipOrder(hand, ids) {
  const n = hand.seats.length;
  const bIdx = hand.seats.findIndex((s) => s.id === hand.buttonId);
  const order = [];
  for (let k = 1; k <= n; k++) order.push(hand.seats[(bIdx + k) % n].id);
  return order.filter((id) => ids.includes(id));
}

function distribute(game, pots) {
  const hand = game.hand;
  const winnings = {};
  for (const pot of pots) {
    const ws = oddChipOrder(hand, pot.winners);
    const share = Math.floor(pot.amount / ws.length);
    let rem = pot.amount - share * ws.length;
    for (const id of ws) {
      const amt = share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      winnings[id] = (winnings[id] || 0) + amt;
    }
  }
  for (const [id, amt] of Object.entries(winnings)) {
    const p = playerOf(game, id);
    if (p) p.chips += amt;
  }
  return winnings;
}

function rabbit(game) {
  const hand = game.hand;
  if (game.cardMode !== 'digital' || !game.rules.rabbitHunt || hand.board.length >= 5) return [];
  const deck = [...hand.deck];
  const out = [];
  let street = hand.street;
  while (hand.board.length + out.length < 5) {
    deck.pop();
    const n = street === 'preflop' ? 3 : 1;
    for (let i = 0; i < n; i++) out.push(deck.pop());
    street = STREETS[STREETS.indexOf(street) + 1];
  }
  return out;
}

function finishUncontested(game) {
  const hand = game.hand;
  refundUncalled(game);
  const winner = hand.seats.find((s) => !s.folded);
  const amount = potTotal(hand);
  const pots = [{ amount, eligible: [winner.id], winners: [winner.id] }];
  const winnings = distribute(game, pots);
  log(game, `${winner.name} wins ${amount} uncontested`);
  hand.rabbit = rabbit(game);
  completeHand(game, { pots, winnings, showdown: null, uncontested: true });
}

function showdown(game) {
  const hand = game.hand;
  refundUncalled(game);
  const pots = computePots(hand);
  const evals = {};
  for (const s of hand.seats) if (!s.folded) evals[s.id] = evaluate([...hand.hole[s.id], ...hand.board]);
  for (const pot of pots) {
    let best = null;
    for (const id of pot.eligible) {
      if (!best || compareScores(evals[id].score, best) > 0) best = evals[id].score;
    }
    pot.winners = pot.eligible.filter((id) => compareScores(evals[id].score, best) === 0);
    pot.handName = evals[pot.winners[0]].name;
  }
  const winnings = distribute(game, pots);
  const shown = {};
  for (const [id, e] of Object.entries(evals)) shown[id] = { cards: hand.hole[id], best: e.cards, name: e.name };
  pots.forEach((pot, i) => {
    const label = pots.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : 'Pot';
    log(game, `${label} (${pot.amount}): ${pot.winners.map((id) => nameOf(game, id)).join(' & ')} — ${pot.handName}`);
  });
  completeHand(game, { pots, winnings, showdown: shown, uncontested: false });
}

// Physical mode: host assigns winner(s) for each pot. winnersByPot: array of id arrays.
export function declareWinners(game, winnersByPot) {
  const hand = game.hand;
  if (!handActive(game) || hand.phase !== 'awaitingWinner') fail('There is no hand waiting for a winner');
  const pots = computePots(hand);
  if (!Array.isArray(winnersByPot) || winnersByPot.length !== pots.length) fail('Choose winner(s) for every pot');
  pots.forEach((pot, i) => {
    const ws = [...new Set(winnersByPot[i] || [])];
    if (!ws.length) fail(`Choose at least one winner for ${i === 0 ? 'the main pot' : 'side pot ' + i}`);
    for (const id of ws) if (!pot.eligible.includes(id)) fail('A chosen winner is not eligible for that pot');
    pot.winners = ws;
  });
  const winnings = distribute(game, pots);
  pots.forEach((pot, i) => {
    const label = pots.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : 'Pot';
    log(game, `${label} (${pot.amount}): ${pot.winners.map((id) => nameOf(game, id)).join(' & ')}`);
  });
  completeHand(game, { pots, winnings, showdown: null, uncontested: false });
}

function completeHand(game, result) {
  const hand = game.hand;
  hand.phase = 'complete';
  hand.toActId = null;
  hand.turnDeadline = null;
  hand.result = result;
  for (const s of hand.seats) { s.committed = 0; }
  for (const p of game.players) if (p.chips === 0 && !p.busted) {
    p.busted = true;
    log(game, `${p.name} is out of chips`);
  }
}

export function rebuy(game, playerId) {
  const p = playerOf(game, playerId);
  if (!p) fail('Player not found');
  if (!game.rules.allowRebuys) fail('Rebuys are turned off at this table');
  if (!p.busted) fail('You still have chips');
  if (handActive(game) && game.hand.seats.some((s) => s.id === playerId && !s.folded)) fail('Wait for this hand to finish');
  p.chips = game.rules.startingStack;
  p.busted = false;
  p.rebuys += 1;
  p.buyIn = (p.buyIn ?? 0) + game.rules.startingStack;
}

export { STREETS };
