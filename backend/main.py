"""
Poker betting backend template (FastAPI + SQLite)

Fixed-odds "who wins the hand" betting on the poker players (NUM_PLAYERS seats, default 6),
the way a sportsbook prices a poker broadcast:
  - When a round opens, the house posts decimal odds for every seat. They are priced from each
    player's smoothed win rate in past settled rounds, with a house margin (MARGIN_BPS) built in.
  - Odds are fixed for the whole round, so every bet knows its payout up front.
  - A winning bet pays stake x odds. A losing bet loses the stake.
  - Split pots use the dead-heat rule: with k winners, a winning bet pays stake x odds / k.
  - While betting is open, a bettor can take money off any bet or clear all of their bets.

All money is stored as integer cents and odds as integer hundredths. Never use floats for money.

Round lifecycle:   open  ->  locked  ->  settled
                     \\________________->  cancelled (refunds everyone)

Run:  uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
DB_PATH = os.getenv("DB_PATH", "betting.db")
ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "dev-engine-key")  # shared secret with poker engine
MARGIN_BPS = int(os.getenv("MARGIN_BPS", "500"))                # house margin in the odds, 500 = 5%
ODDS_PRIOR = 3                                                  # pseudo-wins per seat before history counts
ODDS_HISTORY = 200                                              # settled rounds used to price the odds
MIN_BET = 100                                                   # $1.00
MAX_BET = 1_000_000                                             # $10,000.00
NUM_PLAYERS = int(os.getenv("NUM_PLAYERS", "6"))                # seats at the table (the fly table seats 6)
STARTING_BALANCE = int(os.getenv("STARTING_BALANCE", "100000"))  # play-money bankroll for new players ($1,000); 0 = real-money mode
DEV_MODE = os.getenv("DEV_MODE", "1") == "1"                    # enables /deposit; set 0 in production
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8765,http://localhost:8765").split(",")

app = FastAPI(title="Poker Betting API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,          # the Fly Poker UI is served from :5173
    allow_methods=["*"],
    allow_headers=["*"],                 # X-User-Id, X-API-Key
)


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0)
);
CREATE TABLE IF NOT EXISTS rounds (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    status        TEXT NOT NULL DEFAULT 'open',      -- open|locked|settled|cancelled
    players       TEXT NOT NULL,                     -- JSON list of player names (seat = index+1)
    rake_bps      INTEGER NOT NULL,                  -- house margin built into the odds
    odds          TEXT,                              -- JSON list of decimal odds x100 per seat, fixed at open
    closes_at     REAL,                              -- optional unix ts: betting auto-closes
    winner_seats  TEXT,                              -- JSON list, set on settle
    house_take    INTEGER NOT NULL DEFAULT 0,
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id    INTEGER NOT NULL REFERENCES rounds(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    seat        INTEGER NOT NULL CHECK (seat >= 1),
    amount      INTEGER NOT NULL CHECK (amount > 0),
    payout      INTEGER,                             -- NULL until settled
    status      TEXT NOT NULL DEFAULT 'active',      -- active|won|lost|refunded
    created_at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_user  ON bets(user_id);
CREATE TABLE IF NOT EXISTS ledger (                  -- append-only audit trail
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    delta       INTEGER NOT NULL,
    kind        TEXT NOT NULL,                       -- deposit|bet|withdraw|payout|refund
    ref         TEXT,
    created_at  REAL NOT NULL
);
"""


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    if "odds" not in {c[1] for c in conn.execute("PRAGMA table_info(rounds)")}:
        conn.execute("ALTER TABLE rounds ADD COLUMN odds TEXT")
    conn.close()


@app.on_event("startup")
def _startup() -> None:
    init_db()


