// 問題の自動生成、解の探索、誤答の推定（仕様書 4.4、4.5）。

import { CONFIG } from './config.js?v=0.7.0';
import { eq, isInt, toNumber } from './frac.js?v=0.7.0';
import {
  vmul, vset, tsetK, tsetC, nmul, addGas, applySequence, isValidP, isLegalPlay, startState, measure, isMix,
} from './cards.js?v=0.7.0';

// ---- カードを作る ----
function weightedPick(list, rng) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of list) {
    r -= w;
    if (r < 0) return item;
  }
  return list[list.length - 1][0];
}

export function randomCardOfType(type, rng) {
  switch (type) {
    case 'vmul': { const [n, d] = rng.pick(CONFIG.VMUL_FACTORS); return vmul(n, d); }
    case 'vset': return vset(rng.pick(CONFIG.VOLUME_UNITS));
    case 'tset_k': return tsetK(rng.pick(CONFIG.TEMPS_K));
    case 'tset_c': return tsetC(rng.pick(CONFIG.TEMPS_K));
    case 'nmul': { const [n, d] = rng.pick(CONFIG.NMUL_FACTORS); return nmul(n, d); }
    case 'add': { const gas = rng.next() < 0.5 ? 'A' : 'B'; return addGas(gas, rng.pick(CONFIG.MIX.ADD_K)); }
    default: throw new Error('知らないカード ' + type);
  }
}

export function randomDecoy(stage, rng) {
  return randomCardOfType(weightedPick(CONFIG.STAGES[stage].decoys, rng), rng);
}

// その段階で出てくる可能性のあるカードをすべて並べる（おとり探しに使う）
function cardPool(stage) {
  const types = new Set(CONFIG.STAGES[stage].decoys.map(([t]) => t));
  CONFIG.STAGES[stage].patterns.forEach(([p]) => p.forEach((t) => types.add(t)));
  const pool = [];
  if (types.has('vmul')) CONFIG.VMUL_FACTORS.forEach(([n, d]) => pool.push(vmul(n, d)));
  if (types.has('vset')) CONFIG.VOLUME_UNITS.forEach((v) => pool.push(vset(v)));
  if (types.has('tset_k')) CONFIG.TEMPS_K.forEach((k) => pool.push(tsetK(k)));
  if (types.has('tset_c')) CONFIG.TEMPS_K.forEach((k) => pool.push(tsetC(k)));
  if (types.has('nmul')) CONFIG.NMUL_FACTORS.forEach(([n, d]) => pool.push(nmul(n, d)));
  if (types.has('add')) ['A', 'B'].forEach((g) => CONFIG.MIX.ADD_K.forEach((k) => pool.push(addGas(g, k))));
  return pool;
}

// ---- 出し方の総当たり ----
// 手札（null は空き）から、1〜FIELD_SIZE 枚の並び（温度カードは1枚まで）をすべて訪ねる
function forEachPlay(hand, visit, mustInclude = -1) {
  const idx = [];
  hand.forEach((c, i) => { if (c && c.type !== 'frost') idx.push(i); }); // 霜カードは出せない
  const seq = [];
  const rec = () => {
    if (seq.length > 0 && (mustInclude < 0 || seq.includes(mustInclude))) {
      const cards = seq.map((i) => hand[i]);
      if (isLegalPlay(cards)) visit(seq.slice(), cards);
    }
    if (seq.length === CONFIG.FIELD_SIZE) return;
    for (const i of idx) {
      if (seq.includes(i)) continue;
      seq.push(i);
      rec();
      seq.pop();
    }
  };
  rec();
}

// 目標にぴったり合う出し方の一覧と最少枚数
// goal：目標の種類（'P' 全圧、'A'・'B' 分圧。v0.7〜）
export function enumerateSolutions(state, hand, target, goal = 'P') {
  const solutions = [];
  let minCount = Infinity;
  forEachPlay(hand, (seq, cards) => {
    const r = applySequence(state, cards);
    if (r.valid && eq(measure(r.state, goal), target)) {
      solutions.push(seq);
      if (seq.length < minCount) minCount = seq.length;
    }
  });
  return { solutions, minCount: solutions.length ? minCount : 0 };
}

