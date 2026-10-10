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


def test_single_winner_pari_mutuel():
    bets = [bet(1, 1, 1000), bet(2, 1, 3000), bet(3, 2, 6000)]
    payouts, house, outcome = main.compute_payouts(bets, [1], 500)
    assert outcome == "settled"
    assert payouts == {1: 2375, 2: 7125, 3: 0}   # 9500 distributable, split 1:3
    assert house == 500


def test_split_pot_shares_pool_equally_between_winning_seats():
    bets = [bet(1, 1, 2000), bet(2, 2, 2000), bet(3, 3, 6000)]
    payouts, house, _ = main.compute_payouts(bets, [1, 2], 0)
    assert payouts == {1: 5000, 2: 5000, 3: 0}
    assert house == 0


def test_no_bets_on_winner_refunds_everyone():
    bets = [bet(1, 1, 1000), bet(2, 2, 2000)]
    payouts, house, outcome = main.compute_payouts(bets, [5], 500)
    assert outcome == "refunded" and house == 0
    assert payouts == {1: 1000, 2: 2000}


def test_everyone_on_winner_refunds_without_rake():
    bets = [bet(1, 4, 1000), bet(2, 4, 2000)]
    payouts, _, outcome = main.compute_payouts(bets, [4], 500)
    assert outcome == "refunded"
    assert payouts == {1: 1000, 2: 2000}


@pytest.mark.parametrize("amounts", [(333, 777, 1001), (101, 103, 107), (999999, 1, 1)])
def test_money_is_conserved(amounts):
    bets = [bet(1, 1, amounts[0]), bet(2, 1, amounts[1]), bet(3, 2, amounts[2])]
    payouts, house, _ = main.compute_payouts(bets, [1], 500)
    assert sum(payouts.values()) + house == sum(amounts)
    assert all(p >= 0 for p in payouts.values())


def test_odds_display():
    pools = {1: 4000, 2: 6000, 3: 0, 4: 0, 5: 0}
    odds = main.current_odds(pools, 500)
    assert odds[1] == 2.38 and odds[2] == 1.58 and odds[3] is None


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


def test_full_round_pays_winners(client):
    a, b, c = (make_user(client, n) for n in "abc")
    rid = new_round(client)
    assert place(client, a, rid, 1, 1000).status_code == 200
    assert place(client, b, rid, 1, 3000).status_code == 200
    assert place(client, c, rid, 2, 6000).status_code == 200

    view = client.get(f"/rounds/{rid}").json()
    assert view["total_pool"] == 10_000
    assert view["players"][0]["pool"] == 4000

    assert client.post(f"/rounds/{rid}/lock", headers=ENGINE).status_code == 200
    res = client.post(f"/rounds/{rid}/settle", json={"winner_seats": [1]}, headers=ENGINE).json()
    assert res["outcome"] == "settled" and res["house_take"] == 500

    assert balance(client, a) == 10_000 - 1000 + 2375
    assert balance(client, b) == 10_000 - 3000 + 7125
    assert balance(client, c) == 10_000 - 6000


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
