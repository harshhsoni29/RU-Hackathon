# Fly Poker

## Run

From this folder:

```bash
python3 -m http.server 5173
```

Open http://127.0.0.1:5173/

Three.js loads from a CDN, so the first load needs a network connection. Drag to look around the room, scroll to zoom, right-drag to pan, and click a fly.
<<<<<<< HEAD

## Betting (merged into the main HUD)

There is one UI. Each fly has a column in the bottom dock: a **bet card** (live odds, amount backed, one-click Bet button) sits directly above the fly's name plate. Pick a chip size ($1 / $5 / $25 / $100) in the dock, then click Bet above the fly you want to back. Clicking the name plate still opens that fly's inspector.

Run the betting backend alongside the room:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000          # NUM_PLAYERS defaults to 5 (one seat per fly)
python simulate_engine.py             # optional: fake engine that opens/locks/settles rounds
```

Open http://127.0.0.1:5173/?dev=1 for test controls (new round, lock, settle). If the backend is offline the poker room still works and the bet buttons read "Offline".
=======
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
