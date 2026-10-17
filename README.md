# Hold'em Night — same-room Texas Hold'em table

A mobile web app that turns everyone's phone into a seat at a real-life poker table. The host creates a table, players join with a 6-character code or QR code, and the app runs the hand: blinds and antes, turn order, betting, side pots and payouts. It is a table manager for people in the same room — there are no AI players.

**Card mode is chosen when the table is created and locked for the session:**

- **Digital cards** — the app deals. Each phone shows only its own hole cards; the board and the showdown are handled automatically.
- **Physical cards** — you deal a real deck. The app tracks chips, bets, pot and turns; the host taps "Deal flop / turn / river" and declares the winner of each pot.

Stack: React (Vite) front end, Node + Express + Socket.io back end, game state saved to a JSON file. No accounts.

## Run it locally

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server, proxies the socket to the Node server on port 3001)
- To play from phones on the same Wi-Fi, open `http://<your-computer's-LAN-IP>:5173` on each phone. The QR code in the lobby uses whatever address the host opened, so the host should open the LAN address too.

Production-style run (single server, single port):

```bash
npm run build      # builds the client into client/dist
npm start          # serves the app and the socket on http://localhost:3001
```

Tests (engine rules plus a real server driven by socket clients):

```bash
npm test
```

### Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket port |
| `DATA_DIR` | `./data` | Where `games.json` is saved |
| `SESSION_TTL_HOURS` | `24` | Tables untouched this long are deleted |

## Deploy

The server keeps a live WebSocket connection and saves state to disk, so deploy it to a host that runs a long-lived Node process — not to a serverless/static host such as Vercel or Netlify.

