import {
  CARDS,
  DICE,
  DECK_LIMIT,
  MARKS,
  cardMap,
  dieMap,
  formatMult,
  markName,
  passiveText,
  rarityOf,
  timingLabel,
} from "./catalog.js";
import { sfx } from "./audio.js";
import {
  cardPlayable,
  choiceKind,
  createRun,
  faceOptions,
  lockTurn,
  playCard,
  preview,
  roll,
  upcomingDice,
} from "./engine.js";
import { deckLabel, fetchRanking, readRankCache, submitScore } from "./ranking.js";
import {
  claimSoloUnlock,
  deckReady,
  loadSave,
  moveDeckItem,
  normalizeNickname,
  progress,
  recordRankScore,
  toggleDeck,
  writeSave,
} from "./save.js";

const TUTORIAL = [
  "1回の挑戦は8ターンです。各ターンにダイスを1つ振り、得点を重ねます。",
  "カードは山札から引いて、1回の挑戦につき1枚ずつ使えます。振る前に使うものと、出目を見てから使うものがあります。",
  "同じ紋が続くとコンボが増えます。2連続で×1.6、その後は1段ごとに＋0.6です。同じ紋のダイスだけを並べると続きやすいです。",
  "ソロでは目標スコア以上で、新しいカードと新しいダイスを1つずつ入手できます。全部そろうとソロクリアです。ランキングでは解放は増えません。",
];

const state = {
  screen: "title",
  save: loadSave(),
  mode: "solo",
  run: null,
  result: null,
  modal: null,
  codex: { kind: "card", owned: "all" },
  rank: { rows: [], status: "idle", message: "" },
  rolling: false,
  busy: false,
  toast: "",
};

const app = document.querySelector("#app");
let rankToken = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function persist() {
  writeSave(state.save);
}

function setToast(text) {
  state.toast = text;
  render();
  clearTimeout(setToast.timer);
  setToast.timer = setTimeout(() => {
    if (state.toast === text) {
      state.toast = "";
      const node = document.querySelector(".toast");
      if (node) node.remove();
    }
  }, 2400);
}

function go(screen, { replace = false } = {}) {
  state.screen = screen;
  const hash = `#/${screen}`;
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  }
  if (screen === "rank") loadRank();
  render();
}

