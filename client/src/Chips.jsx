import { useEffect, useRef, useState } from 'react';
import { DENOMS, CHIP_STYLE, chipLabel, rack, value, exchangeOptions } from './chips.js';
import { chipClack, chipRattle } from './alerts.js';

const ASC = [...DENOMS].reverse();

export function Chip({ d, i = 0, className = '' }) {
  const [face, edge, ink] = CHIP_STYLE[d] ?? CHIP_STYLE[100000];
  return (
    <span className={`pchip ${className}`} style={{ '--face': face, '--edge': edge, '--ink': ink, '--i': i }}>
      <span className="pchip-label">{chipLabel(d)}</span>
    </span>
  );
}

// A vertical pile of n chips of one denomination (only the top `show` are drawn).
export function Pile({ d, n, show = 8, badge = false }) {
  const shown = Math.min(n, show);
  return (
    <span className="pile" style={{ '--n': shown }}>
      {Array.from({ length: shown }, (_, i) => (
        <Chip key={i} d={d} i={i} className={i === shown - 1 ? 'top' : ''} />
      ))}
      {badge && n > 1 && <span className="pile-count">×{n}</span>}
    </span>
  );
}

// Read-only assortment for an amount: seats, pot, bets.
export function ChipStack({ amount, size = 'sm', show = 6, className = '' }) {
  const counts = rack(amount);
  const ds = ASC.filter((d) => counts[d] > 0);
  if (!ds.length) return null;
  return (
    <span className={`chip-stack chips-${size} ${className}`} aria-hidden="true">
      {ds.map((d) => <Pile key={d} d={d} n={counts[d]} show={show} />)}
    </span>
  );
}

const ALLOWED = { tray: ['bet', 'bank'], bet: ['tray'], bank: ['tray', 'bet'] };
const TAP = { tray: 'bet', bet: 'tray', bank: 'tray' };
const ZONE_NAME = { tray: 'your chips', bet: 'your bet', bank: 'the cashier' };

// Bet mat, chip tray and cashier with click-or-drag chip movement.
// state = { tray, bet, bank } (counts by denomination). onMove(d, from, to); onExchange(counts).
export function ChipBoard({ state, canTake, onMove, onExchange, disabled, betNote, betValue }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [landed, setLanded] = useState(null); // { zone, d, nonce } drives the landing animation
  const dragRef = useRef(null);
  dragRef.current = drag;
  const nonce = useRef(0);

  const doMove = (d, from, to) => {
    onMove(d, from, to);
    setLanded({ zone: to, d, nonce: ++nonce.current });
    chipClack();
  };

  const start = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.target.closest('[data-pile]');
    if (!el) return;
    const d = Number(el.dataset.pile);
    const from = el.dataset.zone;
    if (from === 'tray' && !canTake(d)) return;
    e.preventDefault();
    setDrag({ d, from, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, tilt: 0, moved: false });
  };

  const active = !!drag;
  useEffect(() => {
    if (!active) return;
    const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-zone-drop]')?.dataset.zoneDrop ?? null;
    const move = (e) => {
      setDrag((s) => s && ({
        ...s, x: e.clientX, y: e.clientY,
        tilt: Math.max(-28, Math.min(28, (e.clientX - s.x) * 2.2)),
        moved: s.moved || Math.hypot(e.clientX - s.sx, e.clientY - s.sy) > 8,
      }));
      setOver(zoneAt(e.clientX, e.clientY));
    };
    const up = (e) => {
      const s = dragRef.current;
      setDrag(null); setOver(null);
      if (!s) return;
      if (!s.moved) return doMove(s.d, s.from, TAP[s.from]);
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone && ALLOWED[s.from].includes(zone)) doMove(s.d, s.from, zone);
    };
    const cancel = () => { setDrag(null); setOver(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [active, onMove]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (d, from) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (from === 'tray' && !canTake(d)) return;
      doMove(d, from, TAP[from]);
    }
  };

  const piles = (name) => {
    const counts = state[name];
    return ASC.filter((d) => counts[d] > 0).map((d) => {
      const n = counts[d] - (drag?.moved && drag.from === name && drag.d === d ? 1 : 0);
      if (n <= 0) return null;
      const fresh = landed && landed.zone === name && (landed.d === d || landed.d === 'all');
      return (
        <span key={`${d}-${fresh ? landed.nonce : 0}`} className={`pile-btn ${fresh ? 'fresh' : ''}`} data-pile={d} data-zone={name} role="button"
          tabIndex={disabled ? -1 : 0} onKeyDown={key(d, name)}
          aria-label={`${chipLabel(d)} chip, ${n} in ${ZONE_NAME[name]}. ${name === 'tray' ? 'Add to your bet' : 'Move back'}`}>
          <Pile d={d} n={n} show={9} badge />
        </span>
      );
    });
  };

  const has = (name) => Object.values(state[name]).some((n) => n > 0);
  const dragging = !!drag?.moved;
  const zoneCls = (name) => {
    if (!dragging || !ALLOWED[drag.from].includes(name)) return '';
    return over === name ? 'armed hot' : 'armed';
  };
  const ripple = (name) => landed && landed.zone === name && <span key={landed.nonce} className="ripple" aria-hidden="true" />;
  const options = exchangeOptions(state.bank);

  return (
    <div className={`chipboard ${dragging ? 'dragging' : ''} ${disabled ? 'is-disabled' : ''}`} onPointerDown={start}>
      <div className={`betmat ${zoneCls('bet')}`} data-zone-drop="bet">
        <div className="mat-head">
          <span className="mat-label">Your bet</span>
          {betValue != null && <span key={betValue} className="mat-total">{betValue.toLocaleString()}</span>}
        </div>
        <div className="mat-piles">
          {has('bet') ? piles('bet') : <span className="mat-hint">Drag chips here, or tap them</span>}
        </div>
        {betNote && <span className="mat-note">{betNote}</span>}
        {ripple('bet')}
      </div>
      <div className="tray-row">
        <div className={`tray ${zoneCls('tray')}`} data-zone-drop="tray">
          <span className="mat-label">Your chips</span>
          <div className="mat-piles">{has('tray') ? piles('tray') : <span className="mat-hint">All in</span>}</div>
          {ripple('tray')}
        </div>
        <div className={`bank ${zoneCls('bank')}`} data-zone-drop="bank">
          <span className="mat-label">Cashier</span>
          {has('bank') ? (
            <>
              <div className="mat-piles bank-piles">{piles('bank')}</div>
              <span className="bank-sum">{value(state.bank).toLocaleString()} to change</span>
              <div className="xchg-list">
                {options.map((o) => (
                  <button key={o.key} type="button" className="xchg"
                    onClick={() => { chipRattle(4); onExchange(o.counts); setLanded({ zone: 'tray', d: 'all', nonce: ++nonce.current }); }}>
                    {o.label}
                  </button>
                ))}
                {!options.length && <span className="mat-hint">Nothing to swap for</span>}
              </div>
            </>
          ) : <span className="mat-hint bank-hint">Drop a chip here to swap it for other chips</span>}
          {ripple('bank')}
        </div>
      </div>
      {dragging && (
        <span className="ghost-chip" style={{ left: drag.x, top: drag.y, '--tilt': `${drag.tilt}deg` }} aria-hidden="true"><Chip d={drag.d} /></span>
      )}
    </div>
  );
}
