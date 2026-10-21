// カードの種類と、ボンベへの効果の計算。
// 状態は { P, V, T, N } で、どれも分数（frac.js）。
// N は物質量（v0.6〜）。開始時の物質量を 6 とする相対の値（6 → 12 で 2 倍）。実際の mol は pV/(RT) で表示する。
// 混合気体（v0.7〜）では、さらに A（窒素 N₂）と B（酸素 O₂）の物質量を持つ。N = A + B

import { frac, mul, div, add, isInt } from './frac.js?v=0.8.0';
import { CONFIG } from './config.js?v=0.8.0';

// ---- カードを作る ----
export const vmul = (num, den) => ({ type: 'vmul', num, den });   // 体積を num/den 倍
export const vset = (v) => ({ type: 'vset', v });                 // 体積を v（0.5 L 単位）にする
export const tsetK = (k) => ({ type: 'tset_k', k });              // 温度を k [K] にする
export const tsetC = (k) => ({ type: 'tset_c', k });              // 温度を k [K] にする（℃で表記）
export const tsetF = (k) => ({ type: 'tset_f', k });              // 温度を k [K] にする（℉で表記。隠し章、v0.8）
export const nmul = (num, den) => ({ type: 'nmul', num, den });   // 物質量を num/den 倍（気体を入れる・抜く）

export const addGas = (gas, k) => ({ type: 'add', gas, k });     // 気体 gas（'A' か 'B'）を k だけ混ぜる（v0.7）

export const frost = (skin = null) => (skin ? { type: 'frost', skin } : { type: 'frost' }); // skin 'z'：7章の「Z≠1カード」                    // おじゃまカード：霜（場に置けない）
export const isTempCard = (c) => !!c && CONFIG.TEMP_TYPES.includes(c.type);
export const isPlayable = (c) => !!c && c.type !== 'frost';
export const celsiusOf = (k) => k - CONFIG.KELVIN_OFFSET;
// ℉ = ℃ × 9/5 + 32。カードには整数に丸めた値を書く（例：300 K = 27℃ → 80.6 → 81℉）
export const fahrenheitOf = (k) => Math.round(celsiusOf(k) * 9 / 5 + 32);

// stage を渡すと、その段階の開始状態（混合気体の段階なら N₂:O₂ = 4:1 の空気）
export function startState(stage = null) {
  if (stage && CONFIG.STAGES[stage] && CONFIG.STAGES[stage].mix) {
    const m = CONFIG.MIX.START;
    return { P: frac(m.P), V: frac(m.V), T: frac(m.T), N: frac(m.A + m.B), A: frac(m.A), B: frac(m.B) };
  }
  const s = CONFIG.START_STATE;
  return { P: frac(s.P), V: frac(s.V), T: frac(s.T), N: frac(s.N) };
}

export const isMix = (s) => !!(s && s.A);

// 目標の値をはかる。goal は 'P'（全圧）、'A'・'B'（その気体の分圧 = 全圧 × モル分率）
// model が 'partial_total' なら、分圧を全圧と取り違える考え違い
export function measure(s, goal = 'P', model = null) {
  if (!goal || goal === 'P' || !isMix(s) || model === 'partial_total') return s.P;
  return mul(s.P, div(goal === 'A' ? s.A : s.B, add(s.A, s.B)));
}

const nOf = (s) => s.N || frac(CONFIG.START_STATE.N);

export const isValidV = (V) => isInt(V) && CONFIG.VOLUME_UNITS.includes(V.n);
export const isValidT = (T) => isInt(T) && CONFIG.TEMPS_K.includes(T.n);
export const isValidP = (P) => isInt(P) && P.n >= CONFIG.P_MIN && P.n <= CONFIG.P_MAX;
export const isValidN = (N) => !N || (isInt(N) && CONFIG.MOL_UNITS.includes(N.n));
const isValidPart = (x) => isInt(x) && CONFIG.MIX.UNITS.includes(x.n);
// 物質量が決まった値か（混合気体なら A・B それぞれ）
export const isValidAmount = (s) => (isMix(s) ? isValidPart(s.A) && isValidPart(s.B) : isValidN(s.N));

// 出し方のきまり：温度カードは1回に1枚まで
export function isLegalPlay(cards) {
  return cards.filter(isTempCard).length <= CONFIG.MAX_TEMP_CARDS;
}

