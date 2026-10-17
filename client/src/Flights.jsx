import { useEffect, useRef, useState } from 'react';
import { ChipStack } from './Chips.jsx';
import { chipRattle } from './alerts.js';

const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Flight({ f, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.animate) return onDone(f.id);
    const dx = f.to.x - f.from.x;
    const dy = f.to.y - f.from.y;
    const lift = Math.min(70, Math.hypot(dx, dy) * 0.25);
    const anim = el.animate([
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(-6deg)', opacity: 1, offset: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.3) rotate(5deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.65) rotate(0deg)`, opacity: 0.1, offset: 1 },
    ], { duration: 780, delay: f.delay, easing: 'cubic-bezier(.3,.1,.25,1)', fill: 'both' });
    const t = setTimeout(() => f.sound && chipRattle(Math.min(6, 2 + Math.round(f.amount / 100))), f.delay + 560);
    anim.onfinish = () => onDone(f.id);
    return () => { clearTimeout(t); anim.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className="flight" style={{ left: f.from.x, top: f.from.y }}>
      <ChipStack amount={f.amount} size="sm" show={4} />
    </span>
  );
}

// Watches the game state and sends little stacks of chips from a player to the pot when they
// bet, and from the pot to the winner at the end of a hand.
export default function ChipFlights({ game }) {
  const [flights, setFlights] = useState([]);
  const prev = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const hand = game.hand;
    const cur = {
      hand: hand?.number,
      phase: hand?.phase,
      committed: Object.fromEntries(game.players.map((p) => [p.id, p.committed || 0])),
    };
    const before = prev.current;
    prev.current = cur;
    if (!before || !hand || reduced()) return;
    const potEl = document.querySelector('[data-pot]');
    if (!potEl) return;
    const pot = centre(potEl);
    const seatCentre = (id) => {
      const mine = id === game.me?.id && document.querySelector('[data-my-stack]');
      const el = mine || document.querySelector(`[data-seat="${id}"]`);
      return el ? centre(el) : null;
    };
    const out = [];
    let n = 0;
    for (const p of game.players) {
      const was = before.hand === cur.hand ? before.committed[p.id] || 0 : 0;
      const delta = (p.committed || 0) - was;
      const from = delta > 0 && seatCentre(p.id);
      if (from) out.push({ amount: delta, from, to: pot, delay: 0, sound: true });
    }
    if (cur.phase === 'complete' && before.phase !== 'complete' && before.hand === cur.hand) {
      for (const p of game.players) {
        const to = p.won > 0 && seatCentre(p.id);
        if (to) out.push({ amount: p.won, from: pot, to, delay: 500 + 160 * n++, sound: true });
      }
    }
    if (out.length) setFlights((fs) => [...fs, ...out.map((f) => ({ ...f, id: ++seq.current }))]);
  }, [game]);

  const done = (id) => setFlights((fs) => fs.filter((f) => f.id !== id));
  return <div className="flight-layer" aria-hidden="true">{flights.map((f) => <Flight key={f.id} f={f} onDone={done} />)}</div>;
}
