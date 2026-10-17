import { useState } from 'react';
import { call } from './socket.js';
import RulesForm, { DEFAULT_RULES, Segmented, INFO } from './RulesForm.jsx';
import { unlockAudio } from './alerts.js';
import { PhoneIcon, CardsIcon, Card } from './Card.jsx';
import { ChipStack } from './Chips.jsx';
import { FieldHead } from './Info.jsx';
import HandGuide from './HandGuide.jsx';

export default function Home({ onEntered, notice, clearNotice }) {
  const joinParam = new URLSearchParams(window.location.search).get('join');
  const [view, setView] = useState(joinParam ? 'join' : 'home');

  if (view === 'create') return <CreateTable onBack={() => setView('home')} onEntered={onEntered} />;
  if (view === 'join') return <JoinTable initialCode={joinParam || ''} onBack={() => setView('home')} onEntered={onEntered} />;

  return (
    <main className="home">
      <div className="home-hero">
        <span className="neon-sign">★ Open all night ★</span>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-card a"><Card card="As" size="xl" /></span>
          <span className="hero-card b"><Card card="Ah" size="xl" /></span>
          <span className="hero-chips"><ChipStack amount={1850} size="lg" show={7} /></span>
        </div>
        <h1>Hold’em Night</h1>
        <p>Everyone at the table plays from their own phone. Use real cards or let the app deal.</p>
      </div>
      {notice && <div className="notice" role="alert">{notice} <button className="link" onClick={clearNotice}>Dismiss</button></div>}
      <div className="home-actions">
        <button className="btn primary big" onClick={() => setView('create')}>Create a table</button>
        <button className="btn ghost big" onClick={() => setView('join')}>Join with a code</button>
        <div className="center"><HandGuide label="Poker hand rankings" /></div>
      </div>
    </main>
  );
}

function Back({ onClick }) {
  return <button className="btn text back" onClick={onClick}>‹ Back</button>;
}

function JoinTable({ initialCode, onBack, onEntered }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    unlockAudio();
    setBusy(true); setError(null);
    try {
      const res = await call('join', { code, name });
      onEntered({ code: res.code, token: res.token });
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <main className="page narrow">
      <Back onClick={onBack} />
      <h2>Join a table</h2>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span className="field-label">Table code</span>
          <input className="code-input" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC123" required />
        </label>
        <label className="field">
          <span className="field-label">Your name</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big" disabled={busy || code.length !== 6 || !name.trim()}>Take a seat</button>
      </form>
    </main>
  );
}

function CreateTable({ onBack, onEntered }) {
  const [tableName, setTableName] = useState('');
  const [cardMode, setCardMode] = useState(null);
  const [hostPlays, setHostPlays] = useState(true);
  const [hostName, setHostName] = useState('');
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    unlockAudio();
    if (!cardMode) return setError('Choose how cards are dealt');
    setBusy(true); setError(null);
    try {
      const res = await call('create', { tableName, cardMode, hostPlays, hostName, rules });
      onEntered({ code: res.code, token: res.token });
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <main className="page">
      <Back onClick={onBack} />
      <h2>New table</h2>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <FieldHead label="Table name" info={INFO.tableName} htmlFor="table-name" />
          <input id="table-name" value={tableName} maxLength={40} onChange={(e) => setTableName(e.target.value)} placeholder="Friday at Priya’s" required />
        </div>

        <section className="field">
          <FieldHead label="How are cards dealt?" info={INFO.cardMode} />
          <div className="mode-pick" role="radiogroup" aria-label="Card mode">
            <button type="button" role="radio" aria-checked={cardMode === 'digital'} className={`mode-card ${cardMode === 'digital' ? 'on' : ''}`} onClick={() => setCardMode('digital')}>
              <span className="mode-icon"><PhoneIcon /></span>
              <strong>Digital cards</strong>
              <span>The app deals. Each phone shows only its own hole cards, and the app picks the winner.</span>
            </button>
            <button type="button" role="radio" aria-checked={cardMode === 'physical'} className={`mode-card ${cardMode === 'physical' ? 'on' : ''}`} onClick={() => setCardMode('physical')}>
              <span className="mode-icon"><CardsIcon /></span>
              <strong>Physical cards</strong>
              <span>You deal a real deck. The app tracks chips, bets and turns, and you declare the winner.</span>
            </button>
          </div>
          <span className="field-hint">This can’t be changed once the table is created.</span>
        </section>

        <section className="field">
          <FieldHead label="Are you playing?" info={INFO.hostRole} />
          <Segmented label="Host role" value={hostPlays ? 'play' : 'deal'} onChange={(v) => setHostPlays(v === 'play')}
            options={[['play', 'I’m playing'], ['deal', 'Only running the table']]} />
          {hostPlays && (
            <div className="field" style={{ marginTop: 12 }}>
              <FieldHead label="Your name" info={INFO.hostName} htmlFor="host-name" />
              <input id="host-name" value={hostName} maxLength={24} onChange={(e) => setHostName(e.target.value)} required />
            </div>
          )}
        </section>

        <details className="rules-box" open>
          <summary>House rules</summary>
          <RulesForm rules={rules} onChange={setRules} cardMode={cardMode} />
        </details>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big" disabled={busy}>Create table</button>
      </form>
    </main>
  );
}