@contextmanager
def tx():
    """One atomic transaction. BEGIN IMMEDIATE serialises writers, which prevents
    double-spends and double-settlement races. Any exception rolls everything back."""
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def change_balance(conn, user_id: int, delta: int, kind: str, ref: str = "") -> None:
    """Move money in/out of a wallet and record it in the ledger."""
    cur = conn.execute(
        "UPDATE users SET balance = balance + ? WHERE id = ? AND balance + ? >= 0",
        (delta, user_id, delta),
    )
    if cur.rowcount == 0:
        raise HTTPException(400, "Insufficient funds or unknown user")
    conn.execute(
        "INSERT INTO ledger (user_id, delta, kind, ref, created_at) VALUES (?,?,?,?,?)",
        (user_id, delta, kind, ref, time.time()),
    )


# --------------------------------------------------------------------------- #
# Payout logic (pure functions -> easy to unit test)
# --------------------------------------------------------------------------- #
def pool_totals(bets: List[dict]) -> Dict[int, int]:
    totals = {seat: 0 for seat in range(1, NUM_PLAYERS + 1)}
    for b in bets:
        totals[b["seat"]] = totals.get(b["seat"], 0) + b["amount"]
    return totals


def price_odds(wins: List[float], hands: int, margin_bps: int) -> List[int]:
    """Decimal odds x100 per seat from win counts (split pots count 1/k per winner).
    A Laplace-style prior keeps early odds near even, and the margin makes the implied
    probabilities sum to 1 + margin, which is the house edge."""
    n = len(wins)
    probs = [(w + ODDS_PRIOR) / (hands + ODDS_PRIOR * n) for w in wins]
    return [max(101, int(10_000 / (p * (10_000 + margin_bps)) * 100)) for p in probs]


def compute_payouts(bets: List[dict], winner_seats: List[int], odds: List[int]):
    """
    bets: [{"id", "seat", "amount"}, ...], odds: decimal odds x100 per seat (seat = index + 1)
    Returns (payouts {bet_id: cents}, house_take_cents). house_take is negative when the house loses.
    """
    winners = set(winner_seats)
    payouts = {
        b["id"]: b["amount"] * odds[b["seat"] - 1] // (100 * len(winners)) if b["seat"] in winners else 0
        for b in bets
    }
    return payouts, sum(b["amount"] for b in bets) - sum(payouts.values())


def odds_for(conn, players: List[str]) -> List[int]:
    """Price a new round from the recent results of these players (matched by name)."""
    wins = {name: 0.0 for name in players}
    hands = 0
    for r in conn.execute("SELECT players, winner_seats FROM rounds WHERE status='settled' "
                          "ORDER BY id DESC LIMIT ?", (ODDS_HISTORY,)):
        names, seats = json.loads(r["players"]), json.loads(r["winner_seats"] or "[]")
        if sorted(names) != sorted(players) or not seats:
            continue
        hands += 1
        for s in seats:
            wins[names[s - 1]] += 1 / len(seats)
    return price_odds([wins[name] for name in players], hands, MARGIN_BPS)


# --------------------------------------------------------------------------- #
# Auth (replace with real auth)
# --------------------------------------------------------------------------- #
def require_engine_key(x_api_key: str = Header(default="")):
    """Only the poker engine may open/lock/settle rounds."""
    if x_api_key != ENGINE_API_KEY:
        raise HTTPException(401, "Invalid engine API key")


def current_user_id(x_user_id: int = Header(...)) -> int:
    """TODO: replace with JWT/session auth. Trusting a header is for development ONLY."""
    return x_user_id


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=40)


class Deposit(BaseModel):
    amount: int = Field(gt=0, description="cents")


class SetBalance(BaseModel):
    amount: int = Field(ge=0, description="cents")


class RoundCreate(BaseModel):
    players: List[str] = Field(min_length=NUM_PLAYERS, max_length=NUM_PLAYERS)
    closes_at: Optional[float] = Field(None, description="unix timestamp; betting auto-closes")


class BetCreate(BaseModel):
    round_id: int
    seat: int = Field(ge=1, le=NUM_PLAYERS)
    amount: int = Field(ge=MIN_BET, le=MAX_BET, description="cents")


class Withdraw(BaseModel):
    seat: Optional[int] = Field(None, ge=1, le=NUM_PLAYERS, description="omit to clear every seat")
    amount: Optional[int] = Field(None, gt=0, description="cents; omit to take the whole stake")