function screenFromHash() {
  const name = location.hash.replace(/^#\/?/, "") || "title";
  return ["title", "solo", "rank", "deck", "codex", "play", "result"].includes(name) ? name : "title";
}

function syncHash() {
  const screen = screenFromHash();
  if ((screen === "play" && !state.run) || (screen === "result" && !state.result)) state.screen = "title";
  else state.screen = screen;
  if (state.screen === "rank") loadRank();
  render();
}

function itemCards(kind) {
  return kind === "card" ? CARDS : DICE;
}

function render() {
  const view = {
    title: renderTitle,
    solo: renderSolo,
    rank: renderRank,
    deck: renderDeck,
    codex: renderCodex,
    play: renderPlay,
    result: renderResult,
  }[state.screen] || renderTitle;
  app.innerHTML = `${view()}${renderModal()}${state.toast ? `<p class="toast">${esc(state.toast)}</p>` : ""}`;
}

function renderTitle() {
  const info = progress(state.save);
  return `
    <main class="shell">
      <header class="brand">
        <div class="hanko">骰</div>
        <div>
          <p class="eyebrow">Dice Karte</p>
          <h1>ダイスカルテ</h1>
        </div>
      </header>
      <p class="lede">ダイスを振り、スキルカードで出目や紋を変えて、ハイスコアを目指す。ソロで札と骰を集め、ランキングではその編成のまま記録を残す。</p>
      ${info.finished ? `<p class="cleared">ソロモードクリア。解放した札と骰で、ランキングを更新できます。</p>` : ""}
      <div class="menu">
        <button class="action" data-act="go" data-screen="solo">ソロプレイ</button>
        <button class="action" data-act="go" data-screen="rank">ランキング</button>
        <button class="ghost" data-act="go" data-screen="deck">編成</button>
        <button class="ghost" data-act="go" data-screen="codex">図鑑</button>
      </div>
      <section class="panel">
        <p>ソロ最高 ${state.save.bestSolo} 点 / ランキング最高 ${state.save.bestRank} 点</p>
        <p>解放 ${info.owned} / ${info.total}</p>
        <button class="tiny" data-act="rules">ルール</button>
        <button class="tiny" data-act="mute">${state.save.mute ? "音を出す" : "音を消す"}</button>
      </section>
    </main>`;
}

function renderSolo() {
  const info = progress(state.save);
  const ready = deckReady(state.save);
  return `
    <main class="shell">
      ${nav("ソロプレイ")}
      ${info.finished ? `<p class="cleared">すべてのスキルカードとダイスを解放しました。ソロモードクリアです。</p>` : `
        <section class="panel goal">
          <div>
            <p class="eyebrow">目標スコア</p>
            <b>${info.goal}</b>
          </div>
          <div>
            <p>次のカード：${esc(info.nextCard?.name || "なし")}</p>
            <p>次のダイス：${esc(info.nextDie?.name || "なし")}</p>
          </div>
        </section>`}
      <div class="meter" aria-hidden="true"><span style="width:${(info.owned / info.total) * 100}%"></span></div>
      <p>解放 ${info.owned} / ${info.total}。最高 ${state.save.bestSolo} 点。カード ${state.save.deckCards.length}/${DECK_LIMIT}、ダイス ${state.save.deckDice.length}/${DECK_LIMIT}。</p>
      <p class="note">同じ紋のダイスだけを上から並べると、コンボが続きやすくなります。ダイスが8個未満なら、最後まで来ると先頭に戻ります。</p>
      <div class="menu">
        <button class="action" data-act="start" data-mode="solo" ${ready ? "" : "disabled"}>この編成ではじめる</button>
        <button class="ghost" data-act="go" data-screen="deck">編成を変える</button>
      </div>
      ${ready ? "" : `<p class="note">カードとダイスを、それぞれ1つ以上編成してください。</p>`}
    </main>`;
}

function renderRank() {
  const ready = deckReady(state.save);
  const rows = state.rank.rows.slice(0, 30);
  return `
    <main class="shell">
      ${nav("ランキング")}
      <p class="lede">ソロで解放したカードとダイスだけで挑戦します。記録はニックネームとともにオンラインのランキングへ残ります。同じニックネームは、高いスコアだけが残ります。</p>
      <label>ニックネーム
        <input class="nick" id="nick" maxlength="12" value="${esc(state.save.nickname)}" placeholder="1〜12文字">
      </label>
      <div class="menu">
        <button class="action" data-act="start" data-mode="rank" ${ready ? "" : "disabled"}>この編成で挑戦</button>
        <button class="ghost" data-act="go" data-screen="deck">編成</button>
      </div>
      <p>この端末の最高 ${state.save.bestRank} 点</p>
      ${state.rank.message ? `<p class="note">${esc(state.rank.message)}</p>` : ""}
      <section class="panel">
        <h2>オンラインランキング</h2>
        <button class="tiny" data-act="reload-rank">再読み込み</button>
        ${state.rank.status === "loading" ? `<p>読み込んでいます。</p>` : ""}
        ${rows.length ? `<ol class="rank-list">${rows.map((row, index) => `
          <li>
            <span>${index + 1}</span>
            <span><b>${esc(row.name)}</b><br><small>${esc(row.deck || "編成非公開")}</small></span>
            <span><b>${row.score}</b><br><small>${formatWhen(row.at)}</small></span>
          </li>`).join("")}</ol>` : `<p>${state.rank.status === "loading" ? "" : "まだ記録がありません。"}</p>`}
      </section>
    </main>`;
}

function renderDeck() {
  return `
    <main class="shell">
      ${nav("編成")}
      <p class="lede">カードは10枚、ダイスは10個まで。同じものは1つだけ入ります。カードは引く順がシャッフルされ、ダイスは上から順に出ます。</p>
      <div class="split">
        ${deckColumn("card", "スキルカード", state.save.ownedCards, state.save.deckCards)}
        ${deckColumn("die", "ダイス", state.save.ownedDice, state.save.deckDice)}
      </div>
    </main>`;
}

function deckColumn(kind, title, owned, deck) {
  const map = kind === "card" ? cardMap : dieMap;
  const ordered = [
    ...deck.map((id) => map.get(id)),
    ...itemCards(kind).filter((item) => owned.includes(item.id) && !deck.includes(item.id)),
  ];
  return `
    <section class="panel">
      <h2>${title} ${deck.length}/${DECK_LIMIT}</h2>
      <div class="chips">
        ${ordered.map((item) => {
          const on = deck.includes(item.id);
          const index = deck.indexOf(item.id);
          return `
            <div class="chip ${on ? "is-on" : ""}">
              <button data-act="toggle" data-kind="${kind}" data-id="${esc(item.id)}">
                <b>${on ? `${index + 1}. ` : ""}${esc(item.name)}</b><br>
                <small>${esc(item.desc)}</small>
              </button>
              ${kind === "die" && on ? `
                <div class="row-actions">
                  <button class="tiny" data-act="move" data-kind="die" data-id="${esc(item.id)}" data-dir="-1">上へ</button>
                  <button class="tiny" data-act="move" data-kind="die" data-id="${esc(item.id)}" data-dir="1">下へ</button>
                </div>` : ""}
            </div>`;
        }).join("")}
      </div>
    </section>`;
}

function renderCodex() {
  const kind = state.codex.kind;
  const owned = new Set(kind === "card" ? state.save.ownedCards : state.save.ownedDice);
  const items = itemCards(kind).filter((item) => {
    if (state.codex.owned === "have") return owned.has(item.id);
    if (state.codex.owned === "lack") return !owned.has(item.id);
    return true;
  });
  return `
    <main class="shell">
      ${nav("図鑑")}
      <div class="filters">
        <button class="tiny ${kind === "card" ? "is-active" : ""}" data-act="codex-kind" data-kind="card">カード ${CARDS.length}</button>
        <button class="tiny ${kind === "die" ? "is-active" : ""}" data-act="codex-kind" data-kind="die">ダイス ${DICE.length}</button>
        <button class="tiny ${state.codex.owned === "all" ? "is-active" : ""}" data-act="codex-owned" data-owned="all">すべて</button>
        <button class="tiny ${state.codex.owned === "have" ? "is-active" : ""}" data-act="codex-owned" data-owned="have">所持</button>
        <button class="tiny ${state.codex.owned === "lack" ? "is-active" : ""}" data-act="codex-owned" data-owned="lack">未解放</button>
      </div>
      <div class="codex-list">
        ${items.map((item) => renderCodexItem(kind, item, owned.has(item.id))).join("")}
      </div>
    </main>`;
}

function renderCodexItem(kind, item, have) {
  const index = itemCards(kind).findIndex((entry) => entry.id === item.id);
  const rarity = rarityOf(index);
  if (kind === "card") {
    return `
      <article class="card ${have ? "" : "locked"}">
        <p><span class="timing">${timingLabel(item.timing)}</span> <span class="rarity ${rarity.id}">${rarity.name}</span> ${have ? "" : "未解放"}</p>
        <h3>${esc(item.name)}</h3>
        <p>${esc(item.desc)}</p>
      </article>`;
  }
  const faces = item.faces.map((face) => `${face.v}${face.mark ? markName(face.mark) : ""}`).join(" / ");
  return `
    <article class="die-card ${have ? "" : "locked"}">
      <p><span class="rarity ${rarity.id}">${rarity.name}</span> ${have ? "" : "未解放"}</p>
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.desc)} ${esc(passiveText(item.passive))}</p>
      <p>${esc(faces)}</p>
    </article>`;
}

function renderPlay() {
  const run = state.run;
  if (!run) return renderTitle();
  const die = dieMap.get(run.turn.dieId);
  const view = preview(run);
  const spinning = state.rolling;
  const face = spinning ? null : run.turn.face;
  const mark = face?.mark ? markName(face.mark) : "—";
  const info = progress(state.save);
  return `
    <main class="table">
      <header class="play-top">
        <button class="tiny" data-act="ask-quit">中断</button>
        <div>
          <strong>${state.mode === "solo" ? "ソロ" : "ランキング"}</strong>
          ${run.turnIndex + 1} / ${run.turnsTotal}
          ${state.mode === "solo" && info.goal != null ? ` / 目標 ${info.goal}` : ""}
        </div>
        <div class="score-line">得点 <b>${run.score}</b>${run.bank ? `<br>預け ${run.bank}` : ""}</div>
      </header>
      <section class="stage">
        <p class="hint">${view?.nextCombo >= 2 ? `コンボ ${view.nextCombo}連続 ×${formatMult(view.comboMult)}` : "コンボはまだ続いていません"}</p>
        <div class="die-face ${spinning ? "is-rolling" : ""}" aria-live="polite">
          <span class="die-mark" data-die-mark>${esc(mark)}</span>
          <span class="die-value" data-die-value>${face ? face.v : "?"}</span>
        </div>
        <div>
          <strong>${esc(die.name)}</strong>
          <p class="note">${esc(die.desc)} ${esc(passiveText(die.passive))}</p>
        </div>
        <ul class="pips">${die.faces.map((pip) => `<li>${pip.v}${pip.mark ? esc(markName(pip.mark)) : ""}</li>`).join("")}</ul>
        <p class="math">${esc(mathLine(run))}</p>
        <p class="hint">${phaseHint(run)} このターンあと ${run.turn.maxPlays - run.turn.plays} 枚。</p>
        ${nextDiceMarkup(run)}
      </section>
      <section class="hand" aria-label="手札">
        ${run.hand.map((id, index) => renderSkill(run, id, index)).join("") || `<p class="note">手札がありません。</p>`}
      </section>
      <footer class="actions">
        <button class="action" data-act="roll" ${run.phase === "prep" && !state.rolling ? "" : "disabled"}>振る</button>
        <button class="action" data-act="lock" ${run.phase === "rolled" && !state.rolling ? "" : "disabled"}>確定</button>
      </footer>
      <ul class="log">${run.log.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    </main>`;
}

function renderSkill(run, id, index) {
  const card = cardMap.get(id);
  const playable = cardPlayable(run, id);
  const rarity = rarityOf(CARDS.findIndex((item) => item.id === id));
  return `
    <button class="skill ${playable ? "" : "is-dim"}" data-act="play" data-id="${esc(id)}">
      <header>
        <span class="timing">${timingLabel(card.timing)}</span>
        <span class="rarity ${rarity.id}">${rarity.name}</span>
      </header>
      <h3>${esc(card.name)}</h3>
      <p>${esc(card.desc)}</p>
      <span class="index">キー ${index + 1}</span>
    </button>`;
}

function phaseHint(run) {
  if (run.phase === "rolled") return "出目を見てカードを使い、確定する。";
  const ready = run.hand.some((id) => cardPlayable(run, id));
  return ready
    ? "振る前のカードを使ってから、ダイスを振る。"
    : "この手札は出目を見てから使えます。まずは振ってください。";
}

function nextDiceMarkup(run) {
  if (run.dice.length <= 1) return `<p class="hint">このダイスを、毎ターン振ります。</p>`;
  const upcoming = upcomingDice(run, Math.min(4, run.dice.length));
  return `<ul class="next-dice">${upcoming.map((next) => `<li>${esc(next.name)}</li>`).join("")}</ul>`;
}

function mathLine(run) {
  const view = preview(run);
  if (!view || !run.turn?.face) return "まだ出目がありません";
  const flat = run.turn.flat + run.turn.dieFlat;
  return `（${run.turn.face.v}＋${flat}）×${formatMult(view.mult)}×${formatMult(view.comboMult)}＋${view.bonus}＝${view.score}`;
}

function renderResult() {
  const result = state.result;
  if (!result) return renderTitle();
  const unlock = result.unlock;
  const gained = unlock?.unlocked;
  return `
    <main class="shell">
      <p class="eyebrow">${result.mode === "solo" ? "ソロの結果" : "ランキングの結果"}</p>
      <h1>${result.score}</h1>
      ${resultText(result)}
      ${gained ? rewardBlock(unlock) : ""}
      <ol class="history">
        ${result.history.map((turn) => `
          <li>
            <span>${turn.turn}</span>
            <span>${esc(turn.dieName)} ${turn.v}${turn.mark ? esc(markName(turn.mark)) : ""} ${turn.cards.map((id) => esc(cardMap.get(id)?.name || "")).filter(Boolean).join("、")}</span>
            <b>${turn.score}</b>
          </li>`).join("")}
      </ol>
      ${result.mode === "rank" ? `
        <label>ニックネーム
          <input class="nick" id="nick" maxlength="12" value="${esc(state.save.nickname)}" placeholder="1〜12文字">
        </label>
        ${result.rankNote ? `<p>${esc(result.rankNote)}</p>` : ""}
        <button class="action wide" data-act="submit" ${state.busy ? "disabled" : ""}>このスコアをランキングに残す</button>` : ""}
      <div class="menu">
        <button class="action" data-act="start" data-mode="${result.mode}">もう一度</button>
        <button class="ghost" data-act="go" data-screen="${result.mode === "rank" ? "rank" : "solo"}">戻る</button>
      </div>
    </main>`;
}

function resultText(result) {
  if (result.mode === "rank") return `<p>ランキングモードでは、カードとダイスは増えません。</p>`;
  const unlock = result.unlock;
  if (unlock?.unlocked && unlock.progress.finished) {
    return `<p class="cleared">目標 ${unlock.previousGoal} を超え、図鑑がすべて埋まりました。ソロモードクリアです。</p>`;
  }
  if (unlock?.unlocked) return `<p>目標 ${unlock.previousGoal} を超えました。次の目標は ${unlock.progress.goal} 点です。</p>`;
  if (unlock?.progress.finished) return `<p>ソロはクリア済みです。このスコアは最高点に記録されます。</p>`;
  const remain = unlock.progress.goal - result.score;
  return `<p>目標 ${unlock.progress.goal} まで、あと ${remain} 点です。</p>`;
}

function rewardBlock(unlock) {
  const blocks = [];
  if (unlock.reward.card) blocks.push(rewardArticle("card", unlock.reward.card));
  if (unlock.reward.die) blocks.push(rewardArticle("die", unlock.reward.die));
  return `<section class="split">${blocks.join("")}</section>`;
}

function rewardArticle(kind, item) {
  const deck = kind === "card" ? state.save.deckCards : state.save.deckDice;
  const inDeck = deck.includes(item.id);
  return `
    <article class="card">
      <p class="kicker">${kind === "card" ? "新しいスキルカード" : "新しいダイス"}</p>
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.desc)}</p>
      ${inDeck ? `<p>編成に入っています。</p>` : `<button class="tiny" data-act="equip" data-kind="${kind}">編成に入れる</button>`}
    </article>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "rules") {
    return dialog("ルール", `
      <p>1回は8ターン。ダイスは編成の上から出て、足りなければ最初に戻ります。</p>
      <p>カードはシャッフルして引き、使ったカードはその挑戦では戻りません。通常は1ターンに1枚です。</p>
      <p>得点は（出目＋加算）×倍率×コンボ倍率＋追加点です。同じ紋が2連続で×1.6、以降1段ごとに＋0.6されます。</p>
      <p>編成はカード10枚、ダイス10個まで。同じカードや同じダイスは入れられません。</p>
      <p>ソロの目標を超えると、未解放のカードとダイスを1つずつ入手します。すべて解放するとソロクリアです。種類は図鑑の配列に足すだけで増やせます。</p>
      <button class="action" data-act="close">閉じる</button>`);
  }
  if (state.modal.type === "tutorial") {
    const step = state.modal.step;
    return dialog("遊び方", `
      <p>${esc(TUTORIAL[step])}</p>
      <p>${step + 1} / ${TUTORIAL.length}</p>
      <button class="action" data-act="tutorial">${step === TUTORIAL.length - 1 ? "はじめる" : "次へ"}</button>`);
  }
  if (state.modal.type === "quit") {
    return dialog("中断しますか", `
      <p>この挑戦の得点は記録されません。</p>
      <button class="action" data-act="quit">中断する</button>
      <button class="ghost" data-act="close">続ける</button>`);
  }
  if (state.modal.type === "choice") return renderChoice();
  return "";
}

function renderChoice() {
  const card = cardMap.get(state.modal.cardId);
  if (state.modal.kind === "mark") {
    return dialog(card.name, `
      <p>${esc(card.desc)}</p>
      <div class="choice-grid">
        ${MARKS.map((mark) => `<button class="tiny" data-act="choose-mark" data-mark="${mark.id}" style="background:${mark.color};color:#1a120c">${mark.name}</button>`).join("")}
      </div>
      <button class="ghost" data-act="close">やめる</button>`);
  }
  const faces = faceOptions(state.run);
  return dialog(card.name, `
    <p>${esc(card.desc)}</p>
    <div class="choice-grid">
      ${faces.map((face) => `<button class="tiny" data-act="choose-face" data-index="${face.faceIndex}">${face.v}${face.mark ? esc(markName(face.mark)) : ""}</button>`).join("")}
    </div>
    <button class="ghost" data-act="close">やめる</button>`);
}

function dialog(title, body) {
  return `<div class="modal"><div class="dialog" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${body}</div></div>`;
}

function nav(title) {
  return `
    <header class="topbar">
      <button class="brand" data-act="go" data-screen="title">
        <span class="hanko">骰</span>
        <span><span class="eyebrow">ダイスカルテ</span><br><strong>${esc(title)}</strong></span>
      </button>
      <button class="tiny" data-act="mute">${state.save.mute ? "音オフ" : "音オン"}</button>
    </header>`;
}

function formatWhen(at) {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function start(mode) {
  if (!deckReady(state.save) || state.rolling) return;
  if (mode === "solo" && !state.save.tutorialSeen) {
    state.mode = mode;
    state.modal = { type: "tutorial", step: 0 };
    render();
    return;
  }
  begin(mode);
}

function begin(mode) {
  state.mode = mode;
  state.modal = null;
  state.result = null;
  state.run = createRun({ cardIds: state.save.deckCards.slice(), dieIds: state.save.deckDice.slice() });
  sfx(state.save.mute, "click");
  go("play");
}

async function doRoll() {
  const run = state.run;
  if (!run || run.phase !== "prep" || state.rolling || state.modal) return;
  state.rolling = true;
  render();
  const faces = dieMap.get(run.turn.dieId).faces;
  const timer = setInterval(() => {
    const face = faces[Math.floor(Math.random() * faces.length)];
    const value = document.querySelector("[data-die-value]");
    const mark = document.querySelector("[data-die-mark]");
    if (value) value.textContent = String(face.v);
    if (mark) mark.textContent = face.mark ? markName(face.mark) : "—";
  }, 60);
  await wait(480);
  clearInterval(timer);
  if (state.run !== run || run.phase !== "prep") {
    state.rolling = false;
    render();
    return;
  }
  roll(run);
  state.rolling = false;
  sfx(state.save.mute, "roll");
  render();
}

function doLock() {
  const run = state.run;
  if (!run || run.phase !== "rolled" || state.rolling || state.modal) return;
  const outcome = lockTurn(run);
  sfx(state.save.mute, "lock");
  if (!outcome.finished) {
    render();
    return;
  }
  const result = {
    mode: state.mode,
    score: run.score,
    history: run.history,
    bank: run.bank,
    unlock: null,
  };
  if (state.mode === "solo") {
    result.unlock = claimSoloUnlock(state.save, run.score);
    if (result.unlock.unlocked) sfx(state.save.mute, "unlock");
  } else {
    recordRankScore(state.save, run.score);
  }
  persist();
  state.result = result;
  state.run = null;
  go("result", { replace: true });
}

function playById(id, choice) {
  const run = state.run;
  if (!run || state.rolling) return;
  if (!cardPlayable(run, id)) {
    const card = cardMap.get(id);
    if (run.turn.plays >= run.turn.maxPlays) setToast("このターンに使える枚数を超えています");
    else if (run.phase === "prep" && card.timing === "after") setToast("出目を見てから使えます");
    else setToast("このカードはいま使えません");
    return;
  }
  const card = cardMap.get(id);
  const kind = choiceKind(card.effect);
  if (kind && !choice) {
    state.modal = { type: "choice", cardId: id, kind };
    render();
    return;
  }
  playCard(run, id, choice);
  state.modal = null;
  sfx(state.save.mute, "click");
  render();
}

function equip(kind) {
  const item = kind === "card" ? state.result?.unlock?.reward?.card : state.result?.unlock?.reward?.die;
  if (!item) return;
  const deck = kind === "card" ? state.save.deckCards : state.save.deckDice;
  if (deck.includes(item.id)) return;
  if (!toggleDeck(state.save, kind, item.id)) {
    setToast(kind === "card" ? "カードは10枚までです" : "ダイスは10個までです");
    return;
  }
  persist();
  sfx(state.save.mute, "click");
  render();
}

async function loadRank() {
  const token = ++rankToken;
  state.rank.rows = readRankCache();
  state.rank.status = "loading";
  if (state.screen === "rank") render();
  try {
    const rows = await fetchRanking();
    if (token !== rankToken) return;
    state.rank.rows = rows;
    state.rank.status = "ready";
    state.rank.message = "";
  } catch {
    if (token !== rankToken) return;
    state.rank.rows = readRankCache();
    state.rank.status = "error";
    state.rank.message = "いまオンラインのランキングを取得できません。表示は、この端末が前回読み込んだ一覧です。";
  }
  if (state.screen === "rank") render();
}

async function onSubmit() {
  const input = document.querySelector("#nick");
  const name = normalizeNickname(input ? input.value : state.save.nickname);
  if (!name) {
    setToast("ニックネームは1〜12文字で、記号を入れずに入力してください");
    return;
  }
  state.save.nickname = name;
  persist();
  state.busy = true;
  state.result.rankNote = "ランキングへ送信しています。";
  render();
  try {
    const outcome = await submitScore({
      name,
      score: state.result.score,
      deck: deckLabel(state.save),
    });
    if (outcome.status === "kept") {
      state.result.rankNote = `このニックネームの記録は ${outcome.score} 点で、今回以上です。`;
    } else {
      state.result.rankNote = outcome.status === "updated" ? "記録を更新しました。" : "ランキングに記録しました。";
    }
  } catch {
    state.result.rankNote = "ランキングに保存できませんでした。通信を確認して、もう一度押せます。";
  }
  state.busy = false;
  if (state.screen === "result") render();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.addEventListener("click", (event) => {
  const node = event.target.closest("[data-act]");
  if (!node) return;
  const act = node.dataset.act;
  if (act === "go") go(node.dataset.screen);
  if (act === "rules") {
    state.modal = { type: "rules" };
    render();
  }
  if (act === "close") {
    state.modal = null;
    render();
  }
  if (act === "mute") {
    state.save.mute = !state.save.mute;
    persist();
    render();
  }
  if (act === "start") start(node.dataset.mode);
  if (act === "tutorial") {
    if (state.modal.step < TUTORIAL.length - 1) state.modal.step += 1;
    else {
      state.save.tutorialSeen = true;
      persist();
      begin("solo");
      return;
    }
    render();
  }
  if (act === "toggle") {
    const kind = node.dataset.kind;
    const deck = kind === "card" ? state.save.deckCards : state.save.deckDice;
    if (!deck.includes(node.dataset.id) && deck.length >= DECK_LIMIT) {
      setToast(kind === "card" ? "カードは10枚までです" : "ダイスは10個までです");
      return;
    }
    toggleDeck(state.save, kind, node.dataset.id);
    persist();
    sfx(state.save.mute, "click");
    render();
  }
  if (act === "move") {
    moveDeckItem(state.save, node.dataset.kind, node.dataset.id, Number(node.dataset.dir));
    persist();
    render();
  }
  if (act === "codex-kind") {
    state.codex.kind = node.dataset.kind;
    render();
  }
  if (act === "codex-owned") {
    state.codex.owned = node.dataset.owned;
    render();
  }
  if (act === "roll") doRoll();
  if (act === "lock") doLock();
  if (act === "play") playById(node.dataset.id);
  if (act === "choose-mark") playById(state.modal.cardId, { mark: node.dataset.mark });
  if (act === "choose-face") playById(state.modal.cardId, { faceIndex: Number(node.dataset.index) });
  if (act === "ask-quit") {
    state.modal = { type: "quit" };
    render();
  }
  if (act === "quit") {
    state.run = null;
    state.modal = null;
    go(state.mode === "rank" ? "rank" : "solo");
  }
  if (act === "equip") equip(node.dataset.kind);
  if (act === "submit") onSubmit();
  if (act === "reload-rank") loadRank();
});

app.addEventListener("input", (event) => {
  if (event.target.id !== "nick") return;
  state.save.nickname = event.target.value;
  persist();
});

document.addEventListener("keydown", (event) => {
  if (state.screen !== "play" || state.modal || state.rolling) return;
  if (event.target.matches("input, textarea")) return;
  if (event.key === "Enter") {
    if (state.run?.phase === "prep") doRoll();
    else doLock();
  }
  if (/^[1-9]$/.test(event.key)) {
    const id = state.run?.hand[Number(event.key) - 1];
    if (id) playById(id);
  }
});

window.addEventListener("popstate", syncHash);
syncHash();
