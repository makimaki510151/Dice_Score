import {
  CARDS,
  DICE,
  HAND_START,
  TURN_COUNT,
  cardMap,
  dieMap,
  markName,
} from "./catalog.js";

function emptyBuff() {
  return { flat: 0, mult: 0, minV: null, advantage: false, bonus: 0 };
}

function shuffle(list, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function maxFaceValue(die) {
  return die.faces.reduce((max, face) => Math.max(max, face.v), 0);
}

function pushLog(run, text) {
  run.log.unshift(text);
  if (run.log.length > 10) run.log.pop();
}

export function createRun({ cardIds, dieIds, rng = Math.random }) {
  if (!cardIds?.length || !dieIds?.length) {
    throw new Error("カードとダイスが1つずつ必要です");
  }
  const uniqueCards = new Set(cardIds);
  const uniqueDice = new Set(dieIds);
  if (uniqueCards.size !== cardIds.length || uniqueDice.size !== dieIds.length) {
    throw new Error("同じカードやダイスは編成できません");
  }
  for (const id of cardIds) {
    if (!cardMap.has(id)) throw new Error(`不明なカード: ${id}`);
  }
  for (const id of dieIds) {
    if (!dieMap.has(id)) throw new Error(`不明なダイス: ${id}`);
  }

  const run = {
    rng,
    turnsTotal: TURN_COUNT,
    turnIndex: 0,
    phase: "prep",
    drawPile: shuffle(cardIds, rng),
    hand: [],
    spent: [],
    dice: dieIds.slice(),
    dieCursor: 0,
    score: 0,
    lastMark: null,
    combo: 0,
    seenMarks: [],
    bank: 0,
    nextBuff: emptyBuff(),
    history: [],
    log: [],
    turn: null,
  };
  beginTurn(run);
  return run;
}

function draw(run, count) {
  for (let i = 0; i < count; i += 1) {
    if (!run.drawPile.length) break;
    run.hand.push(run.drawPile.pop());
  }
}

function beginTurn(run) {
  if (run.turnIndex === 0) draw(run, HAND_START);
  else draw(run, 1);

  const dieId = run.dice[run.dieCursor % run.dice.length];
  run.dieCursor += 1;
  const buff = run.nextBuff;
  run.nextBuff = emptyBuff();
  run.turn = {
    dieId,
    face: null,
    flat: buff.flat,
    mult: 1 + buff.mult,
    bonus: buff.bonus,
    dieFlat: 0,
    dieMult: 0,
    dieBonus: 0,
    minV: buff.minV,
    advantage: buff.advantage,
    facePlus: 0,
    forceMark: null,
    wild: false,
    comboPlus: 0,
    breakCombo: false,
    plays: 0,
    maxPlays: 1,
    played: [],
  };
  run.phase = "prep";
  const die = dieMap.get(dieId);
  pushLog(run, `${die.name}の番`);
}

function currentDie(run) {
  return dieMap.get(run.turn.dieId);
}

export function currentMark(run) {
  const turn = run.turn;
  if (!turn) return null;
  if (turn.wild && run.lastMark) return run.lastMark;
  if (turn.forceMark) return turn.forceMark;
  return turn.face?.mark || null;
}

export function preview(run) {
  const turn = run.turn;
  if (!turn?.face) return null;
  let nextCombo = 0;
  const mark = currentMark(run);
  if (!turn.breakCombo && mark) {
    if (run.lastMark && (mark === run.lastMark || turn.wild)) nextCombo = run.combo + 1;
    else nextCombo = 1;
  }
  nextCombo += turn.comboPlus || 0;
  const comboMult = nextCombo >= 2 ? 1 + (nextCombo - 1) * 0.6 : 1;
  const raw = Math.max(0, turn.face.v + turn.flat + turn.dieFlat);
  const mult = Math.max(0, turn.mult + turn.dieMult);
  const bonus = turn.bonus + turn.dieBonus;
  const score = Math.max(0, Math.floor(raw * mult * comboMult + bonus));
  return { raw, mult, comboMult, bonus, score, mark, nextCombo };
}

function recomputePassive(run) {
  const turn = run.turn;
  const passive = currentDie(run).passive;
  turn.dieFlat = 0;
  turn.dieMult = 0;
  turn.dieBonus = 0;
  if (!passive || !turn.face) return;
  const value = turn.face.v;
  if (passive.type === "flat") turn.dieFlat += passive.value;
  if (passive.type === "bonusGe" && value >= passive.min) turn.dieBonus += passive.value;
  if (passive.type === "multGe" && value >= passive.min) turn.dieMult += passive.value;
}

function pickRaw(die, rng) {
  const index = Math.floor(rng() * die.faces.length);
  return { ...die.faces[index], faceIndex: index };
}

function applyFloor(run, value) {
  const floor = run.turn.minV || 0;
  return floor ? Math.max(value, floor) : value;
}

function commitRaw(run, raw) {
  const turn = run.turn;
  const face = { ...raw };
  face.v += turn.facePlus;
  face.v = applyFloor(run, face.v);
  if (turn.forceMark) face.mark = turn.forceMark;
  turn.face = face;
  recomputePassive(run);
}

function rollRaw(run, { advantage = false } = {}) {
  const die = currentDie(run);
  const rng = run.rng;
  let raw = pickRaw(die, rng);
  if (advantage) {
    const other = pickRaw(die, rng);
    if (other.v > raw.v) raw = other;
  }
  const passive = die.passive;
  if (passive?.type === "rerollBelow") {
    const projected = applyFloor(run, raw.v + run.turn.facePlus);
    if (projected < passive.min) raw = pickRaw(die, rng);
  }
  return raw;
}

function doRoll(run, { advantage = false } = {}) {
  const usedAdvantage = advantage || run.turn.advantage;
  run.turn.advantage = false;
  const raw = rollRaw(run, { advantage: usedAdvantage });
  commitRaw(run, raw);
  const die = currentDie(run);
  const mark = run.turn.face.mark ? markName(run.turn.face.mark) : "紋なし";
  pushLog(run, `${die.name} → ${run.turn.face.v}（${mark}）`);
}

export function cardPlayable(run, cardId) {
  const card = cardMap.get(cardId);
  if (!card || !run.hand.includes(cardId)) return false;
  if (run.phase !== "prep" && run.phase !== "rolled") return false;
  if (run.turn.plays >= run.turn.maxPlays) return false;
  if (run.phase === "prep" && card.timing === "after") return false;
  if (run.phase === "rolled" && card.timing === "before") return false;
  return true;
}

export function choiceKind(effect) {
  if (!effect) return null;
  if (effect.type === "chooseFace") return "face";
  if (effect.type === "chooseMark") return "mark";
  if (effect.type === "seq") {
    for (const child of effect.effects) {
      const kind = choiceKind(child);
      if (kind) return kind;
    }
  }
  return null;
}

function applyEffect(run, effect, choice) {
  const turn = run.turn;
  const die = currentDie(run);
  switch (effect.type) {
    case "seq":
      for (const child of effect.effects) applyEffect(run, child, choice);
      return;
    case "addFlat":
      turn.flat += effect.value;
      return;
    case "addMult":
      turn.mult += effect.value;
      return;
    case "reroll":
      doRoll(run);
      return;
    case "advantage":
      if (turn.face) doRoll(run, { advantage: true });
      else turn.advantage = true;
      return;
    case "setMin":
      turn.minV = Math.max(turn.minV || 0, effect.value);
      if (turn.face) turn.face.v = applyFloor(run, turn.face.v);
      recomputePassive(run);
      return;
    case "setFace": {
      if (!turn.face) return;
      const value = effect.value === "max" ? maxFaceValue(die) : effect.value;
      turn.face = { ...turn.face, v: value };
      recomputePassive(run);
      return;
    }
    case "addFace":
      if (!turn.face) return;
      turn.face = { ...turn.face, v: turn.face.v + effect.value };
      recomputePassive(run);
      return;
    case "setMark":
      turn.forceMark = effect.mark;
      if (turn.face) turn.face = { ...turn.face, mark: effect.mark };
      return;
    case "chooseMark":
      if (!choice?.mark) throw new Error("紋を選んでください");
      applyEffect(run, { type: "setMark", mark: choice.mark }, choice);
      return;
    case "chooseFace": {
      if (!turn.face) return;
      const index = choice?.faceIndex;
      const picked = die.faces[index];
      if (!picked) throw new Error("面を選んでください");
      const next = { ...picked, faceIndex: index };
      next.v += turn.facePlus;
      next.v = applyFloor(run, next.v);
      if (turn.forceMark) next.mark = turn.forceMark;
      turn.face = next;
      recomputePassive(run);
      return;
    }
    case "copyPrevValue": {
      const prev = run.history[run.history.length - 1];
      if (!turn.face) return;
      if (!prev) {
        turn.flat += 3;
        return;
      }
      turn.face = { ...turn.face, v: prev.v };
      recomputePassive(run);
      return;
    }
    case "copyPrevMark": {
      const prev = run.history[run.history.length - 1];
      if (!prev?.mark) {
        turn.flat += 2;
        return;
      }
      applyEffect(run, { type: "setMark", mark: prev.mark }, choice);
      return;
    }
    case "ifLe":
      if (turn.face && turn.face.v <= effect.max) applyEffect(run, effect.effect, choice);
      return;
    case "ifGe":
      if (turn.face && turn.face.v >= effect.min) applyEffect(run, effect.effect, choice);
      return;
    case "ifMark":
      if (currentMark(run) === effect.mark) applyEffect(run, effect.effect, choice);
      return;
    case "ifSameMark":
      if (currentMark(run) && currentMark(run) === run.lastMark) applyEffect(run, effect.effect, choice);
      return;
    case "ifOdd":
      if (turn.face && Math.abs(turn.face.v) % 2 === 1) applyEffect(run, effect.effect, choice);
      return;
    case "ifEven":
      if (turn.face && turn.face.v % 2 === 0) applyEffect(run, effect.effect, choice);
      return;
    case "ifNoMark":
      if (!currentMark(run)) applyEffect(run, effect.effect, choice);
      return;
    case "ifComboGe": {
      const projected = preview(run)?.nextCombo || 0;
      if (projected >= effect.count || run.combo >= effect.count) applyEffect(run, effect.effect, choice);
      return;
    }
    case "ifTurnGe":
      if (run.turnIndex + 1 >= effect.turn) applyEffect(run, effect.effect, choice);
      return;
    case "ifTurnEq":
      if (run.turnIndex + 1 === effect.turn) applyEffect(run, effect.effect, choice);
      return;
    case "ifLastTurn":
      if (run.turnIndex + 1 === run.turnsTotal) applyEffect(run, effect.effect, choice);
      return;
    case "ifMaxFace":
      if (turn.face && turn.face.v >= maxFaceValue(die)) {
        applyEffect(run, effect.effect, choice);
      } else if (effect.else) {
        applyEffect(run, effect.else, choice);
      }
      return;
    case "ifUniqueMarks":
      if (run.seenMarks.length >= effect.count) applyEffect(run, effect.effect, choice);
      return;
    case "buffNext":
      if (effect.flat) run.nextBuff.flat += effect.flat;
      if (effect.mult) run.nextBuff.mult += effect.mult;
      if (effect.minV) run.nextBuff.minV = Math.max(run.nextBuff.minV || 0, effect.minV);
      if (effect.advantage) run.nextBuff.advantage = true;
      if (effect.bonus) run.nextBuff.bonus += effect.bonus;
      return;
    case "extraPlay":
      turn.maxPlays += effect.value;
      return;
    case "setWild":
      turn.wild = true;
      return;
    case "addCombo":
      turn.comboPlus += effect.value;
      return;
    case "breakCombo":
      turn.breakCombo = true;
      return;
    case "addHalf":
      if (turn.face) turn.flat += Math.ceil(turn.face.v / 2);
      return;
    case "allFacesPlus":
      turn.facePlus += effect.value;
      if (turn.face) {
        turn.face = { ...turn.face, v: turn.face.v + effect.value };
        recomputePassive(run);
      }
      return;
    case "doubleFlat":
      turn.flat *= 2;
      turn.dieFlat *= 2;
      return;
    case "comboBonus":
      turn.bonus += run.combo * effect.per;
      return;
    case "stash":
      run.bank += effect.value;
      return;
    case "cashout":
      turn.bonus += run.bank * effect.mult;
      run.bank = 0;
      return;
    case "explode": {
      const extra = pickRaw(die, run.rng);
      turn.flat += extra.v;
      pushLog(run, `爆発で＋${extra.v}`);
      return;
    }
    case "flatPerPlay":
      turn.flat += turn.plays * effect.value;
      return;
    default:
      throw new Error(`未対応の効果: ${effect.type}`);
  }
}

export function playCard(run, cardId, choice = null) {
  if (!cardPlayable(run, cardId)) throw new Error("このカードはいま使えません");
  const card = cardMap.get(cardId);
  const kind = choiceKind(card.effect);
  if (kind === "mark" && !choice?.mark) throw new Error("紋を選んでください");
  if (kind === "face" && choice?.faceIndex == null) throw new Error("面を選んでください");
  applyEffect(run, card.effect, choice);
  run.turn.plays += 1;
  run.turn.played.push(cardId);
  run.hand = run.hand.filter((id) => id !== cardId);
  run.spent.push(cardId);
  pushLog(run, `${card.name}を使った`);
  return preview(run);
}

export function roll(run) {
  if (run.phase !== "prep") throw new Error("いまは振れません");
  doRoll(run);
  run.phase = "rolled";
  return preview(run);
}

export function lockTurn(run) {
  if (run.phase !== "rolled" || !run.turn?.face) throw new Error("まだ確定できません");
  const view = preview(run);
  run.score += view.score;
  if (!run.turn.breakCombo && view.mark) {
    run.lastMark = view.mark;
    run.combo = view.nextCombo;
    if (!run.seenMarks.includes(view.mark)) run.seenMarks.push(view.mark);
  } else {
    run.lastMark = null;
    run.combo = 0;
  }
  const die = currentDie(run);
  run.history.push({
    turn: run.turnIndex + 1,
    dieId: die.id,
    dieName: die.name,
    v: run.turn.face.v,
    mark: view.mark,
    score: view.score,
    cards: run.turn.played.slice(),
  });
  pushLog(run, `${view.score}点を確定`);
  if (run.turnIndex >= run.turnsTotal - 1) {
    run.phase = "gameover";
    run.turn = null;
    return { finished: true, gained: view.score, total: run.score };
  }
  run.turnIndex += 1;
  beginTurn(run);
  return { finished: false, gained: view.score, total: run.score };
}

export function upcomingDice(run, count = 3) {
  if (!run || run.phase === "gameover") return [];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(dieMap.get(run.dice[(run.dieCursor + i) % run.dice.length]));
  }
  return out;
}

