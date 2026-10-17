import { useEffect, useState, useCallback } from 'react';
import { socket, call, getSession, setSession, clearState, useGameState, useConnected } from './socket.js';
import Home from './Home.jsx';
import Lobby from './Lobby.jsx';
import Table from './Table.jsx';
import TV from './TV.jsx';

function tvCodeFromPath() {
  const m = window.location.pathname.match(/^\/tv\/([A-Za-z0-9]{6})/);
  return m ? m[1].toUpperCase() : null;
}

export default function App() {
  const tvCode = tvCodeFromPath();
  return tvCode ? <TV code={tvCode} /> : <PlayerApp />;
}

function PlayerApp() {
  const game = useGameState();
  const connected = useConnected();
  const [session, setSess] = useState(getSession);
  const [notice, setNotice] = useState(null);
  const [restoring, setRestoring] = useState(!!getSession());

  const saveSession = useCallback((s) => { setSession(s); setSess(s); }, []);

  // Re-attach to the saved seat on load and after every reconnect.
  useEffect(() => {
    const reattach = () => {
      const s = getSession();
      if (!s) return setRestoring(false);
      call('attach', s)
        .catch((e) => { saveSession(null); clearState(); setNotice(e.message); })
        .finally(() => setRestoring(false));
    };
    socket.on('connect', reattach);
    if (socket.connected) reattach();
    const kicked = ({ name }) => {
      saveSession(null);
      clearState();
      setNotice(`The host removed you from “${name}”.`);
    };
    socket.on('kicked', kicked);
    return () => { socket.off('connect', reattach); socket.off('kicked', kicked); };
  }, [saveSession]);

  const leave = useCallback(() => {
    call('leaveView').catch(() => {});
    saveSession(null);
    clearState();
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState(null, '', url);
  }, [saveSession]);

  const inGame = session && game && game.code === session.code;

  let screen;
  if (inGame) screen = game.status === 'lobby'
    ? <Lobby game={game} onLeave={leave} />
    : <Table game={game} onLeave={leave} />;
  else if (restoring || (session && !game)) screen = <div className="center-msg">Finding your seat…</div>;
  else screen = <Home onEntered={saveSession} notice={notice} clearNotice={() => setNotice(null)} />;

  return (
    <>
      {!connected && <div className="offline-bar" role="status">Reconnecting to the table…</div>}
      {screen}
    </>
  );
}
