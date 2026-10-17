import { useCallback, useEffect, useState } from 'react';
import { fmt } from './TableParts.jsx';
import { ChipBoard } from './Chips.jsx';
import { applyExchange, canTake, moveChip, restage, stage, value } from './chips.js';

export default function ActionBar({ legal, game, run, busy }) {
  const hand = game.hand;
  const [amount, setAmount] = useState(legal.raise?.min ?? 0);
  const [sizing, setSizing] = useState(false);
  const [confirmFold, setConfirmFold] = useState(false);
  const stack = legal.stack;
  // Chips sitting in the player's tray and on the bet mat. The bet amount is what's on the mat.
  const [chips, setChips] = useState(() => stage(stack, (legal.raise?.min ?? 0) - legal.committed));
  const key = `${hand.number}-${hand.street}-${legal.currentBet}-${legal.committed}`;
  useEffect(() => {
    setAmount(legal.raise?.min ?? 0);
    setChips(stage(stack, (legal.raise?.min ?? 0) - legal.committed));
    setSizing(false); setConfirmFold(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTotal = (v) => {
    setAmount(v);
    if (Number.isFinite(v)) setChips((cur) => restage(cur, v - legal.committed));
  };
  const onMove = useCallback((d, from, to) => {
    const next = moveChip(chips, d, from, to);
    if (next === chips) return;
    setChips(next);
    setAmount(legal.committed + value(next.bet));
  }, [chips, legal.committed]);
  const onExchange = (counts) => setChips((cur) => applyExchange(cur, counts));

  const r = legal.raise;
  const fixed = r && r.min === r.max;
  const owe = legal.currentBet - legal.committed;
  const clamp = (v) => Math.max(r.min, Math.min(r.max, Math.round(v)));
  const presets = r && !fixed ? [
    ['Min', r.min],
    ['½ pot', clamp(legal.currentBet + (hand.pot + owe) / 2)],
    ['Pot', clamp(legal.currentBet + hand.pot + owe)],
    ['Max', r.max],
  ] : [];
  const verb = legal.kind === 'bet' ? 'Bet' : 'Raise to';
  const valid = r && Number.isInteger(amount) && amount >= r.min && amount <= r.max;

  const doFold = () => {
    if (legal.check && !confirmFold) return setConfirmFold(true);
    run('action', { type: 'fold' });
  };

  if (sizing && r) {
    return (
      <div className="action-bar sizing">
        <div className="size-head">
          <span className="field-label">{verb}</span>
          <input className="size-input" type="number" inputMode="numeric" min={r.min} max={r.max} value={amount}
            onChange={(e) => setTotal(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Total amount" />
        </div>
        <ChipBoard state={chips} canTake={(d) => canTake(chips.tray, d)} onMove={onMove} onExchange={onExchange} disabled={busy}
          betValue={value(chips.bet)}
          betNote={legal.committed > 0 ? `Plus ${fmt(legal.committed)} already in this round` : null} />
        <input type="range" min={r.min} max={r.max} step={1} value={valid ? amount : r.min}
          onChange={(e) => setTotal(Number(e.target.value))} aria-label="Bet size slider" />
        <div className="presets">
          {presets.map(([label, v]) => (
            <button key={label} type="button" className={`btn chip ${amount === v ? 'on' : ''}`} onClick={() => setTotal(v)}>{label}</button>
          ))}
        </div>
        <p className={`small ${amount !== '' && !valid ? 'error' : 'muted'}`}>{amount !== '' && !valid ? (amount < r.min ? 'Too small. ' : 'Too big. ') : ''}From {fmt(r.min)} to {fmt(r.max)}{r.max === legal.committed + legal.stack ? ' (all-in)' : ''}</p>
        <div className="row">
          <button className="btn ghost" onClick={() => setSizing(false)}>Back</button>
          <button className="btn primary grow" disabled={!valid || busy}
            onClick={() => run('action', { type: legal.kind, amount })}>
            {verb} {valid ? fmt(amount) : ''}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-bar">
      <div className="actions">
        <button className={`btn act fold ${confirmFold ? 'confirm' : ''}`} disabled={busy} onClick={doFold}>
          {confirmFold ? 'Fold anyway?' : 'Fold'}
        </button>
        {legal.check && <button className="btn act check" disabled={busy} onClick={() => run('action', { type: 'check' })}>Check</button>}
        {legal.call > 0 && (
          <button className="btn act call" disabled={busy} onClick={() => run('action', { type: 'call' })}>
            {legal.callIsAllIn ? `Call ${fmt(legal.call)} all-in` : `Call ${fmt(legal.call)}`}
          </button>
        )}
        {r && (fixed
          ? <button className="btn act raise" disabled={busy} onClick={() => run('action', { type: legal.kind, amount: r.min })}>{verb} {fmt(r.min)}</button>
          : <button className="btn act raise" disabled={busy} onClick={() => setSizing(true)}>{legal.kind === 'bet' ? 'Bet…' : 'Raise…'}</button>)}
        {legal.allIn != null && !(r && fixed && r.min === legal.allIn) && (
          <button className="btn act allin" disabled={busy} onClick={() => run('action', { type: 'allin' })}>All-in {fmt(legal.allIn)}</button>
        )}
      </div>
      {!r && legal.raiseLockedReason && <p className="muted small center">{legal.raiseLockedReason}</p>}
    </div>
  );
}
