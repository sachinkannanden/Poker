import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card.jsx';

// cards: the five that make the hand; `dim` marks cards in the example that don't count.
const HANDS = [
  { name: 'Royal flush', cards: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'], text: 'Ace-high straight, all one suit. The best hand there is.' },
  { name: 'Straight flush', cards: ['9s', '8s', '7s', '6s', '5s'], text: 'Five cards in a row, all one suit.' },
  { name: 'Four of a kind', cards: ['8h', '8d', '8s', '8c', 'Kd'], dim: [4], text: 'Four cards of the same rank. The fifth card only breaks ties.' },
  { name: 'Full house', cards: ['Qs', 'Qh', 'Qd', '7c', '7s'], text: 'Three of a kind plus a pair. Ties go to the higher three.' },
  { name: 'Flush', cards: ['As', '9s', '7s', '4s', '2s'], text: 'Any five cards of one suit, not in a row. Highest card wins ties.' },
  { name: 'Straight', cards: ['9h', '8s', '7d', '6c', '5h'], text: 'Five cards in a row, mixed suits. An ace can be high (A-K-Q-J-10) or low (A-2-3-4-5).' },
  { name: 'Three of a kind', cards: ['7s', '7h', '7d', 'Kc', '2s'], dim: [3, 4], text: 'Three cards of the same rank.' },
  { name: 'Two pair', cards: ['Js', 'Jh', '4d', '4c', 'As'], dim: [4], text: 'Two different pairs. The higher pair decides ties.' },
  { name: 'One pair', cards: ['Ah', 'Ad', '9d', '6c', '3s'], dim: [2, 3, 4], text: 'Two cards of the same rank.' },
  { name: 'High card', cards: ['As', 'Jh', '8d', '5c', '3s'], text: 'Nothing above. The highest card plays, then the next, and so on.' },
];

function Sheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="overlay guide-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet guide" role="dialog" aria-label="Poker hand rankings">
        <div className="row between">
          <h3 className="guide-title">Hand rankings</h3>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        <p className="muted small">Best to worst. You make your hand from the best five of your two hole cards and the five on the board.</p>
        <ol className="guide-list">
          {HANDS.map((h, i) => (
            <li key={h.name}>
              <span className="guide-rank">{i + 1}</span>
              <div className="guide-body">
                <strong>{h.name}</strong>
                <div className="guide-cards">
                  {h.cards.map((c, j) => <Card key={c} card={c} size="sm" dim={h.dim?.includes(j)} />)}
                </div>
                <span className="muted small">{h.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="muted small">Same hand type? The higher cards win. If everything matches, the pot is split.</p>
      </div>
    </div>,
    document.body,
  );
}

export default function HandGuide({ label = 'Hands', className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn small guide-btn ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">♠</span> {label}
      </button>
      {open && <Sheet onClose={() => setOpen(false)} />}
    </>
  );
}
