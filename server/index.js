import './env.js';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import * as E from './engine.js';
import { buildView } from './view.js';
import { history } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 24) * 3600 * 1000;
const MAX_PLAYERS = 22; // 22 players × 2 hole cards + 5 board + 3 burns = 52 cards

// ---------- persistence ----------
const games = new Map();
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const g of raw) games.set(g.code, g);
    console.log(`Restored ${games.size} game(s) from ${DATA_FILE}`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Could not read saved games:', e.message);
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...games.values()]));
    fs.renameSync(tmp, DATA_FILE);
  }, 250);
}
// Start fresh by default; set RESTORE_GAMES=1 to reload saved games on boot.
if (process.env.RESTORE_GAMES === '1') load();
else fs.rmSync(DATA_FILE, { force: true });

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!games.has(c)) return c;
  }
}
const cleanName = (s, max = 24) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- http ----------
const app = express();
const server = http.createServer(app);
// CLIENT_ORIGIN (comma-separated) locks browsers to your frontend when it is hosted elsewhere, e.g. on Vercel.
const clientOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const io = new Server(server, { cors: { origin: clientOrigins.length ? clientOrigins : true } });
app.get('/healthz', (_req, res) => res.json({ ok: true, games: games.size, history: history.enabled }));
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!socket\.io).*/, (_req, res, next) => {
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else next();
});

// ---------- sync ----------
function connectedIds(code) {
  const ids = new Set();
  for (const s of io.sockets.adapter.rooms.get(code) ?? []) {
    const sock = io.sockets.sockets.get(s);
    if (sock?.data.playerId) ids.add(sock.data.playerId);
  }
  return ids;
}

function broadcast(game) {
  game.updatedAt = Date.now();
  const ids = connectedIds(game.code);
  for (const sid of io.sockets.adapter.rooms.get(game.code) ?? []) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.emit('state', buildView(game, sock.data, ids));
  }
  armTimer(game);
  save();
  try { history.sync(game); } catch (e) { console.error('History:', e.message); }
}

// Turn timer: one pending timeout per game.
const timers = new Map();
function armTimer(game) {
  clearTimeout(timers.get(game.code));
  timers.delete(game.code);
  const h = game.hand;
  if (!h || h.phase !== 'betting' || !h.turnDeadline || game.paused || !game.rules.autoFoldOnTimeout) return;
  const wait = Math.max(0, h.turnDeadline - Date.now());
  const handNo = h.number;
  const actor = h.toActId;
  timers.set(game.code, setTimeout(() => {
    const g = games.get(game.code);
    if (!g || g.hand?.number !== handNo || g.hand.toActId !== actor || g.paused) return;
    try { if (E.timeoutAction(g)) broadcast(g); } catch (e) { console.error(e); }
  }, wait + 250));
}
for (const g of games.values()) armTimer(g);

// Remove abandoned sessions.
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  let removed = 0;
  for (const [code, g] of games) if ((g.updatedAt ?? 0) < cutoff) { games.delete(code); removed++; }
  if (removed) save();
}, 3600 * 1000).unref();

// ---------- socket handlers ----------
function handler(socket, fn) {
  return async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...(await fn(payload ?? {})) });
    } catch (e) {
      if (!(e instanceof E.GameError)) console.error(e);
      reply({ ok: false, error: e instanceof E.GameError ? e.message : 'Something went wrong' });
    }
  };
}

function bound(socket) {
  const game = games.get(socket.data.code);
  if (!game) throw new E.GameError('This table no longer exists');
  return game;
}
function asHost(socket) {
  const game = bound(socket);
  if (!socket.data.isHost) throw new E.GameError('Only the host can do that');
  return game;
}
function asPlayer(socket) {
  const game = bound(socket);
  const p = game.players.find((x) => x.id === socket.data.playerId);
  if (!p) throw new E.GameError('You are not seated at this table');
  return { game, p };
}
const notEnded = (game) => { if (game.status === 'ended') throw new E.GameError('This session has ended'); };
const handInProgress = (game) => game.hand && game.hand.phase !== 'complete';