// ---- 考え違いの推定（4.5） ----
// ハズレた出し方を、考え違いのモデルで計算し直す。目標にぴったり合ったモデルを返す
export function estimateMistake(state, cards, target, goal = 'P') {
  const right = applySequence(state, cards);
  if (!right.valid && eq(measure(right.state, goal), target)) return 'range'; // 計算は合っているが、途中で範囲外
  for (const m of CONFIG.MISTAKE_MODELS) {
    if (eq(measure(applySequence(state, cards, m).state, goal, m), target)) return m;
  }
  return 'calc';
}

// その出し方が「考え違いで目標に届いてしまう罠」なら、そのモデルを返す
function trapModel(state, cards, target, goal = 'P') {
  const right = applySequence(state, cards);
  if (eq(measure(right.state, goal), target)) return null; // 正解（または順番だけの問題）は罠ではない
  for (const m of CONFIG.MISTAKE_MODELS) {
    if (eq(measure(applySequence(state, cards, m).state, goal, m), target)) return m;
  }
  return null;
}

// 手札の中にある罠の考え違いの種類（熟練度マップで、罠を見抜けたかを数えるのに使う）
export function trapModelsInHand(state, hand, target, goal = 'P') {
  const found = new Set();
  forEachPlay(hand, (seq, cards) => {
    const m = trapModel(state, cards, target, goal);
    if (m) found.add(m);
  });
  return [...found];
}

export function countTraps(state, hand, target, goal = 'P') {
  let n = 0;
  forEachPlay(hand, (seq, cards) => { if (trapModel(state, cards, target, goal)) n++; });
  return n;
}

// 正解のカードに1枚足すと罠ができるカードを探す。preferModel があれば、そのモデルの罠を先に
function trapCandidates(state, comboCards, target, stage, preferModel, goal = 'P') {
  const found = [];
  for (const c of cardPool(stage)) {
    const hand = [...comboCards, c];
    let model = null;
    forEachPlay(hand, (seq, cards) => {
      if (!model) model = trapModel(state, cards, target, goal);
    }, hand.length - 1);
    if (model) found.push({ card: c, model });
  }
  if (preferModel) {
    const pref = found.filter((f) => f.model === preferModel);
    if (pref.length) return pref;
  }
  return found;
}

// ---- 問題を作る（4.4） ----
// 今の状態から、段階に合った「正解の組み合わせ」を乱数で作る
function randomCorrectCombo(state, stage, rng) {
  const st = CONFIG.STAGES[stage];
  for (let t = 0; t < CONFIG.COMBO_TRIES; t++) {
    // 混合気体の段階では、目標の種類（全圧か、どちらかの分圧か）も選ぶ
    const goal = st.mix ? weightedPick(st.goals, rng) : 'P';
    const pattern = weightedPick(st.patterns, rng);
    const cards = rng.shuffle(pattern.map((type) => randomCardOfType(type, rng)));
    if (!isLegalPlay(cards)) continue;
    const r = applySequence(state, cards);
    if (!r.valid || !isValidP(r.state.P)) continue;
    if (goal === 'P') {
      if (!eq(r.state.P, state.P)) return { cards, target: r.state.P, goal };
      continue;
    }
    const v = measure(r.state, goal);
    if (isInt(v) && v.n >= CONFIG.MIX.PART_MIN && !eq(v, measure(state, goal))) return { cards, target: v, goal };
  }
  return null;
}

const emptiesOf = (hand) => hand.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);

// 空き枠に新しいカードを入れて問題を作る。keep は手札の枠（長さ HAND_SIZE、空きは null）
function tryBuild(state, keep, stage, rng, preferModel) {
  const st = CONFIG.STAGES[stage];
  const n = st.minCards;
  let best = null; // おとりの条件だけ満たせなかったときの予備
  for (let a = 0; a < CONFIG.MAX_ATTEMPTS; a++) {
    const hand = keep.slice();
    // 正解の枚数ぶん（おとりが必要な段階で作り直しが続くときは +1 枚）の空きがなければ、
    // 残っているカードをランダムに捨てて空ける
    const need = Math.min(CONFIG.HAND_SIZE, n + (st.trapMin > 0 && a >= 20 ? 1 : 0));
    while (emptiesOf(hand).length < need) {
      const filled = hand.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      hand[rng.pick(filled)] = null;
    }
    const empties = emptiesOf(hand);
    const combo = randomCorrectCombo(state, stage, rng);
    if (!combo) continue;

    const newCards = combo.cards.slice();
    // 段階3以上：考え違いで目標に届いてしまう「おとり」を1枚入れる
    if (st.trapMin > 0 && newCards.length < empties.length) {
      const cands = trapCandidates(state, combo.cards, combo.target, stage, preferModel, combo.goal);
      if (cands.length) newCards.push({ ...rng.pick(cands).card });
    }
    while (newCards.length < empties.length) newCards.push(randomDecoy(stage, rng));
    rng.shuffle(newCards);
    empties.forEach((pos, k) => { hand[pos] = newCards[k]; });

    const res = enumerateSolutions(state, hand, combo.target, combo.goal);
    if (res.minCount !== n) continue;
    const traps = st.trapMin > 0 ? countTraps(state, hand, combo.target, combo.goal) : 0;
    const p = { hand, target: combo.target, solutions: res.solutions, minCount: res.minCount, traps };
    if (st.mix) p.goal = combo.goal; // 混合気体のときだけ（今日の5問などの以前の問題は形を変えない）
    if (traps >= st.trapMin) return p;
    if (!best || traps > best.traps) best = p;
  }
  return best;
}

