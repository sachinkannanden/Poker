// Runs the real server and drives it with several socket clients.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 90);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'holdem-'));
let proc;
const clients = [];

async function startServer() {
  proc = spawn(process.execPath, [path.join(here, 'index.js')], { env: { ...process.env, PORT, DATA_DIR, RESTORE_GAMES: '1' }, stdio: 'pipe' });
  await new Promise((res, rej) => {
    proc.stdout.on('data', (d) => d.toString().includes('server on') && res());
    proc.on('exit', (c) => rej(new Error('server exited ' + c)));
  });
}
async function stopServer() {
  await new Promise((r) => setTimeout(r, 400)); // let the debounced save land
  proc.kill();
  await new Promise((r) => proc.once('exit', r));
}
after(async () => { clients.forEach((c) => c.close()); proc?.kill(); });

function client() {
  const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.last = null;
  s.on('state', (st) => { s.last = st; });
  clients.push(s);
  return s;
}
const call = (s, ev, p = {}) => new Promise((res) => s.emit(ev, p, res));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
async function ok(s, ev, p) { const r = await call(s, ev, p); assert.ok(r.ok, `${ev}: ${r.error}`); await tick(); return r; }

test('digital game: create, join, privacy, play, reconnect, persist', async () => {
  await startServer();
  const host = client(); const b = client(); const c = client(); const tv = client();
  await tick(200);
  const created = await ok(host, 'create', { tableName: 'Test table', cardMode: 'digital', hostPlays: true, hostName: 'Hana', rules: { smallBlind: 5, bigBlind: 10, minRaise: 10, startingStack: 500 } });
  assert.equal(created.code.length, 6);
  const code = created.code;

  const bad = await call(b, 'join', { code: 'ZZZZZZ', name: 'Ben' });
  assert.equal(bad.ok, false);
  const jb = await ok(b, 'join', { code, name: 'Ben' });
  const dup = await call(c, 'join', { code, name: 'ben' });
  assert.match(dup.error, /taken/);
  await ok(c, 'join', { code, name: 'Cara' });
  await ok(tv, 'attach', { code, tv: true });

  assert.equal(host.last.status, 'lobby');
  assert.equal(host.last.players.length, 3);
  assert.equal(b.last.isHost, false);
  const notHost = await call(b, 'host:start');
  assert.match(notHost.error, /Only the host/);

  // rule change in lobby resets stacks
  await ok(host, 'host:rules', { rules: { ...host.last.rules, startingStack: 800 } });
  assert.ok(host.last.players.every((p) => p.chips === 800));

  await ok(host, 'host:start');
  const st = host.last;
  assert.equal(st.status, 'playing');
  assert.equal(st.hand.number, 1);
  // privacy: each client sees only its own hole cards
  for (const s of [host, b, c]) {
    const mine = s.last.players.filter((p) => p.cards);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, s.last.me.id);
    assert.equal(mine[0].cards.length, 2);
  }
  assert.ok(tv.last.players.every((p) => p.cards === null));
  assert.equal(JSON.stringify(tv.last).includes('deck'), false);

  // rules locked mid-hand
  const locked = await call(host, 'host:rules', { rules: host.last.rules });
  assert.match(locked.error, /between hands/);

  // play the hand to completion: everyone calls/checks
  const byId = { [host.last.me.id]: host, [b.last.me.id]: b, [c.last.me.id]: c };
  let guard = 0;
  while (host.last.hand.phase !== 'complete' && guard++ < 30) {
    const actor = byId[host.last.hand.toActId];
    const wrong = Object.values(byId).find((s) => s !== actor);
    const nope = await call(wrong, 'action', { type: 'check' });
    assert.equal(nope.ok, false);
    const legal = actor.last.legal;
    await ok(actor, 'action', { type: legal.check ? 'check' : 'call' });
  }
  const done = host.last.hand;
  assert.equal(done.phase, 'complete');
  assert.equal(done.board.length, 5);
  // showdown reveals live hands to everyone
  assert.ok(b.last.players.every((p) => p.cards && p.handName));
  const total = host.last.players.reduce((a, p) => a + p.chips, 0);
  assert.equal(total, 2400);

  // reconnect with token
  b.close();
  const b2 = client();
  await tick(150);
  const re = await call(b2, 'attach', { code, token: jb.token });
  assert.ok(re.ok);
  await tick();
  assert.equal(b2.last.me.id, Object.keys(byId).find((id) => byId[id] === b));
  const bogus = await call(client(), 'attach', { code, token: 'nope' });
  assert.equal(bogus.ok, false);

  // pause blocks actions
  await ok(host, 'host:nextHand');
  await ok(host, 'host:pause', { value: true });
  const actorId = host.last.hand.toActId;
  const actorSock = actorId === b2.last.me.id ? b2 : byId[actorId];
  const paused = await call(actorSock, 'action', { type: 'fold' });
  assert.match(paused.error, /paused/);
  await ok(host, 'host:pause', { value: false });

  // kick Cara mid-hand
  const caraId = c.last.me.id;
  let kicked = false;
  c.on('kicked', () => { kicked = true; });
  await ok(host, 'host:kick', { playerId: caraId });
  assert.ok(kicked);
  assert.equal(host.last.players.length, 2);

  // persistence across restart
  const handNo = host.last.hand.number;
  await stopServer();
  await startServer();
  const h2 = client();
  await tick(150);
  await ok(h2, 'attach', { code, token: created.token });
  assert.equal(h2.last.isHost, true);
  assert.equal(h2.last.hand.number, handNo);
  assert.equal(h2.last.players.length, 2);

  const expected = h2.last.players.reduce((a, p) => a + p.chips + (p.inHand ? p.handTotal : 0), 0);
  await ok(h2, 'host:end');
  assert.equal(h2.last.status, 'ended');
  assert.equal(h2.last.players.reduce((a, p) => a + p.chips, 0), expected); // unfinished hand voided
  const late = await call(client(), 'join', { code, name: 'Late' });
  assert.match(late.error, /ended/);
});

