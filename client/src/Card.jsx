// Four-colour deck: suits are told apart by colour as well as shape, which is easier
// to read on a small screen held at arm's length.
const SUIT = {
  s: { sym: '♠', name: 'spades', cls: 'suit-s' },
  h: { sym: '♥', name: 'hearts', cls: 'suit-h' },
  d: { sym: '♦', name: 'diamonds', cls: 'suit-d' },
  c: { sym: '♣', name: 'clubs', cls: 'suit-c' },
};
import { useRef } from 'react';
import { useDealFlight } from './Deal.jsx';

const RANK_NAME = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const RANK_WORD = { T: 'ten', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };

// deal = { token, delay } while this card is being dealt: it stays hidden until a face-down clone lands.
export function Card({ card, size = 'md', dim, highlight, deal }) {
  const ref = useRef(null);
  useDealFlight(ref, card && deal, true);
  if (!card) return <span ref={ref} className={`card card-${size} card-empty`} aria-hidden="true" />;
  const r = card[0];
  const s = SUIT[card[1]];
  return (
    <span ref={ref} className={`card card-${size} ${s.cls} ${dim ? 'dim' : ''} ${highlight ? 'hl' : ''} ${deal ? 'dealt' : ''}`}
      style={deal ? { '--delay': `${deal.delay + 0.52}s` } : undefined}
      role="img" aria-label={`${RANK_WORD[r] || r} of ${s.name}`}>
      <span className="card-idx tl"><span className="card-rank">{RANK_NAME[r] || r}</span><span className="card-suit">{s.sym}</span></span>
      <span className="card-pip">{s.sym}</span>
      <span className="card-idx br"><span className="card-rank">{RANK_NAME[r] || r}</span><span className="card-suit">{s.sym}</span></span>
    </span>
  );
}

export function CardBack({ size = 'sm', deal }) {
  const ref = useRef(null);
  useDealFlight(ref, deal, false);
  return <span ref={ref} className={`card card-${size} card-back ${deal ? 'dealt-back' : ''}`}
    style={deal ? { '--delay': `${deal.delay + 0.5}s` } : undefined} aria-hidden="true" />;
}

export function ModeBadge({ mode }) {
  return (
    <span className={`mode-badge ${mode}`} title="Card mode is locked for this session">
      {mode === 'digital' ? <PhoneIcon /> : <CardsIcon />}
      <span className="mb-text">{mode === 'digital' ? 'Digital cards' : 'Physical cards'}</span>
    </span>
  );
}

export function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}
export function CardsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="11" height="16" rx="2" transform="rotate(-10 8 13)" /><rect x="10" y="3" width="11" height="16" rx="2" />
    </svg>
  );
}
