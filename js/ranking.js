import { cardMap, dieMap } from "./catalog.js";

const ENDPOINT = "https://crudcrud.com/api/51d14abd63b34eb3b0a6aaead89b78b9/scores";
const CACHE_KEY = "dicekarte-rank-cache";

export function rankEntries(rows) {
  const best = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.name !== "string" || !row.name.trim()) continue;
    const score = Math.floor(Number(row.score));
    if (!Number.isFinite(score) || score < 0) continue;
    const entry = {
      _id: row._id,
      name: row.name.trim(),
      score,
      deck: typeof row.deck === "string" ? row.deck : "",
      at: Number(row.at) || 0,
    };
    const prev = best.get(entry.name);
    if (!prev || entry.score > prev.score) best.set(entry.name, entry);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
}

export function readRankCache(storage = globalThis.localStorage) {
  try {
    return rankEntries(JSON.parse(storage?.getItem(CACHE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function writeRankCache(rows, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {
    // 保存できなくてもランキング表示は続行する
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
      if (response.status >= 500 && attempt < 2) {
        await wait(500 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      await wait(500 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchRanking() {
  const response = await request(ENDPOINT);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`ranking ${response.status}`);
  const rows = rankEntries(await response.json());
  writeRankCache(rows);
  return rows;
}

export function deckLabel(save) {
  const cards = save.deckCards.map((id) => cardMap.get(id)?.name).filter(Boolean);
  const dice = save.deckDice.map((id) => dieMap.get(id)?.name).filter(Boolean);
  return `札 ${cards.join("・")} / 骰 ${dice.join("・")}`.slice(0, 180);
}

export async function submitScore({ name, score, deck }) {
  const value = Math.floor(Number(score));
  if (!name || !Number.isFinite(value) || value < 0 || value > 9999999) {
    throw new Error("記録できないスコアです");
  }
  let mine = null;
  try {
    const rows = await fetchRanking();
    mine = rows.find((row) => row.name === name) || null;
  } catch {
    mine = null;
  }
  if (mine && mine.score >= value) return { status: "kept", score: mine.score };
  const payload = { name, score: value, deck: deck || "", at: Date.now() };
  const response = await request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`submit ${response.status}`);
  return { status: mine ? "updated" : "created", score: value };
}
