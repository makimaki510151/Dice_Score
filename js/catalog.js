/**
 * ソロモードの図鑑。
 *
 * カードやダイスを増やすときは、それぞれの配列の末尾に追加する。
 * 並びが解放順で、先頭の1枚と1個だけが最初から所持している。
 * id はカード・ダイスを通じて一意にし、同じ id は編成に入れられない。
 * 新しい効果を足すときは engine.js の applyEffect に処理を追加する。
 * 目標スコアとソロクリア判定は配列の長さから自動で決まる。
 * 同じ紋が2連続するとコンボ倍率×1.6、以降1段ごとに＋0.6。
 */

export const TURN_COUNT = 8;
export const DECK_LIMIT = 10;
export const HAND_START = 3;

export const MARKS = [
  { id: "en", name: "炎", color: "#d84a32" },
  { id: "nami", name: "波", color: "#2f7eb8" },
  { id: "kaze", name: "風", color: "#1f9d78" },
  { id: "iwa", name: "岩", color: "#a56b3c" },
  { id: "hoshi", name: "星", color: "#d7a21a" },
  { id: "tsuki", name: "月", color: "#8d74c9" },
  { id: "kaminari", name: "雷", color: "#d9b423" },
  { id: "hana", name: "花", color: "#d45b93" },
  { id: "ken", name: "剣", color: "#5e6e86" },
  { id: "tate", name: "盾", color: "#6e7f92" },
];

const face = (v, mark = null) => ({ v, mark });

function seq(values, mark = null) {
  return values.map((v) => face(v, mark));
}

function range(from, to, mark = null) {
  const faces = [];
  for (let v = from; v <= to; v += 1) faces.push(face(v, mark));
  return faces;
}

function die(id, name, desc, faces, passive = null) {
  return { id, name, desc, faces, passive };
}

function card(id, name, desc, timing, effect) {
  return { id, name, desc, timing, effect };
}

const addFlat = (value) => ({ type: "addFlat", value });
const addMult = (value) => ({ type: "addMult", value });
const setMark = (mark) => ({ type: "setMark", mark });
const seqEff = (...effects) => ({ type: "seq", effects });
const buffNext = (patch) => ({ type: "buffNext", ...patch });