**Render / Railway / Fly.io / any VPS**

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add a persistent disk/volume and set `DATA_DIR` to its mount path, so tables survive restarts and redeploys.
- Run a single instance. Game state lives in that process's memory; multiple instances would each have different tables.
- HTTPS is recommended (phones' share sheet and clipboard need a secure origin).

**Docker**

```bash
docker build -t holdem-night .
docker run -p 3001:3001 -v holdem-data:/data holdem-night
```

## How to play

1. **Host:** Create a table → name it → pick Digital or Physical cards → choose whether you're playing or only running the table → set house rules → share the code/QR.
2. **Players:** Scan the QR or enter the code, type a name. Names must be unique at the table.
3. **Host:** Start the game once at least 2 players have joined. After each hand, tap **Deal next hand**.
4. Optional: open **TV view** (`/tv/<CODE>`) on a laptop or TV for a shared screen. It never shows anyone's private cards.

Host controls (the **Host** button during play): pause/resume, edit house rules (between hands), invite players, remove players, open the TV view, end the session. Ending shows final chip counts, buy-ins and net result for each player.

Players can **sit out** (takes effect from the next hand) and, if rebuys are on, **rebuy** for the starting stack when they run out of chips. Players who bust with rebuys off stay on as spectators. New players can join at any time and are dealt in from the next hand.

If a phone loses connection or the page is reloaded, it rejoins the same seat automatically (the seat token is kept in the browser's local storage).

## House rules

| Rule | Notes |
|---|---|
| Betting structure | No-limit, pot-limit or fixed-limit |
| Forced bets | Blinds, antes, or both. Antes are paid by every player. |
| Small / big blind, ante | |
| Starting stack | Applies to everyone in the lobby; after the game starts, to new players and rebuys |
| Minimum raise | No-limit/pot-limit: every bet and raise must add at least this amount (see below) |
| Small bet / big bet | Fixed-limit: bet size pre-flop & flop / turn & river, set by the host |
| Raises per round | 0 = unlimited |
| Turn timer | 0 = off; minimum 5 seconds. Optional auto-fold on timeout. |
| Rabbit hunting | Digital mode only |
| Allow rebuys | |

## Rule decisions

Decided with you before building:

- **Minimum raise** uses the host's value only. It does not apply the standard "at least the size of the previous raise" rule.
- **Fixed-limit** bet sizes are both set by the host.
- **Antes** are paid by every player (not a big-blind ante).
- **Physical mode winners** are declared by the host only. With side pots, the host picks winner(s) for each pot; picking several splits that pot.
- The host chooses at creation whether they also play or only run the table.

Standard poker conventions I applied where the spec was silent — say if any should change:

- **Raise cap** counts raises only. The opening bet on a street is not a raise; pre-flop, the big blind counts as the opening bet, so the first pre-flop raise is raise #1.
- **Short all-in:** an all-in that adds less than a full raise doesn't count toward the cap and doesn't let players who already acted re-raise (they can call or fold).
- **Pot-limit:** if the pot is smaller than the minimum raise, the minimum is still allowed.
- **Heads-up:** the button posts the small blind and acts first pre-flop, last after the flop.
- **Antes only:** the player left of the button acts first on every street.
- **Odd chips** in a split pot go to the winner(s) closest to the left of the button.
- **Button:** starts with the first seated player and moves one seat left each hand, skipping players who are out or sitting out.
- **Uncalled bets** are returned before pots are built.
- **Timer runs out:** if checking is free the player checks, otherwise they fold. With auto-fold off, the timer is only a visual countdown.
- **Ending mid-hand** voids the hand and returns everyone's bets.
- **Table size** is limited to 22 players (the most a single deck can deal).
- The host can remove any player except themselves. A removed player's chips in the current pot stay in the pot.

## Project layout

```
server/
  cards.js        deck, cryptographic shuffle, 7-card hand evaluator
  engine.js       betting rules, streets, side pots, showdown, payouts
  view.js         builds each device's private view (hides other players' cards)
  index.js        Express + Socket.io server, sessions, host controls, timer, persistence
  *.test.js       unit and end-to-end tests
client/src/
  Home.jsx        create / join
  Lobby.jsx       lobby and rules editor
  Table.jsx       the play screen; ActionBar.jsx, HostPanel.jsx, TableParts.jsx
  TV.jsx          shared-screen spectator view
  alerts.js       turn chime and vibration
```

## Known limits

- Vibration works on Android browsers; iPhone Safari doesn't support web vibration, so iPhones get the sound only. Sound plays after the first tap on the page (a browser rule).
- There is no hand history across hands — only the current hand's action list (hand history was left out of this version).
- One server process holds all tables; it isn't built for horizontal scaling.

## Saving game history (Supabase)

Finished hands and ended sessions are saved to Supabase. It is optional: without the two variables below the game runs exactly as before.

1. Create a Supabase project, open **SQL editor**, and run [`supabase/schema.sql`](supabase/schema.sql).
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service-role key stays on the server; never put it in the client.
3. Restart the server. `/healthz` reports `"history": true` when it is on.

`games` has one row per table (rules, status, final standings); `hands` has one row per finished hand (board, hole cards, pots, winners, the action log). Row level security is on with no policies, so only the server key can read or write.

## Deploying: Vercel frontend + separate realtime server

Vercel runs short-lived serverless functions, so it can't host this game's Socket.IO server (it needs one long-running process that keeps tables in memory). Host the two halves separately:

1. **Server** (Render, Railway, Fly.io, or any VPS): deploy this repo with the included `Dockerfile` (`render.yaml` is a ready Render blueprint). Set `CLIENT_ORIGIN` to your Vercel URL and, optionally, the Supabase variables. Check `https://<server>/healthz`.
2. **Frontend** (Vercel): import the repo. `vercel.json` already sets the build and the single-page rewrite (so `/tv/CODE` links work). Add the environment variable `VITE_SERVER_URL=https://<server>` and redeploy.

Join links and QR codes use the Vercel address, so anyone with the link can play. Tables live in the server's memory; a restart ends them unless you set `RESTORE_GAMES=1` and keep `DATA_DIR` on a persistent disk. Use a paid, always-on instance: free tiers sleep and drop live games.
