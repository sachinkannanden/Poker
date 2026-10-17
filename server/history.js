// Saves game history to Supabase: one row per table in `games`, one row per finished hand in `hands`.
// Everything here is best-effort and off the hot path: a slow or failing database never blocks play,
// and a failed write is retried on the next state change.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

export function createHistory(client) {
  const queues = new Map();
  const enqueue = (key, fn) => {
    const next = (queues.get(key) ?? Promise.resolve()).then(fn).catch((e) => console.error('History write failed:', e.message ?? e));
    queues.set(key, next);
    next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
    return next;
  };

  const standings = (game) => game.players.map((p) => ({
    name: p.name, chips: p.chips, buy_in: p.buyIn, rebuys: p.rebuys, net: p.chips - p.buyIn,
  }));

  const gameRow = (game) => ({
    id: game.logId,
    code: game.code,
    name: game.name,
    card_mode: game.cardMode,
    host_plays: !!game.hostPlays,
    rules: game.rules,
    status: game.status,
    created_at: iso(game.createdAt),
    ended_at: game.status === 'ended' ? iso(game.updatedAt) : null,
    final_standings: game.status === 'ended' ? standings(game) : null,
  });

  const handRow = (game) => {
    const h = game.hand;
    const r = h.result ?? {};
    const name = (id) => game.players.find((p) => p.id === id)?.name ?? null;
    return {
      game_id: game.logId,
      hand_number: h.number,
      voided: !!r.voided,
      dealer: name(h.buttonId),
      board: h.board ?? [],
      pot_total: (r.pots ?? []).reduce((a, p) => a + p.amount, 0),
      pots: (r.pots ?? []).map((p) => ({
        amount: p.amount, hand_name: p.handName ?? null,
        winners: (p.winners ?? []).map(name), eligible: (p.eligible ?? []).map(name),
      })),
      players: h.seats.map((s) => ({
        name: s.name, invested: s.total, folded: s.folded, all_in: s.allIn,
        hole: h.hole?.[s.id] ?? null, won: r.winnings?.[s.id] ?? 0, hand_name: r.showdown?.[s.id]?.name ?? null,
      })),
      stacks: Object.fromEntries(game.players.map((p) => [p.name, p.chips])),
      log: h.log ?? [],
    };
  };

  // Call after every state change. Idempotent: each row is written once (flags live on the game).
  function sync(game) {
    if (!client) return Promise.resolve();
    game.logId ||= randomUUID();
    const jobs = [];

    const needGame = !game.logSaved || (game.status === 'ended' && !game.endSaved);
    if (needGame) {
      const ending = game.status === 'ended';
      game.logSaved = true;
      if (ending) game.endSaved = true;
      jobs.push(enqueue(game.logId, async () => {
        const { error } = await client.from('games').upsert(gameRow(game));
        if (error) { game.logSaved = false; if (ending) game.endSaved = false; throw error; }
      }));
    }

    const h = game.hand;
    if (h?.phase === 'complete' && h.result && !h.logSaved) {
      h.logSaved = true;
      const row = handRow(game);
      jobs.push(enqueue(game.logId, async () => {
        const { error } = await client.from('hands').upsert(row, { onConflict: 'game_id,hand_number' });
        if (error) { h.logSaved = false; throw error; }
      }));
    }
    return Promise.all(jobs);
  }

  return { sync, enabled: !!client };
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
if (!client) console.log('History: Supabase not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save game logs)');
else console.log('History: saving game logs to Supabase');

export const history = createHistory(client);
