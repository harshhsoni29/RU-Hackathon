# Hold'em verification

Standard high-poker order (Pagat / World Poker Tour): royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. The wheel A-2-3-4-5 is a five-high straight. Suits do not break ties. Only the best five cards play.

## Command

```
node --test /Users/joshua/hackruf26/fly-poker/test/eval.test.mjs
```

Node v24.1.0. Final run after `src/poker/evaluator.js`, `src/poker/betting.js`, and `src/contract.js` were on disk.

## Pass / fail

| | count |
| --- | ---: |
| pass | 9 |
| fail | 0 |
| cancelled | 0 |
| skipped | 0 |

## Cases

- Royal flush beats a king-high straight flush, which beats the steel wheel.
- Wheel A-2-3-4-5 is category straight (`slug` `wheel`, five-high). It beats a pair of kings, loses to a six-high straight and to broadway, and A-K-Q-2-3 stays high card.
- Flush beats straight.
- Full house beats flush.
- Two pair: queen kicker beats jack kicker; the higher pair wins before the kicker. On a paired board, the best five cards supply the kicker, and a spare hole card does not play.
- Same five ranks with different suits tie.
- A made board (king-high straight flush, or quad nines with the ace kicker) plays for both players.
- `legalActions` omits check when facing a bet and allows it when the street is unopened. `applyAction(..., "check")` throws while facing a bet.
- `FLIES` exported from `src/contract.js` is vera, buzz, nib, callie, mani, in that order. The id strings are defined in `src/brains/styles.js` and re-exported by the contract.

## Bugs fixed

None. Ranking and betting passed as implemented. The tests call `evaluate` (card ids from `parseCodes`), `legalActions`, and `applyAction`.

## Remaining failures

None.