function newPlayer(game, name) {
  name = cleanName(name);
  if (!name) throw new E.GameError('Enter your name');
  if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
    throw new E.GameError('That name is taken at this table');
  if (game.players.length >= MAX_PLAYERS) throw new E.GameError(`This table is full (${MAX_PLAYERS} players)`);
  const p = {
    id: randomUUID().slice(0, 8), token: randomUUID(), name,
    chips: game.rules.startingStack, buyIn: game.rules.startingStack, rebuys: 0, sittingOut: false, busted: false, joinedAt: Date.now(),
  };
  game.players.push(p);
  return p;
}

function attach(socket, game, role) {
  for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
  socket.data = { code: game.code, ...role };
  socket.join(game.code);
}

io.on('connection', (socket) => {
  socket.data = {};

  socket.on('create', handler(socket, (d) => {
    const cardMode = d.cardMode;
    if (!['digital', 'physical'].includes(cardMode)) throw new E.GameError('Choose a card mode');
    const name = cleanName(d.tableName, 40);
    if (!name) throw new E.GameError('Name the table');
    const rules = E.validateRules(d.rules ?? {}, cardMode);
    const game = {
      code: newCode(), name, cardMode, hostPlays: !!d.hostPlays,
      hostToken: randomUUID(), hostPlayerId: null,
      rules, status: 'lobby', paused: false, pausedRemainingMs: null,
      players: [], buttonId: null, handNumber: 0, hand: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    let playerId = null;
    if (game.hostPlays) {
      const p = newPlayer(game, d.hostName);
      p.token = game.hostToken;
      game.hostPlayerId = playerId = p.id;
    }
    games.set(game.code, game);
    attach(socket, game, { isHost: true, playerId });
    broadcast(game);
    return { code: game.code, token: game.hostToken };
  }));

  socket.on('join', handler(socket, (d) => {
    const game = games.get(String(d.code ?? '').toUpperCase().trim());
    if (!game) throw new E.GameError('No table with that code');
    notEnded(game);
    const p = newPlayer(game, d.name);
    attach(socket, game, { isHost: false, playerId: p.id });
    broadcast(game);
    return { code: game.code, token: p.token };
  }));

  // Reconnect with a saved token, or attach as a TV spectator.
  socket.on('attach', handler(socket, (d) => {
    const game = games.get(String(d.code ?? '').toUpperCase().trim());
    if (!game) throw new E.GameError('No table with that code');
    if (d.tv) {
      attach(socket, game, { isTV: true });
    } else if (d.token && d.token === game.hostToken) {
      attach(socket, game, { isHost: true, playerId: game.hostPlayerId });
    } else {
      const p = game.players.find((x) => x.token === d.token);
      if (!p) throw new E.GameError('Your seat was not found — you may have been removed');
      attach(socket, game, { isHost: false, playerId: p.id });
    }
    broadcast(game);
    return { code: game.code };
  }));

  socket.on('leaveView', handler(socket, () => {
    const code = socket.data.code;
    for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
    socket.data = {};
    const g = games.get(code);
    if (g) broadcast(g);
    return {};
  }));

  // ----- player actions -----
  socket.on('action', handler(socket, (d) => {
    const { game, p } = asPlayer(socket);
    E.act(game, p.id, d);
    broadcast(game);
    return {};
  }));

  socket.on('sitOut', handler(socket, (d) => {
    const { game, p } = asPlayer(socket);
    notEnded(game);
    p.sittingOut = !!d.value;
    broadcast(game);
    return {};
  }));

  socket.on('rebuy', handler(socket, () => {
    const { game, p } = asPlayer(socket);
    notEnded(game);
    E.rebuy(game, p.id);
    broadcast(game);
    return {};
  }));

  // ----- host actions -----
  socket.on('host:rules', handler(socket, (d) => {
    const game = asHost(socket);
    notEnded(game);
    if (handInProgress(game)) throw new E.GameError('House rules can only be changed between hands');
    const rules = E.validateRules(d.rules ?? {}, game.cardMode);
    if (game.status === 'lobby') for (const p of game.players) p.chips = p.buyIn = rules.startingStack;
    game.rules = rules;
    broadcast(game);
    return {};
  }));

  socket.on('host:start', handler(socket, () => {
    const game = asHost(socket);
    if (game.status !== 'lobby') throw new E.GameError('The game has already started');
    if (game.players.filter(E.eligibleToPlay).length < 2) throw new E.GameError('At least 2 players are needed');
    game.status = 'playing';
    E.startHand(game);
    broadcast(game);
    return {};
  }));

  socket.on('host:nextHand', handler(socket, () => {
    const game = asHost(socket);
    E.startHand(game);
    broadcast(game);
    return {};
  }));

  socket.on('host:pause', handler(socket, (d) => {
    const game = asHost(socket);
    if (game.status !== 'playing') throw new E.GameError('The game is not running');
    const pause = !!d.value;
    if (pause === game.paused) return {};
    const h = game.hand;
    if (pause) {
      game.pausedRemainingMs = h?.turnDeadline ? Math.max(0, h.turnDeadline - Date.now()) : null;
      if (h) h.turnDeadline = null;
    } else {
      if (h && game.pausedRemainingMs != null && h.phase === 'betting') h.turnDeadline = Date.now() + game.pausedRemainingMs;
      game.pausedRemainingMs = null;
    }
    game.paused = pause;
    broadcast(game);
    return {};
  }));

  socket.on('host:advance', handler(socket, () => {
    const game = asHost(socket);
    E.advanceStreet(game);
    broadcast(game);
    return {};
  }));

  socket.on('host:declare', handler(socket, (d) => {
    const game = asHost(socket);
    if (game.cardMode !== 'physical') throw new E.GameError('Winners are decided automatically with digital cards');
    E.declareWinners(game, d.winners);
    broadcast(game);
    return {};
  }));

  socket.on('host:kick', handler(socket, (d) => {
    const game = asHost(socket);
    const p = game.players.find((x) => x.id === d.playerId);
    if (!p) throw new E.GameError('Player not found');
    if (p.id === game.hostPlayerId) throw new E.GameError('The host cannot remove themselves — end the session instead');
    E.forceFold(game, p.id);
    game.players = game.players.filter((x) => x.id !== p.id);
    for (const sid of io.sockets.adapter.rooms.get(game.code) ?? []) {
      const sock = io.sockets.sockets.get(sid);
      if (sock?.data.playerId === p.id) {
        sock.emit('kicked', { name: game.name });
        sock.leave(game.code);
        sock.data = {};
      }
    }
    broadcast(game);
    return {};
  }));

  socket.on('host:end', handler(socket, () => {
    const game = asHost(socket);
    if (handInProgress(game)) {
      // Unfinished hand is voided: everyone gets back what they put in.
      for (const s of game.hand.seats) {
        const p = game.players.find((x) => x.id === s.id);
        if (p) p.chips += s.total;
        s.total = 0;
      }
      game.hand.log.push('Session ended — unfinished hand voided, bets returned');
      game.hand.phase = 'complete';
      game.hand.toActId = null;
      game.hand.result = { pots: [], winnings: {}, showdown: null, uncontested: false, voided: true };
    }
    game.status = 'ended';
    game.paused = false;
    broadcast(game);
    return {};
  }));

  socket.on('disconnect', () => {
    const g = games.get(socket.data.code);
    if (g) setTimeout(() => broadcast(g), 50);
  });
});

server.listen(PORT, () => console.log(`Hold'em table server on http://localhost:${PORT}`));
