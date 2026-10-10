# Fly Poker

## Run

From this folder:

```bash
python3 -m http.server 5173
```

Open http://127.0.0.1:5173/

Three.js loads from a CDN, so the first load needs a network connection. Drag to look around the room, scroll to zoom, right-drag to pan, and click a fly.

## Betting (merged into the main HUD)

There is one UI. Each fly has a column in the bottom dock: a **bet card** sits directly above the fly's name plate. Pick a chip size ($1 / $5 / $25 / $100) in the dock, then click Bet above the fly you want to back. Clicking the name plate still opens that fly's inspector.

Betting is fixed-odds, like a sportsbook on a poker broadcast. When a betting window opens, the house posts decimal odds for each fly, priced from its recent win rate with a 5% margin. A winning bet pays stake × odds (a $5 bet at 3.98 returns $19.90). A losing bet loses the stake. Split pots use the dead-heat rule: the payout is divided by the number of winners. While the window is open, **−** takes one chip's worth off a fly and **Clear bets** returns everything.

Run the betting backend alongside the room:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload # NUM_PLAYERS defaults to 5 (one seat per fly)
python simulate_engine.py             # optional: fake engine that opens/locks/settles rounds
```

Open http://127.0.0.1:5173/?dev=1 for test controls (new round, lock, settle). If the backend is offline the poker room still works and the bet buttons read "Offline".
