import { CARDS, DICE, MARKS, scoreGoal } from "../js/catalog.js";
import { cardPlayable, createRun, faceOptions, lockTurn, playCard, preview, roll } from "../js/engine.js";

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneRun(run) {
  const rng = run.rng;
  run.rng = undefined;
  const copy = structuredClone(run);
  run.rng = rng;
  copy.rng = () => 0.85;
  return copy;
}

function choicesFor(run, cardId) {
  const card = CARDS.find((item) => item.id === cardId);
  const effect = JSON.stringify(card.effect);
  if (effect.includes("chooseFace")) {
    return faceOptions(run).map((face) => ({ faceIndex: face.faceIndex }));
  }
  if (effect.includes("chooseMark")) {
    const marks = new Set(MARKS.map((mark) => mark.id));
    if (run.lastMark) marks.add(run.lastMark);
    return [...marks].map((mark) => ({ mark }));
  }
  return [null];
}

function valueOf(run) {
  const view = run.phase === "rolled" && run.turn?.face ? preview(run) : null;
  let score = view ? view.score : 0;
  score += (run.nextBuff?.flat || 0) * 2.2;
  score += (run.nextBuff?.mult || 0) * 10;
  score += (run.nextBuff?.minV || 0) * 0.8;
  if (run.nextBuff?.advantage) score += 5;
  if ((run.turn?.maxPlays || 1) > 1) score += 6;
  if (view?.nextCombo >= 2) score += 8 + view.nextCombo * 4;
  else if (view?.mark) score += 3;
  if (run.turn?.advantage) score += 4;
  if (run.turn?.minV) score += run.turn.minV;
  return score;
}

function tryPlay(run) {
  const ids = run.hand.filter((id) => cardPlayable(run, id));
  let best = null;
  const before = valueOf(run);
  for (const id of ids) {
    for (const choice of choicesFor(run, id)) {
      const copy = cloneRun(run);
      try {
        playCard(copy, id, choice);
      } catch {
        continue;
      }
      const priority = valueOf(copy);
      if (!best || priority > best.priority) best = { id, choice, priority };
    }
  }
  if (!best || best.priority <= before + 0.5) return false;
  playCard(run, best.id, best.choice);
  return true;
}

export function playGreedy(cardIds, dieIds, seed) {
  const run = createRun({ cardIds, dieIds, rng: rngFrom(seed) });
  while (run.phase !== "gameover") {
    let guard = 0;
    while (tryPlay(run) && guard < 4) guard += 1;
    if (run.phase === "prep") roll(run);
    guard = 0;
    while (tryPlay(run) && guard < 4) guard += 1;
    lockTurn(run);
  }
  return run;
}

function average(cardIds, dieIds, n = 80) {
  let total = 0;
  const scores = [];
  for (let i = 0; i < n; i += 1) {
    const score = playGreedy(cardIds, dieIds, 1000 + i).score;
    scores.push(score);
    total += score;
  }
  scores.sort((a, b) => a - b);
  return {
    avg: Math.round(total / n),
    p30: scores[Math.floor(n * 0.3)],
    p50: scores[Math.floor(n * 0.5)],
  };
}

function avgFace(die) {
  return die.faces.reduce((sum, face) => sum + face.v, 0) / die.faces.length;
}

function deckAt(milestone) {
  const ownedC = CARDS.slice(0, milestone + 1);
  const ownedD = DICE.slice(0, milestone + 1);
  const dice = ownedD.slice().sort((a, b) => avgFace(b) - avgFace(a)).slice(0, 10);
  const prefer = ["finale", "double", "jackpot", "pickface", "mastery", "gold", "bloom", "thunderclap", "flurry", "layer", "afterglow", "explode", "moonlit", "perfect", "wild", "encourage", "stargaze", "chain"];
  const cards = [];
  for (const id of prefer) {
    if (ownedC.some((card) => card.id === id)) cards.push(id);
  }
  for (const card of ownedC) {
    if (!cards.includes(card.id)) cards.push(card.id);
  }
  return { cardIds: cards.slice(0, 10), dieIds: dice.map((die) => die.id) };
}

const flame = average(
  ["seal-en", "double", "finale", "jackpot", "flurry", "gold", "bloom", "mastery", "wild", "afterglow"],
  ["twinen", "die-ember", "en6", "emperor", "die-blank", "nova", "comet", "oath", "gold12", "world"],
  60,
);
console.log(`flame avg=${flame.avg} p30=${flame.p30} p50=${flame.p50}`);

const sample = playGreedy(
  ["seal-en", "double", "finale", "jackpot", "flurry", "gold", "bloom", "mastery", "wild", "afterglow"],
  ["twinen", "die-ember", "en6", "emperor", "die-blank", "nova", "comet", "oath", "gold12", "world"],
  1000,
);
console.log("sample", sample.score);
console.log(sample.history);

const steps = [0, 5, 10, 20, 30, 40, 52];
for (const step of steps) {
  const deck = deckAt(Math.min(step, CARDS.length - 1, DICE.length - 1));
  const stat = average(deck.cardIds, deck.dieIds, 60);
  const goal = scoreGoal(step);
  console.log(
    `m=${step} goal=${goal} avg=${stat.avg} p30=${stat.p30} p50=${stat.p50} beat30=${stat.p30 >= goal} cards=${deck.cardIds.join(",")} dice=${deck.dieIds.join(",")}`,
  );
}
