import assert from "node:assert/strict";
import test from "node:test";
import { rankEntries } from "../js/ranking.js";

test("同じニックネームは高いスコアだけが残る", () => {
  const rows = rankEntries([
    { name: " アオイ ", score: "120", deck: "札", at: 20, _id: "a" },
    { name: "アオイ", score: 300, deck: "更新", at: 10, _id: "b" },
    { name: "ベン", score: 300, at: 5, _id: "c" },
    { name: "", score: 999 },
    { name: "無効", score: -1 },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.score]), [
    ["ベン", 300],
    ["アオイ", 300],
  ]);
  assert.equal(rows[0].at, 5);
});
