"""Run with:  cd backend && pytest -v"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

ENGINE = {"X-API-Key": main.ENGINE_API_KEY}
NAMES = ["Vera", "Buzz", "Nib", "Callie", "Mani", "Soni"][: main.NUM_PLAYERS]


# ----------------------------------------------------------------- pure payout math
def bet(i, seat, amount):
    return {"id": i, "seat": seat, "amount": amount}


ODDS = [250, 400, 500, 800, 1200]   # decimal odds x100 for seats 1..5


def test_winning_bet_pays_stake_times_odds():
    bets = [bet(1, 1, 1000), bet(2, 2, 3000)]
    payouts, house = main.compute_payouts(bets, [1], ODDS)
    assert payouts == {1: 2500, 2: 0}
    assert house == 4000 - 2500


def test_lone_bettor_on_winner_still_wins():
    payouts, house = main.compute_payouts([bet(1, 3, 500)], [3], ODDS)
    assert payouts == {1: 2500} and house == -2000


def test_split_pot_uses_dead_heat_rule():
    bets = [bet(1, 1, 2000), bet(2, 2, 2000), bet(3, 3, 6000)]
    payouts, _ = main.compute_payouts(bets, [1, 2], ODDS)
    assert payouts == {1: 2500, 2: 4000, 3: 0}


@pytest.mark.parametrize("amounts", [(333, 777, 1001), (101, 103, 107), (999999, 1, 1)])
def test_money_is_conserved(amounts):
    bets = [bet(1, 1, amounts[0]), bet(2, 1, amounts[1]), bet(3, 2, amounts[2])]
    payouts, house = main.compute_payouts(bets, [1], ODDS)
    assert sum(payouts.values()) + house == sum(amounts)
    assert all(p >= 0 for p in payouts.values())


def test_odds_start_even_and_follow_win_rate():
    even = main.price_odds([0] * 5, 0, 500)
    assert len(set(even)) == 1 and even[0] == 476          # 5-way coin flip less a 5% margin
    skewed = main.price_odds([30, 10, 5, 3, 2], 50, 500)
    assert skewed == sorted(skewed)                         # most wins -> shortest price
    assert sum(1 / (o / 100) for o in skewed) > 1           # implied probabilities include the edge


# ----------------------------------------------------------------- API flow
@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "DEV_MODE", True)
    monkeypatch.setattr(main, "STARTING_BALANCE", 0)   # tests control balances via /deposit
    monkeypatch.setattr(main, "NUM_NPCS", 0)           # NPC bettors have their own tests below
    main.init_db()
    return TestClient(main.app)


def make_user(client, name, funds=10_000):
    uid = client.post("/users", json={"username": name}).json()["id"]
    client.post(f"/users/{uid}/deposit", json={"amount": funds})
    return uid


def new_round(client):
    r = client.post("/rounds", json={"players": NAMES}, headers=ENGINE)
    assert r.status_code == 200
    return r.json()["id"]


def place(client, uid, rid, seat, amount):
    return client.post("/bets", json={"round_id": rid, "seat": seat, "amount": amount},
                       headers={"X-User-Id": str(uid)})


def balance(client, uid):
    return client.get(f"/users/{uid}").json()["balance"]


def test_full_round_pays_winners_at_posted_odds(client):
    a, b = make_user(client, "a"), make_user(client, "b")
    rid = new_round(client)
    view = client.get(f"/rounds/{rid}").json()
    assert all(p["odds"] == 5.71 for p in view["players"])   # no history yet: even 6-way odds less the margin
    assert place(client, a, rid, 1, 1000).status_code == 200
    assert place(client, b, rid, 2, 3000).status_code == 200
    assert client.get(f"/rounds/{rid}").json()["players"][0]["pool"] == 1000

    assert client.post(f"/rounds/{rid}/lock", headers=ENGINE).status_code == 200
    res = client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE).json()
    assert res["outcome"] == "settled" and res["house_take"] == 4000 - 5710

    assert balance(client, a) == 10_000 - 1000 + 5710
    assert balance(client, b) == 10_000 - 3000


def test_odds_shorten_for_a_winning_player(client):
    for _ in range(5):
        rid = new_round(client)
        client.post(f"/rounds/{rid}/settle", json={"winner_seats": [2]}, headers=ENGINE)
    odds = [p["odds"] for p in client.get(f"/rounds/{new_round(client)}").json()["players"]]
    assert odds[1] < odds[0] == odds[2]


def withdraw(client, uid, rid, **body):
    return client.post(f"/rounds/{rid}/withdraw", json=body, headers={"X-User-Id": str(uid)})


def test_take_money_off_a_bet(client):
    u = make_user(client, "w")
    rid = new_round(client)
    place(client, u, rid, 1, 500)
    place(client, u, rid, 1, 2500)
    r = withdraw(client, u, rid, seat=1, amount=1000)
    assert r.status_code == 200 and r.json()["round"]["players"][0]["pool"] == 2000
    assert balance(client, u) == 10_000 - 2000
    assert withdraw(client, u, rid, seat=1, amount=5000).status_code == 400
    assert withdraw(client, u, rid, seat=2).status_code == 404


def test_clear_all_bets(client):
    u, other = make_user(client, "c"), make_user(client, "o")
    rid = new_round(client)
    place(client, u, rid, 1, 500)
    place(client, u, rid, 4, 2500)
    place(client, other, rid, 4, 1000)
    assert withdraw(client, u, rid).json()["withdrawn"] == 3000
    assert balance(client, u) == 10_000
    assert client.get(f"/rounds/{rid}").json()["total_pool"] == 1000   # other bettors untouched


def test_cannot_withdraw_after_lock(client):
    u = make_user(client, "lk")
    rid = new_round(client)
    place(client, u, rid, 1, 500)
    client.post(f"/rounds/{rid}/lock", headers=ENGINE)
    assert withdraw(client, u, rid).status_code == 409
    assert balance(client, u) == 10_000 - 500


def test_latest_round_endpoint(client):
    assert client.get("/rounds/latest").json() is None
    rid = new_round(client)
    assert client.get("/rounds/latest").json()["id"] == rid


def test_cannot_bet_more_than_balance(client):
    u = make_user(client, "poor", funds=500)
    rid = new_round(client)
    r = place(client, u, rid, 1, 1000)
    assert r.status_code == 400
    assert balance(client, u) == 500


def test_cannot_bet_after_lock(client):
    u = make_user(client, "late")
    rid = new_round(client)
    client.post(f"/rounds/{rid}/lock", headers=ENGINE)
    assert place(client, u, rid, 1, 1000).status_code == 409
    assert balance(client, u) == 10_000


def test_bet_limits_and_seat_validation(client):
    u = make_user(client, "edge")
    rid = new_round(client)
    assert place(client, u, rid, main.NUM_PLAYERS + 1, 1000).status_code == 422
    assert place(client, u, rid, 1, 50).status_code == 422          # below MIN_BET


def test_cannot_settle_twice(client):
    u = make_user(client, "dbl")
    rid = new_round(client)
    place(client, u, rid, 1, 1000)
    place(client, make_user(client, "other"), rid, 2, 1000)
    assert client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE).status_code == 200
    bal = balance(client, u)
    assert client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE).status_code == 409
    assert balance(client, u) == bal                                  # no double payout


def test_cancel_refunds_everyone(client):
    a, b = make_user(client, "a"), make_user(client, "b")
    rid = new_round(client)
    place(client, a, rid, 1, 1000)
    place(client, b, rid, 3, 2500)
    assert client.post(f"/rounds/{rid}/cancel", headers=ENGINE).status_code == 200
    assert balance(client, a) == 10_000 and balance(client, b) == 10_000


def test_engine_endpoints_require_key(client):
    assert client.post("/rounds", json={"players": NAMES}).status_code == 401
    assert client.post("/rounds", json={"players": NAMES}, headers={"X-API-Key": "nope"}).status_code == 401


def test_deposit_disabled_outside_dev(client, monkeypatch):
    uid = make_user(client, "x")
    monkeypatch.setattr(main, "DEV_MODE", False)
    assert client.post(f"/users/{uid}/deposit", json={"amount": 100}).status_code == 403


def test_cors_allows_the_ui_origin(client):
    r = client.options("/bets", headers={
        "Origin": "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-user-id,content-type",
    })
    assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"


# ----------------------------------------------------------------- NPC bettors
def with_npcs(monkeypatch, n=20, chance=1.0, window=0):
    monkeypatch.setattr(main, "NUM_NPCS", n)
    monkeypatch.setattr(main, "NPC_BET_CHANCE", chance)
    monkeypatch.setattr(main, "NPC_WINDOW", window)     # 0: every NPC bets the moment the round opens


def npc_balances(client):
    import sqlite3
    c = sqlite3.connect(main.DB_PATH)
    return dict(c.execute("SELECT id, balance FROM users WHERE npc IS NOT NULL").fetchall())


def test_npcs_bet_when_a_round_opens(client, monkeypatch):
    with_npcs(monkeypatch)
    view = client.get(f"/rounds/{new_round(client)}").json()
    assert sum(p["npcs"] for p in view["players"]) == 20       # every NPC bet, once
    assert view["total_pool"] == sum(p["pool"] for p in view["players"]) > 0
    assert len(npc_balances(client)) == 20


def test_no_npcs_when_disabled(client):
    view = client.get(f"/rounds/{new_round(client)}").json()
    assert view["total_pool"] == 0 and all(p["npcs"] == 0 for p in view["players"])


def test_npcs_are_paid_and_charged_like_anyone(client, monkeypatch):
    with_npcs(monkeypatch, n=10)
    rid = new_round(client)
    view = client.get(f"/rounds/{rid}").json()
    staked = main.NPC_BANKROLL * 10 - sum(npc_balances(client).values())
    assert staked == view["total_pool"]
    winner = max(view["players"], key=lambda p: p["pool"])        # a fly somebody backed
    client.post(f"/rounds/{rid}/lock", headers=ENGINE)
    client.post(f"/rounds/{rid}/settle", json={"winner_seats": [winner["seat"]]}, headers=ENGINE)
    paid = int(winner["pool"] * round(winner["odds"] * 100) // 100)
    assert paid > 0 and sum(npc_balances(client).values()) == main.NPC_BANKROLL * 10 - staked + paid


def test_npcs_do_not_touch_player_bets_or_the_player_count(client, monkeypatch):
    with_npcs(monkeypatch)
    u = make_user(client, "human")
    rid = new_round(client)
    assert place(client, u, rid, 1, 1000).status_code == 200
    assert client.get(f"/users/{u}/bets").json()[0]["amount"] == 1000
    assert len(client.get(f"/users/{u}/bets").json()) == 1


def test_busted_npcs_get_refilled(client, monkeypatch):
    with_npcs(monkeypatch, n=3, chance=0.0)
    new_round(client)
    import sqlite3
    c = sqlite3.connect(main.DB_PATH)
    c.execute("UPDATE users SET balance = 0 WHERE npc IS NOT NULL"); c.commit()
    new_round(client)
    assert set(npc_balances(client).values()) == {main.NPC_BANKROLL}


def test_cancel_refunds_npcs_too(client, monkeypatch):
    with_npcs(monkeypatch, n=5)
    rid = new_round(client)
    client.post(f"/rounds/{rid}/cancel", headers=ENGINE)
    assert set(npc_balances(client).values()) == {main.NPC_BANKROLL}


def test_odds_npcs_favour_the_favourite():
    import random
    random.seed(1)
    odds = [200, 800, 800, 800, 800]
    picks = [main.npc_pick_seat("odds", odds) for _ in range(2000)]
    assert picks.count(1) > picks.count(2) * 5 and picks.count(2) > 0
    spread = [main.npc_pick_seat("random", odds) for _ in range(2000)]
    assert all(300 < spread.count(s) < 500 for s in range(1, 6))


# ----------------------------------------------------------------- NPCs bet gradually
class Clock:
    """Stand-in for main.time so a test can move through the betting window."""
    def __init__(self):
        import time as real
        self.now = real.time()

    def time(self):
        return self.now


@pytest.fixture()
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(main, "time", c)
    return c


def npcs_in(client, rid):
    return sum(p["npcs"] for p in client.get(f"/rounds/{rid}").json()["players"])


def test_npc_bets_build_up_over_the_window(client, monkeypatch, clock):
    with_npcs(monkeypatch, n=20, window=10)
    rid = new_round(client)
    seen = [npcs_in(client, rid)]
    for _ in range(9):
        clock.now += 1.0
        seen.append(npcs_in(client, rid))
    assert seen[0] == 0                                     # nobody has bet the instant it opens
    assert seen == sorted(seen)                             # the count only ever goes up
    assert 0 < seen[4] < seen[-1] <= 20                     # still building halfway, most in by the end
    assert seen[-1] < 20 or seen[-2] < 20                   # some NPCs hold out for the last second


def test_every_waiting_npc_bets_when_betting_locks(client, monkeypatch, clock):
    with_npcs(monkeypatch, n=20, window=10)
    rid = new_round(client)
    clock.now += 5
    before = npcs_in(client, rid)
    assert client.post(f"/rounds/{rid}/lock", headers=ENGINE).status_code == 200
    assert before < npcs_in(client, rid) == 20             # chance is 1.0, so all 20 are in
    clock.now += 60
    assert npcs_in(client, rid) == 20                       # nothing more arrives after the lock


def test_unplaced_npc_bets_vanish_on_cancel_and_settle(client, monkeypatch, clock):
    with_npcs(monkeypatch, n=10, window=10)
    rid = new_round(client)
    clock.now += 3
    client.post(f"/rounds/{rid}/cancel", headers=ENGINE)
    clock.now += 60
    assert npcs_in(client, rid) == 0
    assert set(npc_balances(client).values()) == {main.NPC_BANKROLL}          # placed bets were refunded

    rid = new_round(client)
    client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE)
    import sqlite3
    assert sqlite3.connect(main.DB_PATH).execute("SELECT COUNT(*) FROM npc_plans WHERE round_id=?", (rid,)).fetchone()[0] == 0


def test_window_seconds_sets_how_long_npcs_take(client, monkeypatch, clock):
    with_npcs(monkeypatch, n=20, window=10)
    rid = client.post("/rounds", json={"players": NAMES, "window_seconds": 2}, headers=ENGINE).json()["id"]
    clock.now += 2.1
    assert npcs_in(client, rid) == 20


def test_npc_timing_leans_late_with_a_last_second_rush():
    import random
    random.seed(7)
    times = [main.npc_bet_time(10) for _ in range(4000)]
    assert min(times) >= 0 and max(times) <= 10
    assert sum(t > 9 for t in times) > 600                  # the last-second rush
    assert sum(t > 5 for t in times) > sum(t <= 5 for t in times)   # weighted toward the end
