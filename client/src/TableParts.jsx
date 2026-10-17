import { useEffect, useState } from 'react';
import { Card, CardBack } from './Card.jsx';
import { serverNow } from './socket.js';
import { ChipStack } from './Chips.jsx';
import { useDeal, holeDelay, boardDelay } from './Deal.jsx';

export const STREET_LABEL = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };
const STREETS = ['preflop', 'flop', 'turn', 'river'];
export const fmt = (n) => Number(n).toLocaleString();

export function useNow(active) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function TurnTimer({ hand, rules, paused }) {
  const active = !!hand?.turnDeadline && !paused;
  const now = useNow(active);
  if (!rules.turnTimeSec || !hand || hand.phase !== 'betting') return null;
  const total = rules.turnTimeSec * 1000;
  const left = paused ? (hand.pausedRemainingMs ?? total) : Math.max(0, (hand.turnDeadline ?? now) - now);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div className={`timer ${left < 5000 ? 'low' : ''}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <div className="timer-fill" style={{ width: `${pct}%` }} />
      <span>{Math.ceil(left / 1000)}s</span>
    </div>
  );
}

export function Board({ game, size = 'md' }) {
  const hand = game.hand;
  const { info } = useDeal();
  if (game.cardMode === 'physical') {
    const idx = hand ? STREETS.indexOf(hand.street) : -1;
    return (
      <ol className={`street-track ${size}`} aria-label="Street">
        {STREETS.map((s, i) => (
          <li key={s} className={i < idx ? 'past' : i === idx ? 'now' : ''} aria-current={i === idx ? 'step' : undefined}>
            {STREET_LABEL[s]}
          </li>
        ))}
      </ol>
    );
  }
  const board = hand?.board ?? [];
  const rabbit = hand?.rabbit ?? [];
  const winningCards = new Set();
  if (hand?.phase === 'complete') {
    for (const p of game.players) if (p.won && p.bestCards) p.bestCards.forEach((c) => winningCards.add(c));
  }
  const slots = [];
  for (let i = 0; i < 5; i++) {
    if (board[i]) slots.push(<Card key={i} card={board[i]} size={size} highlight={winningCards.has(board[i])}
      deal={i >= info.boardFrom ? { token: info.token, delay: boardDelay(info, i) } : undefined} />);
    else if (rabbit[i - board.length]) slots.push(<Card key={i} card={rabbit[i - board.length]} size={size} dim />);
    else slots.push(<Card key={i} card={null} size={size} />);
  }
  return (
    <div className="board" aria-label="Community cards">
      {slots}
      {rabbit.length > 0 && <span className="rabbit-note">Faded cards: rabbit hunt</span>}
    </div>
  );
}

export function Pots({ hand }) {
  if (!hand) return null;
  const pots = hand.pots;
  return (
    <div className="pot" data-pot>
      <ChipStack amount={hand.pot} size="md" show={6} className="pot-chips" />
      <span className="pot-label">Pot</span>
      <span key={hand.pot} className="pot-amount">{fmt(hand.pot)}</span>
      {pots && pots.length > 1 && (
        <span className="pot-split">
          {pots.map((p, i) => `${i === 0 ? 'Main' : 'Side ' + i} ${fmt(p.amount)}`).join(' / ')}
        </span>
      )}
    </div>
  );
}

export function PlayerRow({ p, game, size = 'md' }) {
  const hand = game.hand;
  const { info } = useDeal();
  const turn = hand?.toActId === p.id;
  const isMe = game.me?.id === p.id;
  const complete = hand?.phase === 'complete';
  let status = null;
  if (p.busted) status = 'Out of chips';
  else if (!p.inHand && p.sittingOut) status = 'Sitting out';
  else if (!p.inHand && game.status === 'playing' && hand) status = 'Next hand';
  else if (p.folded) status = 'Folded';
  else if (p.allIn) status = 'All-in';

  return (
    <li data-seat={p.id} className={`seat ${turn ? 'turn' : ''} ${isMe ? 'me' : ''} ${p.folded || p.busted ? 'faded' : ''} ${p.won ? 'won' : ''} seat-${size}`}>
      <div className="seat-main">
        <div className="seat-name">
          <span className={`dot ${p.connected ? 'on' : ''}`} title={p.connected ? 'Connected' : 'Not connected'} />
          <span className="name-text">{p.name}</span>
          {hand?.buttonId === p.id && <span className="pos pos-d" title="Dealer button">D</span>}
          {hand?.sbId === p.id && <span className="pos" title="Small blind">SB</span>}
          {hand?.bbId === p.id && <span className="pos" title="Big blind">BB</span>}
          {isMe && <em className="tag">you</em>}
        </div>
        <div className="seat-sub">
          <span className="stack-num">{fmt(p.chips)}</span>
          {status && <span className="seat-status">{status}</span>}
          {complete && p.handName && <span className="seat-status hand-name">{p.handName}</span>}
        </div>
        {p.chips > 0 && <ChipStack amount={p.chips} size="xs" show={4} className="seat-chips" />}
      </div>
      <div className="seat-side">
        {p.cards && !isMe && <span className="mini-cards">{p.cards.map((c) => <Card key={c} card={c} size="xs" />)}</span>}
        {!p.cards && p.hasCards && !complete && (
          <span className="mini-cards">
            {[0, 1].map((i) => <CardBack key={i} size="xs" deal={info.backsAnim && !isMe ? { token: info.token, delay: holeDelay(info, p.id, i) } : undefined} />)}
          </span>
        )}
        {p.committed > 0 && <span className="bet-chip" title="Bet this round"><ChipStack amount={p.committed} size="xs" show={3} />{fmt(p.committed)}</span>}
        {complete && p.won > 0 && <span className="won-chip">+{fmt(p.won)}</span>}
      </div>
    </li>
  );
}

export function statusLine(game) {
  const hand = game.hand;
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? 'Someone';
  if (game.status === 'ended') return 'Session ended';
  if (game.paused) return 'Paused by the host';
  if (!hand) return '';
  if (hand.phase === 'betting') return hand.toActId === game.me?.id ? 'Your turn' : `${name(hand.toActId)} to act`;
  if (hand.phase === 'awaitingStreet') {
    const next = { preflop: 'flop', flop: 'turn', turn: 'river' }[hand.street];
    return game.isHost ? `Deal the ${next}, then tap “Deal ${next}”` : `Waiting for the ${next}`;
  }
  if (hand.phase === 'awaitingWinner') return game.isHost ? 'Choose who won' : 'Host is choosing the winner';
  if (hand.phase === 'complete') {
    if (hand.uncontested) {
      const w = game.players.find((p) => p.won > 0);
      return w ? `${w.name} wins ${fmt(w.won)}` : 'Hand over';
    }
    const ws = game.players.filter((p) => p.won > 0);
    if (!ws.length) return 'Hand over';
    return ws.map((p) => `${p.name} +${fmt(p.won)}`).join(', ');
  }
  return '';
}
