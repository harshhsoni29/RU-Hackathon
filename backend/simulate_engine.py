"""
Fake poker engine for testing the UI end to end. Standard library only.

    python simulate_engine.py              # loops forever
    python simulate_engine.py --rounds 3   # three rounds then stop

Each round: open betting -> wait -> lock -> "play" -> settle with a random winner.
Open http://127.0.0.1:5173/?dev=1 and place bets while it runs.
Replace this file with calls from your real game: same three POSTs.
"""
import argparse
import json
import random
import time
import urllib.request

API = "http://127.0.0.1:8000"
KEY = "dev-engine-key"


def post(path, body=None):
    req = urllib.request.Request(
        API + path, method="POST",
        data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": KEY},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=0, help="0 = forever")
    ap.add_argument("--bet-seconds", type=int, default=20)
    ap.add_argument("--play-seconds", type=int, default=8)
    ap.add_argument("--split-chance", type=float, default=0.1, help="chance of a 2-way tie")
    args = ap.parse_args()

<<<<<<< HEAD
    names = ["Vera", "Buzz", "Nib", "Callie", "Mani"]   # same order as fly-poker FLIES (seat = index + 1)
=======
    names = [f"Fly {i}" for i in range(1, 7)]
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
    n = 0
    while args.rounds == 0 or n < args.rounds:
        n += 1
        rnd = post("/rounds", {"players": names, "closes_at": time.time() + args.bet_seconds})
        rid = rnd["id"]
        print(f"[round {rid}] betting open for {args.bet_seconds}s")
        time.sleep(args.bet_seconds)

        post(f"/rounds/{rid}/lock")
        print(f"[round {rid}] locked, playing for {args.play_seconds}s")
        time.sleep(args.play_seconds)

        k = 2 if random.random() < args.split_chance else 1
<<<<<<< HEAD
        winners = sorted(random.sample(range(1, len(names) + 1), k))
=======
        winners = sorted(random.sample(range(1, 7), k))
>>>>>>> c7af6a3e8a555daa767f327cea922bd20eb90d12
        res = post(f"/rounds/{rid}/settle", {"winner_seats": winners})
        print(f"[round {rid}] winners {winners}: {res['outcome']}, house took {res['house_take']} cents")
        time.sleep(4)


if __name__ == "__main__":
    main()
