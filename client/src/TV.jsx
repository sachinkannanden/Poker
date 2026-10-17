import { useEffect, useState } from 'react';
import { socket, call, useGameState, useConnected } from './socket.js';
import { ModeBadge } from './Card.jsx';
import { Board, Pots, PlayerRow, TurnTimer, statusLine, STREET_LABEL } from './TableParts.jsx';
import { QR, joinUrl } from './JoinInfo.jsx';
import { rulesSummary } from './RulesForm.jsx';
import ChipFlights from './Flights.jsx';
import { DealProvider, Deck } from './Deal.jsx';

// Shared-screen view for a TV or laptop: no private cards, big type, join QR always visible.
export default function TV({ code }) {
  const game = useGameState();
  return game && game.code === code ? <DealProvider game={game}><TVInner code={code} /></DealProvider> : <TVInner code={code} />;
}

function TVInner({ code }) {
  const game = useGameState();
  const connected = useConnected();
  const [error, setError] = useState(null);

  useEffect(() => {
    const attach = () => call('attach', { code, tv: true }).then(() => setError(null)).catch((e) => setError(e.message));
    socket.on('connect', attach);
    if (socket.connected) attach();
    return () => socket.off('connect', attach);
  }, [code]);

  if (error) return <div className="center-msg">{error}</div>;
  if (!game || game.code !== code) return <div className="center-msg">Connecting to table {code}…</div>;

  const hand = game.hand;
  return (
    <div className="tv">
      <ChipFlights game={game} />
      {!connected && <div className="offline-bar">Reconnecting…</div>}
      <header className="tv-top">
        <div>
          <h1>{game.name}</h1>
          <ModeBadge mode={game.cardMode} />
        </div>
        <div className="tv-join">
          <QR text={joinUrl(code)} size={120} />
          <div>
            <span className="field-label">Join with code</span>
            <span className="join-code">{code}</span>
          </div>
        </div>
      </header>

      {game.status === 'lobby' ? (
        <main className="tv-lobby">
          <h2>Waiting for the host to start</h2>
          <ul className="tv-names">{game.players.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
          <ul className="rule-chips">{rulesSummary(game.rules).map((r) => <li key={r}>{r}</li>)}</ul>
        </main>
      ) : (
        <main className="tv-main">
          <section className="felt tv-felt">
            {game.cardMode === 'digital' && <Deck />}
            <div className="felt-meta">
              <span>Hand {hand?.number ?? '—'}</span>
              {hand && <span>{STREET_LABEL[hand.street]}</span>}
            </div>
            <Board game={game} size="xl" />
            <Pots hand={hand} />
            <p className="status-line">{game.paused ? 'Paused' : statusLine({ ...game, isHost: false })}</p>
            <TurnTimer hand={hand} rules={game.rules} paused={game.paused} />
          </section>
          <ul className="seats tv-seats">
            {game.players.map((p) => <PlayerRow key={p.id} p={p} game={game} size="lg" />)}
          </ul>
        </main>
      )}
    </div>
  );
}
