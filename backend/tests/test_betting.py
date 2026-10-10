"""Run with:  cd backend && pytest -v"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

ENGINE = {"X-API-Key": main.ENGINE_API_KEY}
NAMES = ["Vera", "Buzz", "Nib", "Callie", "Mani"][: main.NUM_PLAYERS]


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
    assert all(p["odds"] == 4.76 for p in view["players"])   # no history yet: even odds
    assert place(client, a, rid, 1, 1000).status_code == 200
    assert place(client, b, rid, 2, 3000).status_code == 200
    assert client.get(f"/rounds/{rid}").json()["players"][0]["pool"] == 1000

    assert client.post(f"/rounds/{rid}/lock", headers=ENGINE).status_code == 200
    res = client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE).json()
    assert res["outcome"] == "settled" and res["house_take"] == 4000 - 4760

    assert balance(client, a) == 10_000 - 1000 + 4760
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
