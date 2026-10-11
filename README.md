# Fly Poker 🪰🃏

A 3D poker room where five AI flies play Texas Hold'em against each other, and you bet play money on which fly wins each hand.

Each fly is driven by a small connectome-inspired neural circuit with its own playstyle, and it learns from every hand it plays. The betting side is a pari-mutuel pool: everyone's bets on a hand go into one pot, and the people who backed the winner split it.

Built for the RU Hackathon.

---

## Quick start

You need **Python 3.10+** and a modern browser (Chrome, Edge, Firefox or Safari). The 3D engine, three.js, loads from a CDN, so the first load needs an internet connection.

**One command:** from the repo folder, run `start.bat` on Windows (or double-click it) or `./start.sh` on macOS, Linux or Git Bash. It installs the API's requirements if needed, starts the API and the game, opens http://127.0.0.1:5173/ and stops both when you press Ctrl+C. The two-terminal setup below does the same thing by hand.

Open two terminals in the repo folder.

**Terminal 1: betting API**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```

**Terminal 2: the game**

```bash
cd fly-poker
python -m http.server 5173      # use python3 on macOS/Linux
```

Then open **http://127.0.0.1:5173/**.

Use `127.0.0.1` or `localhost` on port **5173**: the API only accepts requests from those addresses. Opening `index.html` by double-clicking it won't work; it has to be served.

The game still runs without the API. The bet buttons just read "Offline".

---

## How to play

**Watching the table**

- Drag to look around, scroll to zoom, right-drag to pan.
- Click a fly, or its name plate, to open its inspector: cards, stats, circuit activity and what it learned last hand.
- **Deal** starts a hand, **Next action** steps through it, and **Auto-play** runs hands back to back. The **Speed** slider sets how fast.

**Betting**

1. **A betting window opens.** The bet cards slide up above each fly's name plate, with a 10-second countdown. Press **Skip** to close it early.
2. **Pick a chip** ($1, $5, $25 or $100), then press **Bet** above the fly you want to back. You can bet on several flies and bet more than once. Each card shows that fly's live odds and how much has been backed on it.
3. **The window closes** when the timer runs out, you press Skip, or the hand is dealt. Bets lock and the betting UI slides away while the hand plays.
4. **The hand ends.** A banner shows whether you won, lost or were refunded, and your bankroll updates.
5. **The next window.**
   - Playing by hand, the betting UI slides back up right away.
   - In auto-play, a **"!"** pops up for 2 seconds. Click it in time to open a new betting window. If you don't, auto-play carries on and repeats your previous bets.

Everyone starts with **$1,000** of play money. If you run out, the dock offers a **rebuy** back to $1,000.

---

## How the betting works

- **Pari-mutuel pool.** All bets on a hand go into one pool. The house takes a 5% rake, and the rest is split between everyone who backed the winner, in proportion to their stake.
- **Odds move.** The odds on each card are what that fly would pay if betting closed now, so they shift as bets come in.
- **Split pots.** If two flies tie, the pool is shared equally between the two winning sides.
- **Refunds.** If nobody backed the winner, or everybody did, all stakes are returned with no rake.
- **Exact money.** All amounts are stored as whole cents, and every balance change is recorded in an audit ledger.

---

**NPC bettors.** Twenty computer bettors share the table. When a betting window opens, each NPC (90% of them) plans one bet from its own $1,000 bankroll (stakes of $1 to $100) for a moment inside the window. The bets land one by one, build up toward the end, and everyone still waiting bets in the last second as betting locks, so you watch the crowd form on each fly's card. A busted NPC gets a fresh bankroll. Half are **random** (any fly) and half follow the **odds** (they back the favourite most often, but long shots still get some money). Every bet card shows how many NPCs are on that fly next to what your stake pays, for example `$5 pays $23.80 · 3 NPCs`.

NPCs never affect your bet: odds are fixed when the round opens and every winning bet is paid by the house, so nothing is split with them. NPCs are ordinary accounts, so their bets are settled and refunded like yours.

---

## The flies

| Fly | Style | In short |
| --- | --- | --- |
| Vera | Tight-aggressive | Plays few hands, raises the ones she plays |
| Buzz | Loose-aggressive | Wider range, more bets and bluffs |
| Nib | Tight-passive | Very few hands, calls rather than raises |
| Callie | Loose-passive | Calling station, sticks around once invested |
| Mani | Maniac | Very wide range, big bets, lots of bluffs |

Each fly runs the same 45-neuron circuit with sensory, Kenyon, central, descending and motor layers. Its playstyle sets thresholds on top of the circuit. After every hand it adjusts its synapse strengths based on whether it won or lost chips, and tracks how its opponents play.

The full write-up is in [`fly-poker/src/brains/README.md`](fly-poker/src/brains/README.md), including what the circuit is (and isn't) based on and the exact learning rule. Playstyle numbers live in [`fly-poker/config/styles.json`](fly-poker/config/styles.json).

---

## Project layout

```
backend/                 Betting API (FastAPI + SQLite)
  main.py                Rounds, bets, payouts, bankrolls
  simulate_engine.py     Fake engine for testing the API without the game
  tests/test_betting.py  pytest suite
  requirements.txt