// 新しい問題を作る。
// 1) 残っている手札を生かして作る → 2) 手札を全部新しくして作る → 3) 換気して開始状態から作る
export function generateProblem({ state, keep, stage, rng, preferModel = null }) {
  const empty = Array(CONFIG.HAND_SIZE).fill(null);
  // 混合気体の段階なのにボンベが1種類の気体（またはその逆）なら、その段階の開始状態にする
  let refilled = false;
  if (!!CONFIG.STAGES[stage].mix !== isMix(state)) state = startState(stage);
  else if (isMix(state) && toNumber(state.N) > CONFIG.MIX.REFILL_AT) { state = startState(stage); refilled = true; }
  let r = null;
  if (keep && keep.some(Boolean)) r = tryBuild(state, keep, stage, rng, preferModel);
  if (!r) r = tryBuild(state, empty, stage, rng, preferModel);
  if (r) return { ...r, state, ventilated: refilled };
  const fresh = startState(stage);
  r = tryBuild(fresh, empty, stage, rng, preferModel);
  if (!r) throw new Error('問題を作れなかった');
  return { ...r, state: fresh, ventilated: true };
}

// 段階の型（並び順を含む）で、目標に届くカードの並びをすべて返す
function combosReaching(state, target, stage, goal = 'P') {
  const pool = cardPool(stage);
  const byType = {};
  pool.forEach((c) => { (byType[c.type] = byType[c.type] || []).push(c); });
  const out = [];
  const seen = new Set();
  for (const [pattern] of CONFIG.STAGES[stage].patterns) {
    for (const order of permutations(pattern)) {
      const key = order.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const seq = [];
      const rec = (i) => {
        if (i === order.length) {
          const r = applySequence(state, seq);
          if (r.valid && eq(measure(r.state, goal), target)) out.push(seq.slice());
          return;
        }
        for (const c of byType[order[i]] || []) { seq.push(c); rec(i + 1); seq.pop(); }
      };
      rec(0);
    }
  }
  return out;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).forEach((p) => out.push([x, ...p]));
  });
  return out;
}

// 引き直し：目標はそのままで、手札5枚をすべて入れ替える。新しい手札も必ず解ける
export function rerollHand({ state, target, stage, rng, preferModel = null, goal = 'P' }) {
  const st = CONFIG.STAGES[stage];
  const n = st.minCards;
  // 段階の型で、同じ目標に届く正解の組み合わせを全部探す
  const reach = combosReaching(state, target, stage, goal);
  for (let a = 0; a < CONFIG.MAX_ATTEMPTS && reach.length; a++) {
    const combo = { cards: rng.pick(reach).map((c) => ({ ...c })) };
    const cards = combo.cards.slice();
    if (st.trapMin > 0) {
      const cands = trapCandidates(state, combo.cards, target, stage, preferModel, goal);
      if (cands.length) cards.push({ ...rng.pick(cands).card });
    }
    while (cards.length < CONFIG.HAND_SIZE) cards.push(randomDecoy(stage, rng));
    rng.shuffle(cards);
    const res = enumerateSolutions(state, cards, target, goal);
    if (res.minCount === n) {
      const p = { hand: cards, target, solutions: res.solutions, minCount: n, state, ventilated: false };
      if (st.mix) p.goal = goal;
      return p;
    }
  }
  // 同じ目標で作れないときは、新しい問題にする
  return generateProblem({ state, keep: null, stage, rng, preferModel });
}