export const DICE = [
  die("novice", "見習いの六面", "1から6までが均等に出る、工房の基本ダイス。", range(1, 6)),
  die("steady", "手慣れた六面", "1が出ない。安定して点を積みやすい。", seq([2, 3, 3, 4, 4, 5])),
  die("tetra", "四方の賽", "目は小さいが、低い出目を狙うカードと相性がいい。", range(1, 4)),
  die("die-even", "偶数の立方", "偶数しか出ない。", seq([2, 2, 4, 4, 6, 6])),
  die("die-odd", "奇数の立方", "奇数ばかり。7まで届く。", seq([1, 3, 3, 5, 5, 7])),
  die("en6", "炎の六面", "すべての面が炎の紋。", range(1, 6, "en")),
  die("nami6", "波の六面", "すべての面が波の紋。", range(1, 6, "nami")),
  die("kaze6", "風の六面", "すべての面が風の紋。", range(1, 6, "kaze")),
  die("iwa6", "岩の六面", "出目はやや低めだが、すべて岩の紋。", seq([2, 3, 3, 4, 4, 5], "iwa")),
  die("hoshi6", "星の六面", "たまに大きな星が出る。", seq([1, 2, 3, 4, 6, 8], "hoshi")),
  die("tsuki6", "月の六面", "中くらいの月が続きやすい。", seq([2, 3, 3, 4, 5, 6], "tsuki")),
  die("rai6", "雷の六面", "小さい雷と、跳ねる雷が混ざる。", seq([1, 1, 3, 4, 6, 8], "kaminari")),
  die("hana6", "花の六面", "花の紋がそろう。", seq([2, 3, 4, 4, 5, 6], "hana")),
  die("ken6", "剣の六面", "7まで伸びる剣の紋。", seq([1, 3, 4, 5, 6, 7], "ken")),
  die("tate6", "盾の六面", "常に加算＋1。盾の紋。", seq([2, 2, 3, 4, 5, 5], "tate"), { type: "flat", value: 1 }),
  die("octa", "八角の目", "1から8まで。紋はない。", range(1, 8)),
  die("deca", "十の目盛", "1から10まで広く振れる。", range(1, 10)),
  die("twins", "双子の四", "4か5しか出ない。", seq([4, 4, 4, 4, 5, 5])),
  die("spike", "一か八か", "ほとんど小さいが、12が一つだけある。", seq([1, 1, 1, 1, 2, 12])),
  die("voidfull", "空と満", "0が混ざる代わりに、14がある。", seq([0, 0, 0, 7, 7, 14])),
  die("rise", "起伏", "低い目と高い目に分かれている。", seq([1, 1, 2, 5, 6, 6])),
  die("ennami", "炎波", "炎と波が交互に出る。", [face(3, "en"), face(4, "nami"), face(3, "en"), face(5, "nami"), face(5, "en"), face(6, "nami")]),
  die("kazehoshi", "風星", "風と星が交互に出る。", [face(2, "kaze"), face(4, "hoshi"), face(3, "kaze"), face(6, "hoshi"), face(5, "kaze"), face(7, "hoshi")]),
  die("grow", "育ちの目", "小さい目から、9まで段々伸びる。", seq([1, 2, 3, 5, 7, 9])),
  die("noble", "貴族の六", "3未満が出ない。", seq([3, 4, 4, 5, 5, 6])),
  die("tsukiiwa", "月岩", "月と岩が半々。", [face(3, "tsuki"), face(4, "iwa"), face(4, "tsuki"), face(5, "iwa"), face(5, "tsuki"), face(6, "iwa")]),
  die("raiken", "雷剣", "雷と剣。高い目が混ざる。", [face(2, "kaminari"), face(4, "ken"), face(5, "kaminari"), face(6, "ken"), face(7, "kaminari"), face(8, "ken")]),
  die("hanatate", "花盾", "花と盾が交互。", [face(3, "hana"), face(4, "tate"), face(4, "hana"), face(5, "tate"), face(5, "hana"), face(6, "tate")]),
  die("lucky8", "幸運の八", "4以上だけ。6以上なら追加点＋3。", seq([4, 4, 5, 5, 6, 6, 7, 8]), { type: "bonusGe", min: 6, value: 3 }),
  die("gambler", "博徒", "0が多いが、当たると大きい。", seq([0, 0, 1, 8, 10, 12])),
  die("prism", "虹の立方", "面ごとに紋が違う。", [face(2, "en"), face(3, "nami"), face(4, "kaze"), face(5, "iwa"), face(6, "hoshi"), face(7, "tsuki")]),
  die("calm", "静骰", "3から5だけ。常に加算＋1。", seq([3, 3, 4, 4, 5, 5]), { type: "flat", value: 1 }),
  die("heavy", "重ダイス", "6以上なら倍率＋0.5。", seq([4, 5, 5, 6, 6, 7, 7, 8]), { type: "multGe", min: 6, value: 0.5 }),
  die("die-ember", "残り火", "すべて炎。10まで届く。", seq([2, 3, 4, 6, 8, 10], "en")),
  die("tide", "満潮", "すべて波。高い目が混ざる。", seq([3, 3, 4, 5, 6, 8], "nami")),
  die("die-gale", "疾風骰", "3未満なら1回振り直す。すべて風。", seq([1, 3, 5, 5, 7, 9], "kaze"), { type: "rerollBelow", min: 3 }),
  die("crag", "断崖", "5以上だけ。常に加算＋2。すべて岩。", seq([5, 5, 5, 6, 6, 7], "iwa"), { type: "flat", value: 2 }),
  die("nova", "新星", "すべて星。12まで届く。", seq([2, 4, 6, 8, 10, 12], "hoshi")),
  die("eclipse", "月蝕", "0がある代わりに大きい月がある。", seq([0, 4, 4, 6, 8, 10], "tsuki")),
  die("bolt", "落雷", "小さい目と、9以上の雷。", seq([1, 2, 3, 9, 10, 11], "kaminari")),
  die("die-bloom", "満開", "5以上なら追加点＋3。すべて花。", seq([4, 4, 5, 5, 6, 8], "hana"), { type: "bonusGe", min: 5, value: 3 }),
  die("edge", "刃渡り", "すべて剣。9まで届く。", seq([3, 5, 6, 7, 8, 9], "ken")),
  die("aegis", "大盾", "常に加算＋2。すべて盾。", seq([4, 4, 4, 5, 6, 7], "tate"), { type: "flat", value: 2 }),
  die("gold12", "黄金の十二", "8以上なら倍率＋0.5。紋が巡る。", [face(4, "hoshi"), face(6, "en"), face(8, "tsuki"), face(8, "kaze"), face(10, "ken"), face(12, "kaminari")], { type: "multGe", min: 8, value: 0.5 }),
  die("chaos", "混沌", "0から15まで大きく散らばる。", [face(0, "en"), face(2, "nami"), face(5, "kaze"), face(9, "iwa"), face(11, "hoshi"), face(15, "kaminari")]),
  die("twinen", "双炎", "6以上の炎だけ。", seq([6, 6, 6, 7, 7, 8], "en")),
  die("twinnami", "双波", "5以上の波。9が混ざる。", seq([5, 5, 6, 6, 7, 9], "nami")),
  die("comet", "彗星", "6未満なら1回振り直す。すべて星。", seq([3, 6, 6, 9, 9, 12], "hoshi"), { type: "rerollBelow", min: 6 }),
  die("oath", "誓いの剣", "6以上の剣だけ。", seq([6, 6, 7, 7, 8, 10], "ken")),
  die("sanct", "聖域", "盾と月。5以上。", [face(5, "tate"), face(5, "tsuki"), face(6, "tate"), face(6, "tsuki"), face(7, "tate"), face(8, "tsuki")]),
  die("festival", "祭骰", "花と星。高い目が揃いやすい。", [face(4, "hana"), face(5, "hoshi"), face(6, "hana"), face(6, "hoshi"), face(7, "hana"), face(9, "hoshi")]),
  die("crown", "嵐冠", "雷と風。当たると非常に大きい。", [face(2, "kaminari"), face(5, "kaze"), face(8, "kaminari"), face(8, "kaze"), face(11, "kaminari"), face(14, "kaze")]),
  die("emperor", "帝の目", "紋はないが、常に加算＋3。6以上。", seq([6, 7, 8, 8, 9, 10]), { type: "flat", value: 3 }),
  die("die-blank", "無の立方", "紋がない高い目。常に加算＋2。", seq([7, 7, 7, 8, 8, 9]), { type: "flat", value: 2 }),
  die("world", "万象の目", "10以上なら倍率＋0.5。大きな目と紋が巡る。", [face(4, "en"), face(7, "nami"), face(9, "kaze"), face(11, "iwa"), face(13, "hoshi"), face(15, "tsuki"), face(17, "ken"), face(20, "kaminari")], { type: "multGe", min: 10, value: 0.5 }),
];