export function faceOptions(run) {
  return currentDie(run).faces.map((item, faceIndex) => ({
    faceIndex,
    v: item.v,
    mark: item.mark,
  }));
}

export function knownEffectTypes() {
  const types = new Set();
  const walk = (effect) => {
    if (!effect) return;
    types.add(effect.type);
    if (effect.effect) walk(effect.effect);
    if (effect.else) walk(effect.else);
    if (effect.effects) effect.effects.forEach(walk);
  };
  for (const card of CARDS) walk(card.effect);
  return types;
}

export const HANDLED_EFFECTS = new Set([
  "seq",
  "addFlat",
  "addMult",
  "reroll",
  "advantage",
  "setMin",
  "setFace",
  "addFace",
  "setMark",
  "chooseMark",
  "chooseFace",
  "copyPrevValue",
  "copyPrevMark",
  "ifLe",
  "ifGe",
  "ifMark",
  "ifSameMark",
  "ifOdd",
  "ifEven",
  "ifNoMark",
  "ifComboGe",
  "ifTurnGe",
  "ifTurnEq",
  "ifLastTurn",
  "ifMaxFace",
  "ifUniqueMarks",
  "buffNext",
  "extraPlay",
  "setWild",
  "addCombo",
  "breakCombo",
  "addHalf",
  "allFacesPlus",
  "doubleFlat",
  "comboBonus",
  "stash",
  "cashout",
  "explode",
  "flatPerPlay",
]);

export { CARDS, DICE };
