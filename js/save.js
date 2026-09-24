import { CARDS, DICE, DECK_LIMIT, cardMap, dieMap, scoreGoal } from "./catalog.js";

export const SAVE_KEY = "dicekarte-save-v1";

export function defaultSave() {
  return {
    version: 1,
    ownedCards: [CARDS[0].id],
    ownedDice: [DICE[0].id],
    deckCards: [CARDS[0].id],
    deckDice: [DICE[0].id],
    bestSolo: 0,
    bestRank: 0,
    nickname: "",
    tutorialSeen: false,
    mute: false,
  };
}

function uniqueKnown(ids, map) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    if (typeof id !== "string" || seen.has(id) || !map.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function sanitizeSave(raw) {
  const save = defaultSave();
  if (!raw || typeof raw !== "object") return save;
  save.ownedCards = uniqueKnown(raw.ownedCards, cardMap);
  save.ownedDice = uniqueKnown(raw.ownedDice, dieMap);
  if (!save.ownedCards.includes(CARDS[0].id)) save.ownedCards.unshift(CARDS[0].id);
  if (!save.ownedDice.includes(DICE[0].id)) save.ownedDice.unshift(DICE[0].id);
  const ownedC = new Set(save.ownedCards);
  const ownedD = new Set(save.ownedDice);
  save.deckCards = uniqueKnown(raw.deckCards, cardMap).filter((id) => ownedC.has(id)).slice(0, DECK_LIMIT);
  save.deckDice = uniqueKnown(raw.deckDice, dieMap).filter((id) => ownedD.has(id)).slice(0, DECK_LIMIT);
  save.bestSolo = Math.max(0, Math.floor(Number(raw.bestSolo) || 0));
  save.bestRank = Math.max(0, Math.floor(Number(raw.bestRank) || 0));
  save.nickname = typeof raw.nickname === "string" ? raw.nickname.slice(0, 24) : "";
  save.tutorialSeen = Boolean(raw.tutorialSeen);
  save.mute = Boolean(raw.mute);
  return save;
}

export function loadSave(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(save, storage = globalThis.localStorage) {
  storage?.setItem(SAVE_KEY, JSON.stringify(save));
  return save;
}

export function progress(save) {
  const ownedC = new Set(save.ownedCards);
  const ownedD = new Set(save.ownedDice);
  const nextCard = CARDS.find((item) => !ownedC.has(item.id)) || null;
  const nextDie = DICE.find((item) => !ownedD.has(item.id)) || null;
  const milestones = Math.max(save.ownedCards.length, save.ownedDice.length) - 1;
  const finished = !nextCard && !nextDie;
  return {
    milestones,
    finished,
    nextCard,
    nextDie,
    goal: finished ? null : scoreGoal(milestones),
    owned: save.ownedCards.length + save.ownedDice.length,
    total: CARDS.length + DICE.length,
  };
}

export function claimSoloUnlock(save, score) {
  const value = Math.max(0, Math.floor(score) || 0);
  save.bestSolo = Math.max(save.bestSolo, value);
  const before = progress(save);
  if (before.finished || value < before.goal) {
    return { unlocked: false, score: value, progress: before };
  }
  const reward = { card: null, die: null };
  if (before.nextCard) {
    save.ownedCards.push(before.nextCard.id);
    reward.card = before.nextCard;
  }
  if (before.nextDie) {
    save.ownedDice.push(before.nextDie.id);
    reward.die = before.nextDie;
  }
  return {
    unlocked: true,
    score: value,
    reward,
    previousGoal: before.goal,
    progress: progress(save),
  };
}

export function recordRankScore(save, score) {
  const value = Math.max(0, Math.floor(score) || 0);
  save.bestRank = Math.max(save.bestRank, value);
  return value;
}

export function toggleDeck(save, kind, id) {
  const owned = kind === "card" ? save.ownedCards : save.ownedDice;
  const deck = kind === "card" ? save.deckCards : save.deckDice;
  if (!owned.includes(id)) return false;
  const index = deck.indexOf(id);
  if (index >= 0) {
    deck.splice(index, 1);
    return true;
  }
  if (deck.length >= DECK_LIMIT) return false;
  deck.push(id);
  return true;
}

export function moveDeckItem(save, kind, id, direction) {
  const deck = kind === "card" ? save.deckCards : save.deckDice;
  const index = deck.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= deck.length) return false;
  const [item] = deck.splice(index, 1);
  deck.splice(next, 0, item);
  return true;
}

export function normalizeNickname(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  const chars = [...text];
  if (chars.length < 1 || chars.length > 12) return null;
  if (/[*#/?&%\\<>]/.test(text)) return null;
  return text;
}

export function deckReady(save) {
  return save.deckCards.length > 0 && save.deckDice.length > 0;
}
