#!/usr/bin/env node
/**
 * Headless chip simulation. Steps the table only — no per-action logging,
 * and public state is read once per seed, not once per action.
 *
 *   node scripts/simulate.mjs --hands 1000 --seeds 42,99
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTable, dealHand, step, getPublicState } from "../src/contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FLY_IDS = ["vera", "buzz", "nib", "callie", "mani", "soni"];

function parseArgs(argv) {
  const args = { hands: 1000, seeds: [42, 99], maxSteps: 260, stack: 20000, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--hands") args.hands = Number(next());
    else if (a === "--seed") args.seeds = [Number(next())];
    else if (a === "--seeds") args.seeds = next().split(",").map(Number);
    else if (a === "--stack") args.stack = Number(next());
    else if (a === "--max-steps") args.maxSteps = Number(next());
    else if (a === "--out-dir") args.outDir = resolve(next());
    else if (a === "--quiet") args.quiet = true;
    else throw new Error(`Unknown arg ${a}`);
  }
  if (!Number.isFinite(args.hands) || args.hands < 1) throw new Error("--hands must be a positive integer");
  args.outDir = args.outDir || join(ROOT, "scripts", "results");
  return args;
}

function loadStyles() {
  return JSON.parse(readFileSync(join(ROOT, "config", "styles.json"), "utf8"));
}

function runSeed(seed, hands, maxSteps, startingStack) {
  const table = createTable({ seed, startingStack });
  const t0 = performance.now();
  let steps = 0;
  let dealt = 0;
  for (let h = 0; h < hands; h++) {
    dealHand(table);
    let guard = 0;
    let action = null;
    while (guard < maxSteps) {
      action = step(table);
      steps++;
      guard++;
      if (action == null || action.handEnded) break;
    }
    if (action == null) {
      // dealHand can settle an all-in blind hand itself; the next step is null.
      // A null with nobody left to deal is the real stop.
      const mid = getPublicState(table);
      if (!mid.canDeal) break;
      dealt++;
      continue;
    }
    if (!action.handEnded) throw new Error(`hand ${h + 1} did not finish in ${maxSteps} steps`);
    dealt++;
  }
  const pub = getPublicState(table);
  const bb = pub.blinds?.big || 10;
  const start = pub.startingStack;
  const rows = FLY_IDS.map((id) => {
    const seat = pub.seats.find((s) => s.id === id);
    const chips = seat.stack;
    const delta = chips - start;
    const played = seat.stats.handsPlayed;
    return {
      id,
      chips,
      delta,
      bb100: Math.round((delta / bb / dealt) * 1000) / 10,
      handsPlayed: played,
      handsWon: seat.stats.handsWon,
      entryRate: Math.round(seat.stats.vpip * 1000) / 1000,
    };
  });
  const ms = performance.now() - t0;
  return {
    seed,
    hands: dealt,
    requested: hands,
    bigBlind: bb,
    startingStack: start,
    ms: Math.round(ms),
    handsPerSec: Math.round((dealt / ms) * 1000),
    steps,
    rows,
  };
}

function markdown(styles, runs) {
  const lines = [
    "# Fruit-fly Hold'em — headless results",
    "",
    "Entry rate is the engine VPIP: preflop calls, bets, and raises divided by hands the fly was dealt in.",
    `Starting stack ${runs[0]?.startingStack ?? "?"} chips. bb/100 uses the table big blind (${runs[0]?.bigBlind ?? 10}).`,
    "",
    "## Styles",
    "",
    "| fly | vpip | pfr | aggression | bluff | foldToPressure | learnRate |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const id of FLY_IDS) {
    const s = styles[id];
    lines.push(`| ${id} | ${s.vpip} | ${s.pfr} | ${s.aggression} | ${s.bluff} | ${s.foldToPressure} | ${s.learnRate} |`);
  }
  lines.push("");
  for (const run of runs) {
    lines.push(`## Seed ${run.seed} — ${run.hands} hands`);
    lines.push("");
    lines.push(`${run.ms} ms, ${run.handsPerSec} hands/s, ${run.steps} steps. Starting stack ${run.startingStack}.`);
    lines.push("");
    lines.push("| fly | chips | delta | bb/100 | hands played | hands won | entry rate |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    const ordered = [...run.rows].sort((a, b) => b.chips - a.chips);
    for (const r of ordered) {
      lines.push(`| ${r.id} | ${r.chips} | ${r.delta} | ${r.bb100} | ${r.handsPlayed} | ${r.handsWon} | ${r.entryRate} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const styles = loadStyles();
  const runs = [];
  for (const seed of args.seeds) {
    const run = runSeed(seed, args.hands, args.maxSteps, args.stack);
    runs.push(run);
    if (!args.quiet) {
      const order = [...run.rows].sort((a, b) => b.delta - a.delta).map((r) => `${r.id}:${r.delta}`).join(" ");
      console.log(`seed ${run.seed} ${run.hands} hands in ${run.ms}ms (${run.handsPerSec}/s) ${order}`);
    }
  }
  const problems = [];
  for (const run of runs) {
    const chips = run.rows.map((r) => r.chips);
    for (const row of run.rows) {
      if (row.handsPlayed < args.hands) {
        problems.push(`seed ${run.seed} ${row.id} played ${row.handsPlayed}/${args.hands}`);
      }
    }
    if (new Set(chips).size !== chips.length) {
      problems.push(`seed ${run.seed} has tied chip counts: ${chips.join(",")}`);
    }
  }
  if (problems.length) {
    throw new Error(problems.join("; "));
  }
  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, "winrates.md"), markdown(styles, runs));
  if (!args.quiet) console.log(`wrote ${join(args.outDir, "winrates.md")}`);
}

main();
