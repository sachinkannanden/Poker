import { useState } from 'react';
import { RulesEditor } from './Lobby.jsx';
import JoinInfo from './JoinInfo.jsx';
import { fmt } from './TableParts.jsx';
import { FieldHead } from './Info.jsx';

export function HostPrimary({ game, run, busy }) {
  const hand = game.hand;
  if (game.status !== 'playing' || !hand) return null;
  if (hand.phase === 'awaitingStreet') {
    const next = { preflop: 'flop', flop: 'turn', turn: 'river' }[hand.street];
    return <button className="btn primary big" disabled={busy || game.paused} onClick={() => run('host:advance')}>Deal {next}</button>;
  }
  if (hand.phase === 'awaitingWinner') return <WinnerPicker game={game} run={run} busy={busy} />;
  if (hand.phase === 'complete') {
    const able = game.players.filter((p) => !p.busted && !p.sittingOut && p.chips > 0).length;
    return (
      <button className="btn primary big" disabled={busy || game.paused || able < 2} onClick={() => run('host:nextHand')}>
        {able < 2 ? 'Need 2 players with chips' : 'Deal next hand'}
      </button>
    );
  }
  return null;
}

const WINNER_INFO = (
  <>
    <p>Pick who takes each pot once the cards are shown. The app then moves the chips for you.</p>
    <ul>
      <li><strong>One player:</strong> tap their name to give them the whole pot.</li>
      <li><strong>Several players:</strong> tap everyone who tied. The pot is split evenly, and any odd chip goes to the player closest left of the dealer button.</li>
      <li><strong>Side pots:</strong> when someone was all-in for less, there is a main pot and one or more side pots. Only the players listed under a pot can win it. “Same as main” copies your main-pot pick to a side pot.</li>
    </ul>
    <p>This can’t be undone once you award the pot, so check the showdown first.</p>
  </>
);

function WinnerPicker({ game, run, busy }) {
  const pots = game.hand.pots ?? [];
  const [picks, setPicks] = useState(() => pots.map(() => []));
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? '?';
  const toggle = (i, id) => setPicks((ps) => ps.map((arr, j) => j !== i ? arr : arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  const copyMain = (i) => setPicks((ps) => ps.map((arr, j) => j === i ? ps[0].filter((id) => pots[i].eligible.includes(id)) : arr));
  const ready = picks.length === pots.length && picks.every((p) => p.length > 0);

  return (
    <div className="winner-picker">
      <FieldHead as="h3" label="Who won?" info={WINNER_INFO} />
      <p className="muted small">Tap one player per pot, or several to split it.</p>
      {pots.map((pot, i) => (
        <div key={i} className="pot-pick">
          <div className="row between">
            <strong>{pots.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : 'Pot'} · {fmt(pot.amount)}</strong>
            {i > 0 && picks[0].length > 0 && <button className="btn text small" onClick={() => copyMain(i)}>Same as main</button>}
          </div>
          <div className="pick-list">
            {pot.eligible.map((id) => (
              <button key={id} type="button" aria-pressed={picks[i]?.includes(id)}
                className={`btn chip ${picks[i]?.includes(id) ? 'on' : ''}`} onClick={() => toggle(i, id)}>{name(id)}</button>
            ))}
          </div>
          {picks[i]?.length > 1 && <p className="muted small">Split {picks[i].length} ways</p>}
        </div>
      ))}
      <button className="btn primary big" disabled={!ready || busy || game.paused} onClick={() => run('host:declare', { winners: picks })}>
        Award {pots.length > 1 ? 'pots' : 'pot'}
      </button>
    </div>
  );
}

const HOST_INFO = (
  <>
    <p>Tools for running the table.</p>
    <dl className="info-options">
      <dt>Pause game</dt><dd>Freezes turns and timers for everyone, for a bathroom break or a rules argument. Resume to carry on.</dd>
      <dt>House rules</dt><dd>Change blinds, timers and more. Only available between hands, so a hand in progress isn’t disrupted.</dd>
      <dt>Invite players</dt><dd>Shows the table code and QR so more people can join.</dd>
      <dt>TV view</dt><dd>Opens a big-screen version of the table (no private cards) for a TV or laptop.</dd>
      <dt>Remove</dt><dd>Folds the player’s hand and takes them out of the game. Chips they already bet stay in the pot.</dd>
    </dl>
  </>
);

export default function HostPanel({ game, run, busy, onClose }) {
  const [view, setView] = useState('menu');
  const between = !game.hand || game.hand.phase === 'complete';
  const ended = game.status === 'ended';

  if (view === 'rules') return <RulesEditor game={game} onDone={() => setView('menu')} />;
  if (view === 'invite') return (
    <div className="sheet">
      <JoinInfo code={game.code} />
      <button className="btn ghost" onClick={() => setView('menu')}>Done</button>
    </div>
  );
  if (view === 'end') return (
    <div className="sheet">
      <FieldHead as="h3" label="End this session?" info={<p>Stops the game for everyone and shows the final chip counts and who is up or down. If a hand is in progress it is cancelled and every bet in it goes back to the players. You can’t restart the session afterwards; you would need to create a new table.</p>} />
      <p className="muted">Everyone sees the final chip counts. {between ? '' : 'The hand in progress is cancelled and all bets in it are returned.'} This can’t be undone.</p>
      <div className="row">
        <button className="btn ghost" onClick={() => setView('menu')}>Keep playing</button>
        <button className="btn danger-fill" disabled={busy} onClick={async () => { if (await run('host:end')) onClose(); }}>End session</button>
      </div>
    </div>
  );

  return (
    <div className="sheet host-menu">
      <FieldHead as="h3" label="Host controls" info={HOST_INFO} />
      {!ended && (
        <div className="grid-2">
          <button className="btn ghost" onClick={() => run('host:pause', { value: !game.paused })}>{game.paused ? 'Resume game' : 'Pause game'}</button>
          <button className="btn ghost" disabled={!between} onClick={() => setView('rules')} title={between ? '' : 'Available between hands'}>House rules</button>
          <button className="btn ghost" onClick={() => setView('invite')}>Invite players</button>
          <a className="btn ghost" href={`/tv/${game.code}`} target="_blank" rel="noreferrer">TV view</a>
        </div>
      )}
      {!between && !ended && <p className="muted small">House rules can be edited once this hand ends.</p>}
      <h4>Players</h4>
      <ul className="lobby-list">
        {game.players.map((p) => (
          <li key={p.id}>
            <span className={`dot ${p.connected ? 'on' : ''}`} />
            <span className="grow">{p.name} <span className="muted small">{fmt(p.chips)}</span></span>
            {!p.isHost && !ended && <button className="btn text small danger" onClick={() => run('host:kick', { playerId: p.id })}>Remove</button>}
          </li>
        ))}
      </ul>
      {!ended && <button className="btn text danger" onClick={() => setView('end')}>End session…</button>}
      <button className="btn ghost" onClick={onClose}>Close</button>
    </div>
  );
}
