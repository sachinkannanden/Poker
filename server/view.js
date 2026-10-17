// Builds the per-device view of a game. Hole cards are only ever included for the
// viewer's own seat, or for every live hand once a digital showdown has happened.
import { legalActions, computePots, potTotal } from './engine.js';

export function buildView(game, viewer, connectedIds) {
  const hand = game.hand;
  const me = viewer.playerId ? game.players.find((p) => p.id === viewer.playerId) : null;
  const complete = hand?.phase === 'complete';
  const showdown = complete ? hand.result?.showdown : null;

  const players = game.players.map((p) => {
    const seat = hand?.seats.find((s) => s.id === p.id);
    let cards = null;
    if (game.cardMode === 'digital' && seat && hand.hole[p.id]) {
      if (p.id === viewer.playerId) cards = hand.hole[p.id];
      else if (showdown?.[p.id]) cards = showdown[p.id].cards;
    }
    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      rebuys: p.rebuys,
      buyIn: p.buyIn ?? 0,
      sittingOut: p.sittingOut,
      busted: p.busted,
      isHost: p.id === game.hostPlayerId,
      connected: connectedIds.has(p.id),
      inHand: !!seat,
      folded: seat?.folded ?? false,
      allIn: seat?.allIn ?? false,
      committed: seat && !complete ? seat.committed : 0,
      handTotal: seat?.total ?? 0,
      cards,
      hasCards: !!seat && !seat.folded && game.cardMode === 'digital',
      handName: showdown?.[p.id]?.name ?? null,
      bestCards: showdown?.[p.id]?.best ?? null,
      won: complete ? hand.result?.winnings?.[p.id] ?? 0 : 0,
    };
  });

  // Seats that were in the hand but have since been removed (kicked) still matter for display of the log only.
  let handView = null;
  if (hand) {
    const pots = hand.phase === 'complete' ? hand.result.pots
      : hand.phase === 'awaitingWinner' ? computePots(hand) : null;
    handView = {
      number: hand.number,
      phase: hand.phase,
      street: hand.street,
      board: game.cardMode === 'digital' ? hand.board : [],
      rabbit: complete ? hand.rabbit : [],
      pot: complete ? hand.result.pots.reduce((a, p) => a + p.amount, 0) : potTotal(hand),
      pots: pots?.map((p) => ({ amount: p.amount, eligible: p.eligible, winners: p.winners ?? null, handName: p.handName ?? null })) ?? null,
      currentBet: hand.currentBet,
      toActId: hand.toActId,
      turnDeadline: hand.turnDeadline,
      pausedRemainingMs: game.pausedRemainingMs ?? null,
      buttonId: hand.buttonId,
      sbId: hand.sbId,
      bbId: hand.bbId,
      log: hand.log.slice(-30),
      uncontested: complete ? hand.result.uncontested : false,
    };
  }

  return {
    code: game.code,
    name: game.name,
    cardMode: game.cardMode,
    hostPlays: game.hostPlays,
    status: game.status,
    paused: game.paused,
    rules: game.rules,
    handNumber: game.handNumber,
    buttonId: game.buttonId,
    players,
    hand: handView,
    me: me ? { id: me.id } : null,
    isHost: !!viewer.isHost,
    isTV: !!viewer.isTV,
    legal: me ? legalActions(game, me.id) : null,
    serverNow: Date.now(),
  };
}