test('physical game with dealer-only host and timer auto-fold', async () => {
  const host = client(); const a = client(); const b = client();
  await tick(150);
  const { code } = await ok(host, 'create', { tableName: 'Real cards', cardMode: 'physical', hostPlays: false, rules: { turnTimeSec: 5, autoFoldOnTimeout: true, rabbitHunt: true } });
  assert.equal(host.last.cardMode, 'physical');
  assert.equal(host.last.rules.rabbitHunt, false); // digital only
  assert.equal(host.last.me, null);
  await ok(a, 'join', { code, name: 'Ann' });
  await ok(b, 'join', { code, name: 'Bo' });
  await ok(host, 'host:start');
  assert.deepEqual(a.last.hand.board, []);
  assert.ok(a.last.players.every((p) => p.cards === null));
  // heads-up: Ann has button+SB and acts first
  const first = a.last.hand.toActId === a.last.me.id ? a : b;
  const second = first === a ? b : a;
  await ok(first, 'action', { type: 'call' });
  await ok(second, 'action', { type: 'check' });
  assert.equal(host.last.hand.phase, 'awaitingStreet');
  const nope = await call(a, 'host:advance');
  assert.equal(nope.ok, false);
  await ok(host, 'host:advance');
  assert.equal(host.last.hand.street, 'flop');
  // let the timer run out: free check, so auto-check
  await tick(5600);
  assert.equal(host.last.hand.log.some((l) => /ran out of time/.test(l)), true);
  // finish
  while (host.last.hand.phase === 'betting' || host.last.hand.phase === 'awaitingStreet') {
    if (host.last.hand.phase === 'awaitingStreet') { await ok(host, 'host:advance'); continue; }
    const s = host.last.hand.toActId === a.last.me.id ? a : b;
    await ok(s, 'action', { type: 'check' });
  }
  assert.equal(host.last.hand.phase, 'awaitingWinner');
  const ids = host.last.players.map((p) => p.id);
  await ok(host, 'host:declare', { winners: [ids] });
  assert.deepEqual(host.last.players.map((p) => p.chips), [1000, 1000]);
  assert.equal(host.last.hand.phase, 'complete');
});
