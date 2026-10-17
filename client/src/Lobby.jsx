import { useState } from 'react';
import { call } from './socket.js';
import { ModeBadge } from './Card.jsx';
import JoinInfo from './JoinInfo.jsx';
import RulesForm, { rulesSummary } from './RulesForm.jsx';
import HandGuide from './HandGuide.jsx';

export function useAction() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (event, payload) => {
    setBusy(true); setError(null);
    try { await call(event, payload); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };
  return { run, error, busy, setError };
}

export function RulesEditor({ game, onDone }) {
  const [rules, setRules] = useState(game.rules);
  const { run, error, busy } = useAction();
  return (
    <div className="sheet">
      <h3>House rules</h3>
      <RulesForm rules={rules} onChange={setRules} cardMode={game.cardMode} lockStack={game.status !== 'lobby'} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={async () => { if (await run('host:rules', { rules })) onDone(); }}>Save rules</button>
      </div>
    </div>
  );
}

export default function Lobby({ game, onLeave }) {
  const [editing, setEditing] = useState(false);
  const { run, error } = useAction();
  const isHost = game.isHost;
  const ready = game.players.length >= 2;

  return (
    <main className="page">
      <header className="top">
        <div>
          <h2 className="table-name">{game.name}</h2>
          <ModeBadge mode={game.cardMode} />
        </div>
        <div className="row"><HandGuide />{!isHost && <button className="btn text small" onClick={onLeave}>Leave</button>}</div>
      </header>

      {isHost && <JoinInfo code={game.code} />}
      {!isHost && (
        <div className="waiting">
          <div className="pulse-dot" aria-hidden="true" />
          <p>You’re in. Waiting for the host to start the game.</p>
        </div>
      )}

      <section className="panel">
        <h3>Players <span className="count">{game.players.length}</span></h3>
        {game.players.length === 0 && <p className="muted">Nobody has joined yet. Share the code above.</p>}
        <ul className="lobby-list">
          {game.players.map((p) => (
            <li key={p.id} className={p.id === game.me?.id ? 'me' : ''}>
              <span className={`dot ${p.connected ? 'on' : ''}`} title={p.connected ? 'Connected' : 'Not connected'} />
              <span className="grow">{p.name}{p.isHost && <em className="tag">host</em>}{p.id === game.me?.id && <em className="tag">you</em>}</span>
              {isHost && !p.isHost && <button className="btn text small danger" onClick={() => run('host:kick', { playerId: p.id })}>Remove</button>}
            </li>
          ))}
        </ul>
        {!game.hostPlays && <p className="muted small">The host is running the table and not playing.</p>}
      </section>

      <section className="panel">
        <div className="row between">
          <h3>House rules</h3>
          {isHost && !editing && <button className="btn text small" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing ? <RulesEditor game={game} onDone={() => setEditing(false)} /> : (
          <ul className="rule-chips">{rulesSummary(game.rules).map((r) => <li key={r}>{r}</li>)}</ul>
        )}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {isHost && (
        <div className="sticky-bottom">
          <button className="btn primary big" disabled={!ready} onClick={() => run('host:start')}>
            {ready ? `Start game with ${game.players.length} players` : 'Waiting for at least 2 players'}
          </button>
        </div>
      )}
    </main>
  );
}
