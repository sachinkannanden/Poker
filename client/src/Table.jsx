import { useEffect, useRef, useState } from 'react';
import { Card, ModeBadge } from './Card.jsx';
import { Board, Pots, PlayerRow, TurnTimer, statusLine, fmt, STREET_LABEL } from './TableParts.jsx';
import ActionBar from './ActionBar.jsx';
import HostPanel, { HostPrimary } from './HostPanel.jsx';
import { useAction } from './Lobby.jsx';
import { turnAlert, soundOn, setSoundOn } from './alerts.js';
import { ChipStack } from './Chips.jsx';
import ChipFlights from './Flights.jsx';
import { DealProvider, Deck, useDeal, holeDelay } from './Deal.jsx';
import HandGuide from './HandGuide.jsx';

export default function Table({ game, onLeave }) {
  return <DealProvider game={game}><TableInner game={game} onLeave={onLeave} /></DealProvider>;
}

function TableInner({ game, onLeave }) {
  const { run, error, busy, setError } = useAction();
  const [hostOpen, setHostOpen] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const [showLog, setShowLog] = useState(false);
  const hand = game.hand;
  const me = game.players.find((p) => p.id === game.me?.id);
  const myTurn = !!game.legal;

  // Chime + buzz when it becomes my turn.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) turnAlert();
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // Keep the scrollable content clear of the fixed action dock.
  const dockRef = useRef(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.setProperty('--dock-h', '0px'); };
  }, [game.status]);

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 4000); return () => clearTimeout(t); } }, [error, setError]);

  if (game.status === 'ended') return <Ended game={game} onLeave={onLeave} />;

  const others = game.players;
  const status = statusLine(game);

  return (
    <div className={`table-screen ${myTurn ? 'my-turn' : ''}`}>
      <ChipFlights game={game} />
      <header className="table-top">
        <div className="tt-left">
          <span className="table-name small-name">{game.name}</span>
          <ModeBadge mode={game.cardMode} />
        </div>
        <div className="tt-right">
          <HandGuide />
          <button className="icon-btn" aria-pressed={sound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
            onClick={() => { setSoundOn(!sound); setSound(!sound); }}>{sound ? '🔔' : '🔕'}</button>
          {game.isHost
            ? <button className="btn small host-btn" onClick={() => setHostOpen(true)}>Host</button>
            : <button className="btn text small" onClick={onLeave}>Leave</button>}
        </div>
      </header>

      {game.paused && <div className="paused-banner" role="status">Game paused by the host</div>}

      <section className="felt">
        {game.cardMode === 'digital' && <Deck />}
        <div className="felt-meta">
          <span>Hand {hand?.number ?? '—'}</span>
          {hand && <span>{game.cardMode === 'digital' ? STREET_LABEL[hand.street] : ''}</span>}
          {hand?.currentBet > 0 && hand.phase === 'betting' && <span>To call {fmt(hand.currentBet)}</span>}
        </div>
        <Board game={game} />
        <Pots hand={hand} />
        <p className={`status-line ${myTurn ? 'mine' : ''}`} aria-live="polite">{status}</p>
        <TurnTimer hand={hand} rules={game.rules} paused={game.paused} />
      </section>

      <ul className="seats" aria-label="Players">
        {others.map((p) => <PlayerRow key={p.id} p={p} game={game} />)}
      </ul>

      <button className="btn text small log-toggle" onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>
        {showLog ? 'Hide this hand’s actions' : 'Show this hand’s actions'}
      </button>
      {showLog && hand && (
        <ol className="hand-log">{hand.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      )}

      <div className="dock" ref={dockRef}>
        {error && <p className="error toast" role="alert">{error}</p>}
        {game.isHost && <div className="host-primary"><HostPrimary key={hand?.number} game={game} run={run} busy={busy} /></div>}
        {me && <MyArea game={game} me={me} run={run} busy={busy} />}
      </div>

      {hostOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setHostOpen(false)}>
          <HostPanel game={game} run={run} busy={busy} onClose={() => setHostOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MyArea({ game, me, run, busy }) {
  const hand = game.hand;
  const { info } = useDeal();
  const inHand = me.inHand;
  const cards = me.cards;
  const complete = hand?.phase === 'complete';

  let note = null;
  if (me.busted) note = null;
  else if (!inHand && me.sittingOut) note = 'You’re sitting out. You won’t be dealt in until you come back.';
  else if (!inHand) note = 'You’ll be dealt in next hand.';
  else if (me.folded && !complete) note = 'You folded this hand.';
  else if (me.allIn && !complete) note = 'You’re all-in.';
  else if (!game.legal && hand?.phase === 'betting') note = null;

  return (
    <div className="my-area">
      {game.cardMode === 'digital' && inHand && cards && (
        <div className={`my-cards ${me.folded ? 'folded' : ''}`}>
          {cards.map((c, i) => <Card key={c} card={c} size="lg" highlight={complete && me.won > 0 && me.bestCards?.includes(c)}
            deal={info.holeAnim ? { token: info.token, delay: holeDelay(info, me.id, i) } : undefined} />)}
          <div className="my-stack" data-my-stack>
            <span className="field-label">Your stack</span>
            <span className="big-num">{fmt(me.chips)}</span>
            <ChipStack amount={me.chips} size="xs" show={4} />
            {complete && me.handName && <span className="muted small">{me.handName}</span>}
          </div>
        </div>
      )}
      {(game.cardMode === 'physical' || !inHand || !cards) && !me.busted && (
        <div className="my-stack-line" data-my-stack>
          <span className="field-label">Your stack</span> <ChipStack amount={me.chips} size="xs" show={4} /> <span className="big-num">{fmt(me.chips)}</span>
        </div>
      )}

      {me.busted && (
        <div className="busted">
          <p>You’re out of chips{game.rules.allowRebuys ? '.' : ' and watching the rest of the game.'}</p>
          {game.rules.allowRebuys && (
            <button className="btn primary" disabled={busy || (inHand && !complete)} onClick={() => run('rebuy')}>
              Rebuy for {fmt(game.rules.startingStack)}
            </button>
          )}
        </div>
      )}

      {note && <p className="muted small center">{note}</p>}
      {game.legal && <ActionBar legal={game.legal} game={game} run={run} busy={busy} />}

      {!me.busted && game.status === 'playing' && (
        <label className="sit-out">
          <input type="checkbox" checked={me.sittingOut} onChange={(e) => run('sitOut', { value: e.target.checked })} />
          Sit out {inHand && !complete ? 'from next hand' : ''}
        </label>
      )}
    </div>
  );
}

function Ended({ game, onLeave }) {
  const rows = [...game.players].sort((a, b) => (b.chips - b.buyIn) - (a.chips - a.buyIn));
  return (
    <main className="page">
      <header className="top">
        <div>
          <h2 className="table-name">{game.name}</h2>
          <ModeBadge mode={game.cardMode} />
        </div>
      </header>
      <section className="panel">
        <h3>Final chip counts</h3>
        <p className="muted small">After {game.handNumber} hand{game.handNumber === 1 ? '' : 's'}. Bought in includes rebuys.</p>
        <table className="standings">
          <thead><tr><th>Player</th><th>Chips</th><th>Bought in</th><th>Net</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const net = p.chips - p.buyIn;
              return (
                <tr key={p.id}>
                  <td>{p.name}{p.rebuys ? <span className="muted small"> ({p.rebuys} rebuy{p.rebuys > 1 ? 's' : ''})</span> : null}</td>
                  <td>{fmt(p.chips)}</td>
                  <td>{fmt(p.buyIn)}</td>
                  <td className={net > 0 ? 'pos-net' : net < 0 ? 'neg-net' : ''}>{net > 0 ? '+' : ''}{fmt(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <button className="btn primary big" onClick={onLeave}>Back to start</button>
    </main>
  );
}
