/**
 * Texas Hold'em ranking tests (node:test).
 *
 * Standard order, high to low (World Poker Tour / Pagat):
 * royal flush, straight flush, four of a kind, full house, flush, straight,
 * three of a kind, two pair, one pair, high card.
 * The wheel A-2-3-4-5 is a five-high straight. Suits never break ties.
 * Only the best five cards count.
 *
 * Cards are rank + suit codes: Ah Kd Tc 9s.
 *
 * Run: node --test fly-poker/test/eval.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FLIES } from "../src/contract.js";
import { parseCodes } from "../src/poker/cards.js";
import { applyAction, legalActions } from "../src/poker/betting.js";
import { CATEGORY, evaluate } from "../src/poker/evaluator.js";

const FLY_IDS = ["vera", "buzz", "nib", "callie", "mani"];

function hand(codes) {
  return evaluate(parseCodes(codes));
}

function beats(winner, loser) {
  return hand(winner).score > hand(loser).score;
}

function ties(a, b) {
  return hand(a).score === hand(b).score;
}

test("royal flush beats straight flush", () => {
  const royal = ["Ah", "Kh", "Qh", "Jh", "Th"];
  const straightFlush = ["Kh", "Qh", "Jh", "Th", "9h"];
  const steelWheel = ["Ah", "2h", "3h", "4h", "5h"];
  assert.equal(hand(royal).name, "royal flush");
  assert.ok(beats(royal, straightFlush));
  assert.ok(beats(straightFlush, steelWheel));
});

test("wheel A-2-3-4-5 is a straight, not high-card ace", () => {
  const wheel = ["Ah", "2d", "3c", "4s", "5h"];
  const ranked = hand(wheel);
  assert.equal(ranked.category, CATEGORY.STRAIGHT);
  assert.equal(ranked.slug, "wheel");
  assert.equal(ranked.name, "straight, five high");
  assert.ok(beats(wheel, ["Kh", "Kd", "Qc", "Js", "9d"]), "wheel should beat a pair of kings");
  assert.ok(beats(["6c", "5d", "4h", "3s", "2d"], wheel), "six-high straight should beat the wheel");
  assert.ok(beats(["As", "Kd", "Qh", "Jc", "Ts"], wheel), "broadway should beat the wheel");
  const wrap = ["Ah", "Kd", "Qc", "2s", "3c"];
  assert.equal(hand(wrap).slug, "high-card");
  assert.ok(beats(["6d", "6c", "4h", "5s", "9c"], wrap), "A-K-Q-2-3 does not wrap into a straight");
});

test("flush beats straight", () => {
  const flush = ["Ah", "Qh", "9h", "5h", "3h"];
  const straight = ["Kd", "Qc", "Jh", "Ts", "9c"];
  assert.equal(hand(flush).slug, "flush");
  assert.equal(hand(straight).slug, "straight");
  assert.ok(beats(flush, straight));
});

test("full house beats flush", () => {
  const fullHouse = ["Kc", "Kd", "Kh", "7s", "7d"];
  const flush = ["Ah", "Qh", "9h", "6h", "2h"];
  assert.equal(hand(fullHouse).slug, "full-house");
  assert.ok(beats(fullHouse, flush));
});

test("two pair kickers and paired-board kickers", () => {
  assert.ok(
    beats(["Ah", "Ad", "Kh", "Kd", "Qc"], ["As", "Ac", "Ks", "Kc", "Jd"]),
    "aces and kings with a queen kicker should beat a jack kicker",
  );
  assert.ok(
    beats(["Ah", "Ad", "5h", "5d", "2c"], ["Kh", "Kd", "Qh", "Qd", "Ac"]),
    "the higher pair should decide two pair before the kicker",
  );

  // Board is nines and fours with an ace. Hole king/queen do not play.
  const pairedBoard = ["9h", "9d", "4c", "4s", "Ah"];
  assert.ok(ties([...pairedBoard, "Kd", "3c"], [...pairedBoard, "Qh", "2d"]));

  // No higher board kicker, so the hole card plays.
  const lowBoard = ["9h", "9d", "4c", "4s", "2h"];
  assert.ok(beats([...lowBoard, "Kd", "3c"], [...lowBoard, "Qh", "5c"]));

  // Pair of aces on board. Queen kicker beats jack; the spare hole card does not.
  const acePair = ["As", "Ah", "8c", "5d", "2s"];
  assert.ok(beats([...acePair, "Kd", "Qh"], [...acePair, "Kc", "Jh"]));
  assert.ok(ties([...acePair, "Qh", "3c"], [...acePair, "Qd", "4c"]));
});

test("exact tie splits the same five-card hand", () => {
  const a = hand(["Ah", "Kd", "Qc", "Js", "9h"]);
  const b = hand(["Ad", "Kh", "Qs", "Jd", "9c"]);
  assert.equal(a.score, b.score);
  assert.equal(a.slug, b.slug);

  const board = ["As", "Kd", "Qc", "Jh", "9s"];
  assert.ok(ties([...board, "2c", "3d"], [...board, "4h", "8c"]));
});

test("board plays when hole cards do not improve", () => {
  const straightFlush = ["Kh", "Qh", "Jh", "Th", "9h"];
  const junk = ["2c", "3d"];
  const otherJunk = ["4s", "7c"];
  const played = hand([...straightFlush, ...junk]);
  assert.equal(played.slug, "straight-flush");
  assert.ok(ties([...straightFlush, ...junk], [...straightFlush, ...otherJunk]));

  const aceHigh = ["As", "Kd", "Qc", "Jh", "9s"];
  assert.ok(beats([...straightFlush, ...junk], [...aceHigh, ...otherJunk]));

  const quads = ["9h", "9d", "9c", "9s", "Ah"];
  const left = hand([...quads, "Kd", "2c"]);
  const right = hand([...quads, "Qh", "3s"]);
  assert.equal(left.slug, "quads");
  assert.equal(left.score, right.score);
});

test("cannot check when facing a bet", () => {
  const facing = seatState({ currentBet: 20, streetBet: 0 });
  const open = seatState({ currentBet: 0, streetBet: 0 });
  assert.ok(!legalActions(facing, 0).includes("check"));
  assert.ok(legalActions(facing, 0).includes("fold"));
  assert.ok(legalActions(facing, 0).includes("call"));
  assert.ok(legalActions(open, 0).includes("check"));
  assert.throws(() => applyAction(facing, 0, "check"), /check/);
});

test("contract.js includes fly ids vera, buzz, nib, callie, mani", () => {
  const ids = FLIES.map((fly) => fly.id);
  assert.deepEqual(ids, FLY_IDS);
});

function seatState({ currentBet, streetBet }) {
  return {
    currentBet,
    bigBlind: 2,
    minRaise: 2,
    button: 0,
    players: [
      {
        inHand: true,
        folded: false,
        allIn: false,
        stack: 200,
        streetBet,
        totalCommitted: streetBet,
        acted: false,
        raiseAllowed: true,
      },
    ],
  };
}
