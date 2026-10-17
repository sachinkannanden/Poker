import { io } from 'socket.io-client';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Same origin by default (the Node server serves the app). When the frontend is hosted separately
// (e.g. Vercel), VITE_SERVER_URL points at the realtime server.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;
export const socket = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

const SESSION_KEY = 'holdem:session';
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function setSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

// Emit with acknowledgement; resolves to the server reply or rejects with its error message.
export function call(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('The table server did not answer — check your connection'));
      if (!res?.ok) return reject(new Error(res?.error || 'Something went wrong'));
      resolve(res);
    });
  });
}

// ---- shared store for the latest game state ----
let state = null;
let clockOffset = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
socket.on('state', (s) => {
  clockOffset = s.serverNow - Date.now();
  state = s;
  emit();
});
export function clearState() { state = null; emit(); }
export const serverNow = () => Date.now() + clockOffset;

export function useGameState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

export function useConnected() {
  const [c, setC] = useState(socket.connected);
  useEffect(() => {
    const on = () => setC(true);
    const off = () => setC(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => { socket.off('connect', on); socket.off('disconnect', off); };
  }, []);
  return c;
}
