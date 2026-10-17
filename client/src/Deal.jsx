import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dealSwish } from './alerts.js';

// Card dealing: a deck sits on the felt, and every card that appears is "thrown" from it as a face-down
// clone that slides to its seat (or slot) and turns over. The real card is hidden until the clone lands.

const IDLE = { token: 0, holeAnim: false, backsAnim: false, boardFrom: Infinity, order: {}, count: 0 };
const Ctx = createContext({ info: IDLE, launch: () => {}, pulse: 0 });
export const useDeal = () => useContext(Ctx);

const FLY_MS = 620;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const seenKey = (code) => `holdem:dealt:${code}`;
const readSeen = (code) => { try { return JSON.parse(sessionStorage.getItem(seenKey(code))); } catch { return null; } };
const writeSeen = (code, v) => { try { sessionStorage.setItem(seenKey(code), JSON.stringify(v)); } catch { /* ignore */ } };

// Delay for hole card `i` (0 or 1) of a player, dealing one card to each seat per round.
export function holeDelay(info, playerId, i) {
  const n = Math.max(1, info.count);
  const step = Math.min(0.14, 1.8 / (2 * n));
  return 0.15 + (i * n + (info.order[playerId] ?? 0)) * step;
}
export const boardDelay = (info, index) => 0.1 + (index - info.boardFrom) * 0.22;

function Flier({ f, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.animate) return onDone(f.id);
    const t = (a, extra = '') => `perspective(700px) translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px)) ${extra}`;
    const frames = [
      { transform: t(f.d, `rotate(${f.rot}deg) scale(.5)`), opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: t({ x: 0, y: 0 }, 'rotate(0deg) scale(1.06)'), opacity: 1, offset: f.flip ? 0.82 : 0.9 },
      { transform: t({ x: 0, y: 0 }, f.flip ? 'rotateY(90deg) scale(1)' : 'scale(1)'), opacity: f.flip ? 1 : 0.9, offset: 1 },
    ];
    const anim = el.animate(frames, { duration: FLY_MS, delay: f.delay * 1000, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
    anim.onfinish = () => onDone(f.id);
    return () => anim.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className="card card-back fly-card"
      style={{ left: f.to.x, top: f.to.y, width: f.size.w, height: f.size.h }} />
  );
}

export function DealProvider({ game, children }) {
  const [info, setInfo] = useState(IDLE);
  const [flights, setFlights] = useState([]);
  const [pulse, setPulse] = useState(0);
  const seq = useRef(0);
  const clear = useRef(null);

  useEffect(() => {
    const hand = game.hand;
    if (game.cardMode !== 'digital' || !hand || reduced()) return;
    const me = game.players.find((p) => p.id === game.me?.id);
    const hole = !!me?.cards;
    const backs = game.players.some((p) => p.hasCards && !p.cards && p.id !== game.me?.id);
    const board = hand.board?.length ?? 0;

    const seen = readSeen(game.code);
    const prev = seen && seen.hand === hand.number ? seen : { hole: false, backs: false, board: 0 };
    writeSeen(game.code, { hand: hand.number, hole, backs, board });

    const holeAnim = hole && !prev.hole;
    const backsAnim = backs && !prev.backs;
    const boardFrom = board > prev.board ? prev.board : Infinity;
    if (!holeAnim && !backsAnim && boardFrom === Infinity) return;

    const dealt = game.players.filter((p) => p.hasCards || p.cards);
    const order = Object.fromEntries(dealt.map((p, i) => [p.id, i]));
    setInfo({ token: ++seq.current, holeAnim, backsAnim, boardFrom, order, count: dealt.length });
    setPulse((n) => n + 1);
    clearTimeout(clear.current);
    clear.current = setTimeout(() => setInfo(IDLE), 6000);
  }, [game]);
  useEffect(() => () => clearTimeout(clear.current), []);

  const launch = useCallback((rect, delay, flip) => {
    const deck = document.querySelector('[data-deck]');
    const a = deck?.getBoundingClientRect();
    const from = a ? { x: a.left + a.width / 2, y: a.top + a.height / 2 } : { x: window.innerWidth / 2, y: -40 };
    const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setFlights((fs) => [...fs, {
      id: ++seq.current, to, size: { w: rect.width, h: rect.height }, d: { x: from.x - to.x, y: from.y - to.y },
      rot: (Math.random() - 0.5) * 50, delay, flip,
    }]);
    setTimeout(() => dealSwish(), delay * 1000);
  }, []);

  const done = useCallback((id) => setFlights((fs) => fs.filter((f) => f.id !== id)), []);
  return (
    <Ctx.Provider value={{ info, launch, pulse }}>
      {children}
      <div className="flight-layer deal-layer" aria-hidden="true">
        {flights.map((f) => <Flier key={f.id} f={f} onDone={done} />)}
      </div>
    </Ctx.Provider>
  );
}

// Fires the flying clone for a freshly dealt card. `deal` = { token, delay } or falsy.
export function useDealFlight(ref, deal, flip) {
  const { launch } = useDeal();
  useLayoutEffect(() => {
    if (!deal || !ref.current) return;
    launch(ref.current.getBoundingClientRect(), deal.delay, flip);
  }, [deal?.token]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The deck on the felt.
export function Deck() {
  const { pulse } = useDeal();
  return (
    <span className="deck" data-deck aria-hidden="true">
      <span className="card card-sm card-back" />
      <span className="card card-sm card-back" />
      <span key={pulse} className="card card-sm card-back deck-top" />
    </span>
  );
}
