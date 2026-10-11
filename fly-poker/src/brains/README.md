# Fly circuits

These five agents are **connectome-inspired**. They are not a download of the Drosophila larval connectome and not Maxime Labonne's FlyWire chess model.

## What we did not load

- ChessFly / FlyNet ([mlabonne/chessfly](https://huggingface.co/mlabonne/chessfly), [space](https://huggingface.co/spaces/mlabonne/chessfly)) runs the adult FlyWire reconstruction: 138,639 neurons and about 15 million signed connections. Signs stay fixed; training learns a positive gain per synapse, plus an encoder and a decoder. Activity settles for 5 leaky steps. None of those weights are in this repo.
- The larval Biological Processing Unit ([arXiv:2507.10951](https://arxiv.org/abs/2507.10951)) embeds the whole larval wiring diagram as a frozen recurrent reservoir and trains only the input and output projections. That diagram is the Winding et al. 2023 connectome ([Science, doi:10.1126/science.add9330](https://doi.org/10.1126/science.add9330)): 3,016 neurons and 548,000 synapses, with sensory, internal, and descending/output pools. We did not fetch that adjacency matrix.

## What this circuit is

Each fly has the same 45-neuron sketch, built with a fixed seed (`20230310`) so the wiring never changes:

| Pool | Neurons | Role |
| --- | --- | --- |
| Sensory | 12 | Hand strength, pot odds, stack-to-pot, street, position, to-call, board heat, draws, opponent aggression, opponent VPIP, invested fraction, bluff window |
| Kenyon | 10 | Sparse fan-in of 3 sensory neurons each |
| Central | 10 | Recurrent pool. Odd-numbered central neurons are inhibitory and keep a frozen negative sign, standing in for the recurrent learning and action-selection loops Winding et al. describe |
| Descending | 8 | Reads central cells, plus a shortcut from Kenyon cells and a little recurrence |
| Motor | 5 | Fold, check, call, bet, raise |

Edges are sparse and directed. A central cell takes 2 Kenyon inputs, 2 other central inputs, and 1 descending feedback input. Descending cells take 2 central inputs, 1 other descending input, and 1 Kenyon shortcut. The motor layer reads every descending cell with a fixed random sign and magnitude. That is the whole graph. It is a toy of the sensory → recurrent core → descending readout motif, not a subgraph cut out of the published connectome.

Forward pass, 4 steps, leak 0.6:

```
pre = sensory_current + signed_gain * previous
h = (1 - leak) * h + leak * relu_bound(pre)
logits = W_read * descending
```

`relu_bound(x) = x / (1 + x)` for x > 0, else 0. The style bias (below) is added after the readout. Illegal actions are masked.

## Playstyles

Thresholds come from `fly-poker/config/styles.json` when that file exists, otherwise from `DEFAULT_STYLES` in `styles.js`. `createTable({ styles })` overrides both, field by field. `pfr` is capped at `vpip` because a preflop raise is a voluntary pot entry.

| Fly | Style | Idea |
| --- | --- | --- |
| Vera | Tight-aggressive | Few hands, raise the ones she plays, value-bet, fold the rest |
| Buzz | Loose-aggressive | Wider range, more bets and bluffs |
| Nib | Tight-passive | Nit. Very few hands, calls rather than raises, folds to heat |
| Callie | Loose-passive | Calling station. Many hands, calls too often, sticks around once invested |
| Mani | Maniac | Very wide, large sizes, high bluff rate |

The numeric knobs are VPIP, PFR, aggression (bet/raise versus call), bluff rate, and fold-to-pressure. Preflop entry uses the Chen formula (Bill Chen) as a percentile over all 1,326 starting hands. Postflop equity is a category-and-draw estimate, not a solver. Pot odds are `toCall / (pot + toCall)`, the comparison from David Sklansky's *The Theory of Poker*. Style names follow the usual TAG / LAG / nit / calling-station / maniac split (Harrington; online HUD stats VPIP, PFR, and aggression factor).

Hand ranks, evaluated separately in `src/poker/evaluator.js`, are standard high poker: royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card. The wheel (A-2-3-4-5) is a five-high straight. Broadway (A-K-Q-J-T) is the ace-high straight. Best five cards out of six or seven are used. Kickers break ties. Equal scores split the pot.

## Learning rule

`learnFromHand` runs at the end of every dealt hand. It does not emit canned text; the panel string is formatted from the deltas below.

1. **Reward.** `reward = tanh(chipsDelta / (8 * bigBlind))`, where `chipsDelta` is the stack after the pot is awarded minus the stack before blinds were posted.

2. **Synaptic gains.** Over the decisions this fly actually made, average the sensory+reservoir drive. For a reservoir edge, `gain += learnRate * reward * pre * post`. For a readout edge into the action they chose most often, `gain += learnRate * reward * pre`. Readout edges into the other actions move by `-0.35` times that. Gains clamp to `[0.02, 3]`. Signs never flip. If `learnRate` is 0 or the reward is 0, gains stay put.

3. **Opponent frequencies.** Actions seen while this fly was still in the hand increment counts (`hands`, `vpip`, `pfr`, `bets`, `raises`, `calls`, `folds`). Rates are smoothed with a prior of 8 hands centered on that opponent's starting style:

   `vpip = (priorVpip * 8 + vpipCount) / (8 + hands)`

   `aggression = (priorAgg * 8 + bets + raises) / (8 + bets + raises + calls + folds)`

   Those rates are sensory features on the next hand, and in a close pot-odds spot they move the fold/call logits directly: fold gets `(foldToPressure - 0.4) * 4 + (opponentAggression - 0.4) * 3.2`.

4. **Threshold nudges, inside a band.** VPIP and PFR stay at the loaded values. If the fly called into someone's bets or raises and lost, `foldToPressure` steps up by `learnRate * min(1, |chips| / (10 * bb)) * 0.35`; if it called and won, it steps down by the same amount. It stays within base ± 0.25. If the fly bet or raised, `aggression` steps up when it won chips and down when it lost them, inside base × `[0.5, 1.75]`. A bet or raise with equity under 0.45 counts as a bluff and nudges `bluff` by a smaller step, clamped to base ± 0.25.

The inspection record lists every non-zero opponent-rate change, the threshold changes, and the five largest gain changes, each with before, after, delta, and a why-string that quotes those numbers.