// ---- 計算 ----
// model を指定すると、考え違いのモデル（4.5）で計算する。null なら正しい計算。
//   正しい計算：P後 = P × (n後 / n前) × (V前 / V後) × (T後 / T前)   （pV = nRT より p ∝ nT/V）
export function applyCard(s, card, model = null) {
  let V2 = s.V;
  let T2 = s.T;
  const N = nOf(s);
  let N2 = N;
  let A2 = s.A;
  let B2 = s.B;
  if (card.type === 'vmul') V2 = mul(s.V, frac(card.num, card.den));
  else if (card.type === 'nmul') {
    const f = frac(card.num, card.den);
    N2 = mul(N, f);
    if (isMix(s)) { A2 = mul(s.A, f); B2 = mul(s.B, f); }
  } else if (card.type === 'add' && isMix(s)) {
    // 混ぜる：その気体の物質量だけが増える。V・T が一定なので、全圧は物質量の和に比例する
    if (card.gas === 'A') A2 = add(s.A, frac(card.k));
    else B2 = add(s.B, frac(card.k));
    N2 = add(A2, B2);
  }
  else if (card.type === 'vset') V2 = frac(card.v);
  else if (card.type === 'tset_k') T2 = frac(card.k);
  else if (card.type === 'tset_c') T2 = model === 'celsius' ? frac(celsiusOf(card.k)) : frac(card.k);
  else if (card.type === 'tset_f') T2 = model === 'fahrenheit' ? frac(fahrenheitOf(card.k) + CONFIG.KELVIN_OFFSET) : frac(card.k);
  if (model === 'ignore_t') T2 = s.T;

  const vRatio = model === 'inverse_v' ? div(V2, s.V) : div(s.V, V2);
  const tRatio = model === 'inverse_t' ? div(s.T, T2) : div(T2, s.T);
  let nRatio = model === 'inverse_n' ? div(N, N2) : div(N2, N);
  if (model === 'fixed_total' && card.type === 'add') nRatio = frac(1); // 「混ぜても全圧は同じ」と考える
  const out = { P: mul(mul(mul(s.P, vRatio), tRatio), nRatio), V: V2, T: T2, N: N2 };
  if (isMix(s)) { out.A = A2; out.B = B2; }
  return out;
}

// 左の枠から順に適用。途中で体積・温度が決まった値から外れたら valid=false（ハズレ扱い）
// steps には1枚ごとの途中の状態が入る（演出で使う）
export function applySequence(s, cards, model = null) {
  let cur = s;
  let valid = true;
  const steps = [];
  for (const c of cards) {
    cur = applyCard(cur, c, model);
    if (!model && (!isValidV(cur.V) || !isValidT(cur.T) || !isValidAmount(cur))) valid = false;
    steps.push(cur);
  }
  return { state: cur, valid, steps };
}

// ---- 表示 ----
// カードの文字を2段で返す（上段・下段）
export function cardLines(card) {
  switch (card.type) {
    case 'vmul':
      return { top: 'V', bottom: card.den === 1 ? `×${card.num}` : `×${card.num}/${card.den}` };
    case 'vset': {
      const L = card.v / 2;
      return { top: 'V →', bottom: `${L >= 10 ? L.toFixed(0) : L.toFixed(1)} L` };
    }
    case 'tset_k':
      return { top: 'T →', bottom: `${card.k} K` };
    case 'tset_c': {
      const c = celsiusOf(card.k);
      return { top: 'T →', bottom: `${c < 0 ? '−' + Math.abs(c) : c}℃` };
    }
    case 'nmul':
      return { top: 'n', bottom: card.den === 1 ? `×${card.num}` : `×${card.num}/${card.den}` };
    case 'add':
      return { top: card.gas === 'A' ? 'N₂' : 'O₂', bottom: `+${card.k}` };
    case 'tset_f': {
      const f = fahrenheitOf(card.k);
      return { top: 'T →', bottom: `${f < 0 ? '−' + Math.abs(f) : f}°F` };
    }
    case 'frost':
      return card.skin === 'z' ? { top: 'Z≠1', bottom: '' } : { top: '❄', bottom: '' };
    default:
      return { top: '?', bottom: '' };
  }
}

export function cardLabel(card) {
  const l = cardLines(card);
  return `${l.top} ${l.bottom}`.replace('V ×', 'V ×');
}