export const CARDS = [
  card("encourage", "励まし", "この出目に＋2。", "after", addFlat(2)),
  card("reroll", "振り直し", "このダイスを振り直す。", "after", { type: "reroll" }),
  card("brace", "下支え", "この出目は最低3になる。", "before", { type: "setMin", value: 3 }),
  card("seal-en", "炎の印章", "この出目の紋を炎にする。", "after", setMark("en")),
  card("seal-nami", "波の印章", "この出目の紋を波にする。", "after", setMark("nami")),
  card("seal-kaze", "風の印章", "この出目の紋を風にする。", "after", setMark("kaze")),
  card("stargaze", "星読み", "2回振って、高い出目を採用する。", "before", { type: "advantage" }),
  card("roundup", "切り上げ", "出目が2以下なら4にする。", "after", { type: "ifLe", max: 2, effect: { type: "setFace", value: 4 } }),
  card("peak", "高嶺", "出目が5以上なら＋3。", "after", { type: "ifGe", min: 5, effect: addFlat(3) }),
  card("chain", "連紋", "直前と同じ紋なら＋5。", "after", { type: "ifSameMark", effect: addFlat(5) }),
  card("ember", "火種", "次のダイスに加算＋2。", "after", buffNext({ flat: 2 })),
  card("double", "倍加", "このターンの倍率＋1。", "after", addMult(1)),
  card("pickface", "面の選択", "このダイスの好きな面を選ぶ。", "after", { type: "chooseFace" }),
  card("pickmark", "紋の選択", "好きな紋をこの出目に付ける。", "after", { type: "chooseMark" }),
  card("copyval", "写し身", "直前の出目の値にする。直前がなければ＋3。", "after", { type: "copyPrevValue" }),
  card("jackpot", "大吉", "このダイスの最大の目にする。", "after", { type: "setFace", value: "max" }),
  card("seal-iwa", "岩の印章", "紋を岩にして＋1。", "after", seqEff(setMark("iwa"), addFlat(1))),
  card("seal-tsuki", "月の印章", "紋を月にする。次の出目は最低4。", "after", seqEff(setMark("tsuki"), buffNext({ minV: 4 }))),
  card("seal-rai", "雷の印章", "紋を雷にして＋2。", "after", seqEff(setMark("kaminari"), addFlat(2))),
  card("seal-hana", "花の印章", "紋を花にして、コンボを1段進める。", "after", seqEff(setMark("hana"), { type: "addCombo", value: 1 })),
  card("seal-ken", "剣の印章", "紋を剣にする。出目が4以上なら倍率＋0.5。", "after", seqEff(setMark("ken"), { type: "ifGe", min: 4, effect: addMult(0.5) })),
  card("seal-tate", "盾の印章", "紋を盾にする。出目が3以下なら＋6。", "after", seqEff(setMark("tate"), { type: "ifLe", max: 3, effect: addFlat(6) })),
  card("half", "半増", "出目の半分（切り上げ）を加算する。", "after", { type: "addHalf" }),
  card("prepnext", "次への備え", "次のダイスは2回振って高い方を採用する。", "after", buffNext({ advantage: true })),
  card("reversal", "逆転", "出目が1以下なら6にして、さらに＋3。", "after", { type: "ifLe", max: 1, effect: seqEff({ type: "setFace", value: 6 }, addFlat(3)) }),
  card("plusone", "増目", "出目に＋1。ダイスの最大を超えてもよい。", "after", { type: "addFace", value: 1 }),
  card("blank", "無垢", "紋がなければ＋6。", "after", { type: "ifNoMark", effect: addFlat(6) }),
  card("wild", "野性", "この紋は直前の紋として扱い、コンボが続く。", "after", { type: "setWild" }),
  card("flurry", "連撃", "このターン、カードをもう1枚使える。", "both", { type: "extraPlay", value: 1 }),
  card("stash", "蓄え", "4点を預ける。放出するまで得点にならない。", "after", { type: "stash", value: 4 }),
  card("cashout", "放出", "預けた点を2倍して、このターンの追加点にする。", "after", { type: "cashout", mult: 2 }),
  card("explode", "爆発", "もう一度振り、その出目を加算する。紋は変わらない。", "after", { type: "explode" }),
  card("wavechain", "波乗り", "直前も今も波なら、倍率＋1.5。", "after", { type: "ifSameMark", effect: { type: "ifMark", mark: "nami", effect: addMult(1.5) } }),
  card("footing", "底力", "この出目は最低4になる。", "before", { type: "setMin", value: 4 }),
  card("perfect", "完璧", "このダイスの最大の目なら＋8。", "after", { type: "ifMaxFace", effect: addFlat(8) }),
  card("resonance", "共鳴", "ここまでのコンボ段数×3点。", "after", { type: "comboBonus", per: 3 }),
  card("opening", "初手", "最初のターンなら倍率＋1。", "after", { type: "ifTurnEq", turn: 1, effect: addMult(1) }),
  card("finale", "終幕", "最後のターンなら倍率＋2。", "after", { type: "ifLastTurn", effect: addMult(2) }),
  card("odd", "奇数の妙", "出目が奇数なら＋4。", "after", { type: "ifOdd", effect: addFlat(4) }),
  card("even", "偶数の安定", "出目が偶数なら＋3。次の出目は最低3。", "after", { type: "ifEven", effect: seqEff(addFlat(3), buffNext({ minV: 3 })) }),
  card("fourmarks", "四紋の儀", "これまでに4種類以上の紋が出ていれば＋12。", "after", { type: "ifUniqueMarks", count: 4, effect: addFlat(12) }),
  card("engrave", "面底上げ", "このロールの出目＋1。", "before", { type: "allFacesPlus", value: 1 }),
  card("mirror", "鏡映", "いま付いている加算を2倍にする。", "after", { type: "doubleFlat" }),
  card("pressure", "重圧", "紋を岩にして、倍率＋0.5。", "after", seqEff(setMark("iwa"), addMult(0.5))),
  card("flash", "閃光", "出目が6以上なら＋6。", "after", { type: "ifGe", min: 6, effect: addFlat(6) }),
  card("misfortune", "凶を吉に", "出目が2以下なら倍率＋2。", "after", { type: "ifLe", max: 2, effect: addMult(2) }),
  card("copymark", "写紋", "直前の紋を写す。直前がなければ＋2。", "after", { type: "copyPrevMark" }),
  card("sever", "断ち切り", "コンボを捨てて＋10。この出目は次へつながらない。", "after", seqEff({ type: "breakCombo" }, addFlat(10))),
  card("gold", "黄金", "＋2し、倍率＋0.5。", "after", seqEff(addFlat(2), addMult(0.5))),
  card("bloom", "開花", "紋を花にしてコンボを1段進め、＋2。", "after", seqEff(setMark("hana"), { type: "addCombo", value: 1 }, addFlat(2))),
  card("gale", "疾風", "紋を風にする。次のダイスに加算＋3。", "after", seqEff(setMark("kaze"), buffNext({ flat: 3 }))),
  card("starfall", "星落とし", "紋を星にする。出目が5以上なら＋5。", "after", seqEff(setMark("hoshi"), { type: "ifGe", min: 5, effect: addFlat(5) })),
  card("moonlit", "月下", "2回振って高い方を採用し、出目は最低3。", "before", seqEff({ type: "advantage" }, { type: "setMin", value: 3 })),
  card("thunderclap", "雷鳴", "紋を雷にして、もう一度振った出目を加算する。", "after", seqEff(setMark("kaminari"), { type: "explode" })),
  card("bladedance", "剣舞", "紋を剣にして、出目＋2。", "after", seqEff(setMark("ken"), { type: "addFace", value: 2 })),
  card("guard", "守護", "紋を盾にして、出目を最低5にする。", "after", seqEff(setMark("tate"), { type: "setMin", value: 5 })),
  card("lategame", "終盤", "6ターン目以降なら＋5。", "after", { type: "ifTurnGe", turn: 6, effect: addFlat(5) }),
  card("mastery", "連の極意", "コンボが3段以上なら倍率＋1.5。", "after", { type: "ifComboGe", count: 3, effect: addMult(1.5) }),
  card("allmarks", "万象", "好きな紋を付けて＋2。", "after", seqEff({ type: "chooseMark" }, addFlat(2))),
  card("followup", "追い打ち", "最大の目なら倍率＋1。そうでなければ＋2。", "after", { type: "ifMaxFace", effect: addMult(1), else: addFlat(2) }),
  card("layer", "重ね打ち", "このターンにすでに使ったカード1枚につき＋4。", "after", { type: "flatPerPlay", value: 4 }),
  card("afterglow", "余熱", "次のダイスに加算＋4、倍率＋0.25。", "after", buffNext({ flat: 4, mult: 0.25 })),
];