fly-poker/               The game (plain JavaScript + three.js, no build step)
  index.html
  src/main.js            Wires the table, the 3D scene, the HUD and betting together
  src/contract.js        Public API of the poker engine
  src/table.js           Hand flow: blinds, streets, showdown
  src/poker/             Cards, hand evaluator, betting rules, side pots, equity
  src/brains/            Fly circuits, playstyles, learning
  src/ui/                3D scene, room, flies, cards, HUD panels, betting UI, styles
  config/styles.json     Playstyle numbers for each fly
  scripts/simulate.mjs   Headless simulation of thousands of hands
  test/eval.test.mjs     Hand-ranking tests

GAMBA.py                 The first standalone draft of the betting API (6 seats).
                         Superseded by backend/main.py.
```

---

## Configuration

The API reads these environment variables. The defaults are set up for local play.

| Variable | Default | What it does |
| --- | --- | --- |
| `NUM_PLAYERS` | `5` | Seats at the table. Must match the number of flies. |
| `STARTING_BALANCE` | `100000` | New players' bankroll in cents ($1,000). `0` turns off free bankrolls and rebuys. |
| `NUM_NPCS` | `20` | Computer bettors at the table. `0` turns them off. |
| `NPC_WINDOW` | `10` | Seconds NPCs spread their bets over when the game doesn't say (the game sends its own window length). |
| `NPC_BANKROLL` | `100000` | An NPC's starting and refill bankroll in cents ($1,000). |
| `RAKE_BPS` | `500` | House rake in basis points (500 = 5%). |
| `ENGINE_API_KEY` | `dev-engine-key` | Key required to open, lock, settle or cancel rounds. |
| `DEV_MODE` | `1` | `1` enables the test deposit endpoint. |
| `CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Pages allowed to call the API. |
| `DB_PATH` | `betting.db` | SQLite database file. Delete it to reset all accounts and rounds. |

On macOS/Linux, set a variable inline: `RAKE_BPS=300 uvicorn main:app --port 8000`.
On Windows PowerShell: `$env:RAKE_BPS=300; uvicorn main:app --port 8000`.

---

## API

Interactive docs are at **http://127.0.0.1:8000/docs** while the API is running.

| Method | Path | Who calls it | Purpose |
| --- | --- | --- | --- |
| `POST` | `/users` | Game | Create a player with the starting bankroll |
| `GET` | `/users/{id}` | Game | Balance |
| `GET` | `/users/{id}/bets` | Game | Bet history |
| `POST` | `/users/{id}/rebuy` | Game | Refill an empty bankroll |
| `POST` | `/users/{id}/deposit` | Testing | Add funds (only when `DEV_MODE=1`) |
| `GET` | `/rounds/latest` | Game | Current round with pools and odds |
| `GET` | `/rounds/{id}` | Game | A specific round |
| `POST` | `/bets` | Game | Place a bet (`round_id`, `seat`, `amount` in cents) |
| `POST` | `/rounds` | Engine | Open a round with the fly names in seat order |
| `POST` | `/rounds/{id}/lock` | Engine | Close betting when the hand starts |
| `POST` | `/rounds/{id}/settle` | Engine | Pay out, given `winner_seats` |
| `POST` | `/rounds/{id}/cancel` | Engine | Refund everyone |

"Engine" endpoints need the `X-API-Key` header. Player endpoints identify the player with an `X-User-Id` header. Seat numbers are 1 to 5, in the same order as the flies: Vera, Buzz, Nib, Callie, Mani.

---

## Testing

```bash
# Betting API: payouts, ties, refunds, locked rounds, overdrafts, double settlement
cd backend
pytest -v

# Poker hand rankings (from the repo root)
node --test fly-poker/test/eval.test.mjs

# Headless simulation: thousands of hands, no browser
cd fly-poker
node scripts/simulate.mjs --hands 1000 --seeds 42,99
```

For manual testing, **http://127.0.0.1:5173/?dev=1** adds test controls to the page: new round, lock, settle with a chosen winner, cancel, and add $100.

`backend/simulate_engine.py` opens and settles rounds on a timer, for exercising the API without the game. Don't run it while playing, since the game already manages rounds itself.

---

## Troubleshooting

**Stuck on "Loading the poker room…"**
three.js couldn't be downloaded from `cdn.jsdelivr.net`. Check your internet connection and any ad-blocker, then press F12 and look at the Console for the exact error.

**`Unexpected token '<<'` in the console**
A git merge left conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in a file. Search the project for `<<<<<<<` and resolve each one, or run `git merge --abort` if the merge is still in progress.

**Bet buttons say "Offline"**
The API isn't reachable. Check that `uvicorn` is running on port 8000 and that you opened the game on port 5173.

**Changes don't show up**
Hard-refresh with Ctrl+Shift+R (Cmd+Shift+R on a Mac). Browsers cache JavaScript modules aggressively.

**Start over with fresh accounts**
Stop the API, delete `backend/betting.db`, and start it again. To get a brand-new player in the browser, clear the site's local storage as well.

---

## Limitations

This is a hackathon project that uses **play money only**. It isn't built for real-money gambling, which is regulated in most places and would need licensing, age checks and responsible-gambling limits.

The API trusts an `X-User-Id` header instead of a real login. The browser also holds the engine key so it can open and settle rounds itself. Both are fine on your own machine, but they let anyone with access to the page change balances and results, so the API shouldn't be exposed publicly as it is.
