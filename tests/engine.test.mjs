import assert from "node:assert/strict";
import test from "node:test";
import { CARDS, DICE, MARKS, catalogCounts, scoreGoal } from "../js/catalog.js";
import {
  HANDLED_EFFECTS,
  choiceKind,
  createRun,
  knownEffectTypes,
  lockTurn,
  playCard,
  preview,
  roll,
} from "../js/engine.js";
import { claimSoloUnlock, defaultSave, progress, sanitizeSave, toggleDeck } from "../js/save.js";

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

test("図鑑は100種類以上で、idが重複しない", () => {
  const counts = catalogCounts();
  assert.ok(counts.total >= 100, `total ${counts.total}`);
  assert.equal(counts.cards, CARDS.length);
  assert.equal(counts.dice, DICE.length);
  const ids = [...CARDS, ...DICE].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const die of DICE) {
    assert.ok(die.faces.length >= 4);
    for (const face of die.faces) {
      assert.equal(typeof face.v, "number");
      if (face.mark) assert.ok(MARKS.some((mark) => mark.id === face.mark));
    }
  }
});

test("すべてのカード効果が処理できる", () => {
  const used = knownEffectTypes();
  for (const type of used) assert.ok(HANDLED_EFFECTS.has(type), type);
});

test("初期デッキで8ターン回せる", () => {
  const run = createRun({
    cardIds: ["encourage"],
    dieIds: ["novice"],
    rng: rngFrom(1),
  });
  assert.equal(run.hand.length, 1);
  for (let turn = 0; turn < 8; turn += 1) {
    roll(run);
    if (run.hand.includes("encourage")) playCard(run, "encourage");
    const result = lockTurn(run);
    assert.equal(result.finished, turn === 7);
  }
  assert.ok(run.score > 0);
});

test("励ましは出目に2を足す", () => {
  const run = createRun({
    cardIds: ["encourage"],
    dieIds: ["novice"],
    rng: rngFrom(2),
  });
  roll(run);
  const before = preview(run).score;
  playCard(run, "encourage");
  assert.equal(preview(run).score, before + 2);
});

test("同じ紋が続くとコンボ倍率が上がる", () => {
  const run = createRun({
    cardIds: ["seal-en"],
    dieIds: ["en6"],
    rng: rngFrom(3),
  });
  roll(run);
  playCard(run, "seal-en");
  lockTurn(run);
  roll(run);
  const view = preview(run);
  assert.equal(view.mark, "en");
  assert.equal(view.nextCombo, 2);
  assert.equal(view.comboMult, 1.6);
});

test("面の選択で最大の目を選べる", () => {
  const run = createRun({
    cardIds: ["pickface"],
    dieIds: ["novice"],
    rng: rngFrom(4),
  });
  roll(run);
  assert.equal(choiceKind(CARDS.find((card) => card.id === "pickface").effect), "face");
  playCard(run, "pickface", { faceIndex: 5 });
  assert.equal(run.turn.face.v, 6);
});

test("目標スコアは解放のたびに上がり、1回の成功で1段だけ解放する", () => {
  const save = defaultSave();
  const first = progress(save);
  assert.equal(first.milestones, 0);
  assert.equal(first.finished, false);
  assert.ok(scoreGoal(1) > scoreGoal(0));
  const low = claimSoloUnlock(save, first.goal - 1);
  assert.equal(low.unlocked, false);
  assert.equal(save.ownedCards.length, 1);
  const high = claimSoloUnlock(save, first.goal);
  assert.equal(high.unlocked, true);
  assert.equal(save.ownedCards.length, 2);
  assert.equal(save.ownedDice.length, 2);
  assert.deepEqual(save.deckCards, [CARDS[0].id]);
  const again = claimSoloUnlock(save, save.bestSolo);
  assert.equal(again.unlocked, false);
  assert.equal(save.ownedCards.length, 2);
});

test("編成は10枚までで、同じものは入らない", () => {
  const save = defaultSave();
  save.ownedCards = CARDS.slice(0, 12).map((card) => card.id);
  for (const card of CARDS.slice(0, 12)) toggleDeck(save, "card", card.id);
  assert.equal(save.deckCards.length, 10);
  assert.equal(new Set(save.deckCards).size, 10);
  const dirty = sanitizeSave({
    ownedCards: ["encourage", "encourage", "missing"],
    deckCards: ["reroll"],
    bestSolo: 12.8,
  });
  assert.deepEqual(dirty.ownedCards, ["encourage"]);
  assert.deepEqual(dirty.deckCards, []);
  assert.equal(dirty.bestSolo, 12);
});

test("目標スコアは解放回数に合わせて単調に増える", () => {
  let prev = 0;
  for (let i = 0; i <= 61; i += 1) {
    const goal = scoreGoal(i);
    assert.ok(goal > prev);
    prev = goal;
  }
  assert.ok(scoreGoal(0) <= 24);
  assert.ok(scoreGoal(36) < 140);
  assert.ok(scoreGoal(54) < 260);
});

test("ダイスは編成順に出て、足りなければ先頭に戻る", () => {
  const run = createRun({
    cardIds: ["encourage"],
    dieIds: ["novice", "tetra"],
    rng: rngFrom(5),
  });
  assert.equal(run.turn.dieId, "novice");
  roll(run);
  lockTurn(run);
  assert.equal(run.turn.dieId, "tetra");
  roll(run);
  lockTurn(run);
  assert.equal(run.turn.dieId, "novice");
});