const markById = new Map(MARKS.map((mark) => [mark.id, mark]));
export const cardMap = new Map(CARDS.map((item) => [item.id, item]));
export const dieMap = new Map(DICE.map((item) => [item.id, item]));

export function markOf(id) {
  return id ? markById.get(id) || null : null;
}

export function markName(id) {
  return markOf(id)?.name || "なし";
}

export function passiveText(passive) {
  if (!passive) return "";
  switch (passive.type) {
    case "flat":
      return `常に加算＋${passive.value}。`;
    case "bonusGe":
      return `出目が${passive.min}以上なら追加点＋${passive.value}。`;
    case "multGe":
      return `出目が${passive.min}以上なら倍率＋${formatMult(passive.value)}。`;
    case "rerollBelow":
      return `出目が${passive.min}未満なら1回振り直す。`;
    default:
      return "";
  }
}

export function formatMult(value) {
  const n = Math.round(value * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function timingLabel(timing) {
  if (timing === "before") return "振る前";
  if (timing === "after") return "出目のあと";
  return "いつでも";
}

export function rarityOf(index) {
  if (index < 15) return { id: "basic", name: "初伝" };
  if (index < 35) return { id: "mid", name: "中伝" };
  if (index < 50) return { id: "high", name: "奥伝" };
  return { id: "secret", name: "秘伝" };
}

/**
 * 達成済みの解放回数から、次の目標スコアを決める。
 * 序盤は初期デッキでも届き、終盤は強い編成が要るカーブ。
 */
export function scoreGoal(milestones) {
  const n = Math.max(0, milestones);
  // 初期ダイスの平均点から始まり、炎ダイスでコンボが始まると一段上がる。
  // 新星と終幕が解放されたあとに、もう一段高い目標へ移る。
  if (n <= 5) return 22 + n * 2;
  if (n <= 12) return 54 + (n - 6) * 5;
  if (n <= 36) return Math.round(84 + (n - 12) * 1.7);
  if (n <= 54) return Math.round(148 + (n - 37) * 4);
  return 216 + (n - 54) * 3;
}

export function catalogCounts() {
  return {
    cards: CARDS.length,
    dice: DICE.length,
    total: CARDS.length + DICE.length,
  };
}