class SettleRequest(BaseModel):
    winner_seats: List[int] = Field(min_length=1, max_length=NUM_PLAYERS,
                                    description="seat numbers 1..NUM_PLAYERS; multiple on a split pot")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def get_round(conn, round_id: int):
    r = conn.execute("SELECT * FROM rounds WHERE id = ?", (round_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Round not found")
    return r


def round_view(conn, r) -> dict:
    bets = [dict(b) for b in conn.execute(
        "SELECT id, seat, amount FROM bets WHERE round_id = ?", (r["id"],))]
    pools = pool_totals(bets)
    players = json.loads(r["players"])
    odds = json.loads(r["odds"]) if r["odds"] else [None] * len(players)
    return {
        "id": r["id"],
        "status": r["status"],
        "closes_at": r["closes_at"],
        "winner_seats": json.loads(r["winner_seats"]) if r["winner_seats"] else None,
        "total_pool": sum(pools.values()),
        "players": [
            {"seat": s, "name": players[s - 1], "pool": pools.get(s, 0),
             "odds": odds[s - 1] / 100 if odds[s - 1] else None}
            for s in range(1, len(players) + 1)
        ],
    }


# --------------------------------------------------------------------------- #
# Users / wallet (dev helpers; wire these to your real account system)
# --------------------------------------------------------------------------- #
@app.post("/users")
def create_user(body: UserCreate):
    with tx() as conn:
        try:
            cur = conn.execute("INSERT INTO users (username) VALUES (?)", (body.username,))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Username taken")
        if STARTING_BALANCE > 0:
            change_balance(conn, cur.lastrowid, STARTING_BALANCE, "bonus", "starting bankroll")
        return {"id": cur.lastrowid, "username": body.username, "balance": STARTING_BALANCE}


@app.post("/users/{user_id}/rebuy")
def rebuy(user_id: int):
    """Play-money mode: a player who is out of chips (and has no bets in play) gets a fresh bankroll."""
    if STARTING_BALANCE <= 0:
        raise HTTPException(403, "Rebuys are disabled")
    with tx() as conn:
        u = conn.execute("SELECT balance FROM users WHERE id=?", (user_id,)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")
        if u["balance"] >= MIN_BET:
            raise HTTPException(409, "You still have chips to bet")
        if conn.execute("SELECT 1 FROM bets WHERE user_id=? AND status='active' LIMIT 1", (user_id,)).fetchone():
            raise HTTPException(409, "Wait for your bets to finish first")
        change_balance(conn, user_id, STARTING_BALANCE - u["balance"], "rebuy")
        return {"user_id": user_id, "balance": STARTING_BALANCE}


@app.post("/users/{user_id}/deposit")
def deposit(user_id: int, body: Deposit):
    """DEV ONLY. In production, credit balances from your payment provider's webhook."""
    if not DEV_MODE:
        raise HTTPException(403, "Deposits are disabled outside DEV_MODE")
    with tx() as conn:
        change_balance(conn, user_id, body.amount, "deposit")
        bal = conn.execute("SELECT balance FROM users WHERE id=?", (user_id,)).fetchone()[0]
        return {"user_id": user_id, "balance": bal}


@app.post("/users/{user_id}/set-balance")
def set_balance(user_id: int, body: SetBalance):
    """DEV ONLY. Testing shortcut: set the bankroll to an exact amount (bets in play are untouched)."""
    if not DEV_MODE:
        raise HTTPException(403, "Test money is disabled outside DEV_MODE")
    with tx() as conn:
        u = conn.execute("SELECT balance FROM users WHERE id=?", (user_id,)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")
        if body.amount != u["balance"]:
            change_balance(conn, user_id, body.amount - u["balance"], "deposit", "test reset")
        return {"user_id": user_id, "balance": body.amount}


@app.get("/users/{user_id}")
def get_user(user_id: int):
    with tx() as conn:
        u = conn.execute("SELECT id, username, balance FROM users WHERE id=?", (user_id,)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")
        return dict(u)


@app.get("/users/{user_id}/bets")
def user_bets(user_id: int):
    with tx() as conn:
        rows = conn.execute("SELECT * FROM bets WHERE user_id=? ORDER BY id DESC", (user_id,))
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Rounds: public read endpoints
# --------------------------------------------------------------------------- #
@app.get("/rounds/latest")
def latest_round():
    """The UI polls this to find the round it should show. Returns null before the first round."""
    with tx() as conn:
        r = conn.execute("SELECT * FROM rounds ORDER BY id DESC LIMIT 1").fetchone()
        return round_view(conn, r) if r else None


@app.get("/rounds/{round_id}")
def read_round(round_id: int):
    """Pools + live odds for the UI. Poll this, or add a WebSocket broadcast (see TODOs)."""
    with tx() as conn:
        return round_view(conn, get_round(conn, round_id))


# --------------------------------------------------------------------------- #
# Betting (users)
# --------------------------------------------------------------------------- #
def open_round(conn, round_id: int):
    r = get_round(conn, round_id)
    if r["status"] != "open":
        raise HTTPException(409, f"Betting closed (round is {r['status']})")
    if r["closes_at"] and time.time() >= r["closes_at"]:
        raise HTTPException(409, "Betting window has ended")
    return r


@app.post("/bets")
def place_bet(body: BetCreate, user_id: int = Depends(current_user_id)):
    with tx() as conn:
        r = open_round(conn, body.round_id)
        change_balance(conn, user_id, -body.amount, "bet", f"round:{body.round_id}")
        cur = conn.execute(
            "INSERT INTO bets (round_id, user_id, seat, amount, created_at) VALUES (?,?,?,?,?)",
            (body.round_id, user_id, body.seat, body.amount, time.time()),
        )
        bal = conn.execute("SELECT balance FROM users WHERE id=?", (user_id,)).fetchone()[0]
        return {"bet_id": cur.lastrowid, "balance": bal, "round": round_view(conn, r)}


@app.post("/rounds/{round_id}/withdraw")
def withdraw(round_id: int, body: Withdraw, user_id: int = Depends(current_user_id)):
    """While betting is open, take money back off your bets: part of one seat's stake,
    a whole seat, or (no seat) everything. Newest bets are trimmed first."""
    with tx() as conn:
        r = open_round(conn, round_id)
        sql, args = "SELECT id, amount FROM bets WHERE round_id=? AND user_id=?", [round_id, user_id]
        if body.seat is not None:
            sql += " AND seat=?"
            args.append(body.seat)
        bets = conn.execute(sql + " ORDER BY id DESC", args).fetchall()
        staked = sum(b["amount"] for b in bets)
        if not staked:
            raise HTTPException(404, "No bets to take back")
        want = staked if body.amount is None else body.amount
        if want > staked:
            raise HTTPException(400, "That is more than you have on it")

        left = want
        for b in bets:
            if not left:
                break
            take = min(left, b["amount"])
            if take == b["amount"]:
                conn.execute("DELETE FROM bets WHERE id=?", (b["id"],))
            else:
                conn.execute("UPDATE bets SET amount=amount-? WHERE id=?", (take, b["id"]))
            left -= take
        change_balance(conn, user_id, want, "withdraw", f"round:{round_id}")
        bal = conn.execute("SELECT balance FROM users WHERE id=?", (user_id,)).fetchone()[0]
        return {"withdrawn": want, "balance": bal, "round": round_view(conn, r)}


# --------------------------------------------------------------------------- #
# Round control (called by the poker engine)
# --------------------------------------------------------------------------- #
@app.post("/rounds", dependencies=[Depends(require_engine_key)])
def create_round(body: RoundCreate):
    """Engine calls this when a new hand/game is about to start; opens betting."""
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO rounds (players, rake_bps, odds, closes_at, created_at) VALUES (?,?,?,?,?)",
            (json.dumps(body.players), MARGIN_BPS, json.dumps(odds_for(conn, body.players)),
             body.closes_at, time.time()),
        )
        return round_view(conn, get_round(conn, cur.lastrowid))


@app.post("/rounds/{round_id}/lock", dependencies=[Depends(require_engine_key)])
def lock_round(round_id: int):
    """Engine calls this when cards are dealt / game begins; no more bets."""
    with tx() as conn:
        r = get_round(conn, round_id)
        if r["status"] != "open":
            raise HTTPException(409, f"Round is {r['status']}")
        conn.execute("UPDATE rounds SET status='locked' WHERE id=?", (round_id,))
        return round_view(conn, get_round(conn, round_id))


@app.post("/rounds/{round_id}/settle", dependencies=[Depends(require_engine_key)])
def settle_round(round_id: int, body: SettleRequest):
    """Engine calls this with the winning seat(s). Idempotent-safe: a round can only settle once."""
    if any(not (1 <= s <= NUM_PLAYERS) for s in body.winner_seats):
        raise HTTPException(422, f"Seats must be 1-{NUM_PLAYERS}")

    with tx() as conn:
        r = get_round(conn, round_id)
        if r["status"] in ("settled", "cancelled"):
            raise HTTPException(409, f"Round already {r['status']}")

        bets = [dict(b) for b in conn.execute(
            "SELECT id, user_id, seat, amount FROM bets WHERE round_id=?", (round_id,))]
        odds = json.loads(r["odds"]) if r["odds"] else odds_for(conn, json.loads(r["players"]))
        payouts, house_take = compute_payouts(bets, body.winner_seats, odds)

        winners = set(body.winner_seats)
        for b in bets:
            pay = payouts[b["id"]]
            status = "won" if b["seat"] in winners else "lost"
            conn.execute("UPDATE bets SET payout=?, status=? WHERE id=?", (pay, status, b["id"]))
            if pay > 0:
                change_balance(conn, b["user_id"], pay, "payout", f"round:{round_id}:bet:{b['id']}")

        conn.execute(
            "UPDATE rounds SET status='settled', winner_seats=?, house_take=? WHERE id=?",
            (json.dumps(sorted(winners)), house_take, round_id),
        )
        return {"outcome": "settled", "house_take": house_take,
                "round": round_view(conn, get_round(conn, round_id))}


@app.post("/rounds/{round_id}/cancel", dependencies=[Depends(require_engine_key)])
def cancel_round(round_id: int):
    """Game crashed / aborted: refund every stake."""
    with tx() as conn:
        r = get_round(conn, round_id)
        if r["status"] in ("settled", "cancelled"):
            raise HTTPException(409, f"Round already {r['status']}")
        for b in conn.execute(
                "SELECT id, user_id, amount FROM bets WHERE round_id=?", (round_id,)).fetchall():
            change_balance(conn, b["user_id"], b["amount"], "refund", f"round:{round_id}:bet:{b['id']}")
            conn.execute("UPDATE bets SET payout=?, status='refunded' WHERE id=?",
                         (b["amount"], b["id"]))
        conn.execute("UPDATE rounds SET status='cancelled' WHERE id=?", (round_id,))
        return round_view(conn, get_round(conn, round_id))


# --------------------------------------------------------------------------- #
# Poker engine integration
# --------------------------------------------------------------------------- #
# Option A (recommended): the poker engine calls the HTTP endpoints above:
#     POST /rounds            -> before the hand, with the 6 player names
#     POST /rounds/{id}/lock  -> when the hand starts
#     POST /rounds/{id}/settle {"winner_seats":[3]}  -> when the hand ends
#
# Option B: if both live in the same Python process, call the logic directly,
# e.g. from your game loop:
#
#     from main import tx, get_round, compute_payouts   # or refactor settle into a function
#
# TODO ideas:
#   - WebSocket broadcast of round_view() after every bet so the UI updates live
#   - Real auth (JWT) in current_user_id(); real payments in deposit()
#   - Per-user exposure limits, responsible-gambling limits, KYC/age checks
#   - Move to Postgres (use SELECT ... FOR UPDATE instead of BEGIN IMMEDIATE)
#   - Unit tests for compute_payouts (ties, single bettor, no winner bets, rounding)
