// 問題の自動生成と、解の探索（仕様書 4.4）。

import { CONFIG } from './config.js';
import { eq } from './frac.js';
import { vmul, applySequence, isValidP, startState } from './cards.js';

// 段階に合ったカードを1枚ランダムに作る
export function randomCard(stage, rng) {
  const [n, d] = rng.pick(CONFIG.VMUL_FACTORS);
  return vmul(n, d);
}

// 手札から作れるすべての出し方（1〜FIELD_SIZE 枚、並び順を含む）を調べ、
// 目標にぴったり合う出し方の一覧と最少枚数を返す。hand は null（空き）を含んでよい。
export function enumerateSolutions(state, hand, target) {
  const idx = [];
  hand.forEach((c, i) => { if (c) idx.push(i); });
  const solutions = [];
  let minCount = Infinity;
  const seq = [];
  const rec = () => {
    if (seq.length > 0) {
      const r = applySequence(state, seq.map((i) => hand[i]));
      if (r.valid && eq(r.state.P, target)) {
        solutions.push(seq.slice());
        if (seq.length < minCount) minCount = seq.length;
      }
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
  return { solutions, minCount: solutions.length ? minCount : 0 };
}

// 今の状態から、n 枚の「正解の組み合わせ」を乱数で作る（圧力が変化し、結果が決まった値に収まるもの）
function randomCorrectCombo(state, n, stage, rng) {
  for (let t = 0; t < CONFIG.COMBO_TRIES; t++) {
    const cards = Array.from({ length: n }, () => randomCard(stage, rng));
    const r = applySequence(state, cards);
    if (r.valid && isValidP(r.state.P) && !eq(r.state.P, state.P)) {
      return { cards, target: r.state.P };
    }
  }
  return null;
}

// 空き枠に新しいカードを入れて問題を作る。keep は手札の枠（長さ HAND_SIZE、空きは null）。
function tryBuild(state, keep, stage, rng) {
  const n = CONFIG.STAGES[stage].minCards;
  for (let a = 0; a < CONFIG.MAX_ATTEMPTS; a++) {
    const hand = keep.slice();
    // 正解の枚数ぶんの空きがなければ、残っているカードをランダムに捨てて空ける
    let empties = hand.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    while (empties.length < n) {
      const filled = hand.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      hand[rng.pick(filled)] = null;
      empties = hand.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    }
    const combo = randomCorrectCombo(state, n, stage, rng);
    if (!combo) continue;
    const newCards = combo.cards.slice();
    while (newCards.length < empties.length) newCards.push(randomCard(stage, rng)); // おとり
    rng.shuffle(newCards);
    empties.forEach((pos, k) => { hand[pos] = newCards[k]; });

    const res = enumerateSolutions(state, hand, combo.target);
    if (res.minCount === n) {
      return { hand, target: combo.target, solutions: res.solutions, minCount: res.minCount };
    }
  }
  return null;
}

// 新しい問題を作る。
// 1) 残っている手札を生かして作る → 2) 手札を全部新しくして作る → 3) 換気して開始状態から作る
export function generateProblem({ state, keep, stage, rng }) {
  const empty = Array(CONFIG.HAND_SIZE).fill(null);
  let r = null;
  if (keep && keep.some(Boolean)) r = tryBuild(state, keep, stage, rng);
  if (!r) r = tryBuild(state, empty, stage, rng);
  if (r) return { ...r, state, ventilated: false };
  const fresh = startState();
  r = tryBuild(fresh, empty, stage, rng);
  if (!r) throw new Error('問題を作れなかった');
  return { ...r, state: fresh, ventilated: true };
}

// 引き直し：目標はそのままで、手札5枚をすべて入れ替える。新しい手札も必ず解ける。
export function rerollHand({ state, target, stage, rng }) {
  const n = CONFIG.STAGES[stage].minCards;
  // 目標に届くカードの並びを全部調べる（体積カードは6種類なので、最大 6+36+216 通り）
  const pool = CONFIG.VMUL_FACTORS.map(([a, b]) => vmul(a, b));
  const reach = [];
  const seq = [];
  const rec = () => {
    if (seq.length > 0) {
      const r = applySequence(state, seq);
      if (r.valid && eq(r.state.P, target)) reach.push(seq.slice());
    }
    if (seq.length === CONFIG.FIELD_SIZE) return;
    for (const c of pool) { seq.push(c); rec(); seq.pop(); }
  };
  rec();
  const preferred = reach.filter((s) => s.length === n);
  const candidates = preferred.length ? preferred : reach;

  if (candidates.length) {
    for (let a = 0; a < CONFIG.MAX_ATTEMPTS; a++) {
      const cards = rng.pick(candidates).map((c) => ({ ...c }));
      while (cards.length < CONFIG.HAND_SIZE) cards.push(randomCard(stage, rng));
      rng.shuffle(cards);
      const res = enumerateSolutions(state, cards, target);
      const ok = preferred.length ? res.minCount === n : res.minCount >= 1;
      if (ok) return { hand: cards, target, solutions: res.solutions, minCount: res.minCount, state, ventilated: false };
    }
  }
  // どうしても作れないときは、新しい問題にする
  return generateProblem({ state, keep: null, stage, rng });
}
