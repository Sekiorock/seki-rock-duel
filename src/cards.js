// カードの種類と、ボンベへの効果の計算。
// 状態は { P, V, T } で、どれも分数（frac.js）。

import { frac, mul, div, isInt } from './frac.js?v=0.3.0';
import { CONFIG } from './config.js?v=0.3.0';

// ---- カードを作る ----
export const vmul = (num, den) => ({ type: 'vmul', num, den });   // 体積を num/den 倍
export const vset = (v) => ({ type: 'vset', v });                 // 体積を v（0.5 L 単位）にする
export const tsetK = (k) => ({ type: 'tset_k', k });              // 温度を k [K] にする
export const tsetC = (k) => ({ type: 'tset_c', k });              // 温度を k [K] にする（℃で表記）

export const isTempCard = (c) => !!c && CONFIG.TEMP_TYPES.includes(c.type);
export const celsiusOf = (k) => k - CONFIG.KELVIN_OFFSET;

export function startState() {
  const s = CONFIG.START_STATE;
  return { P: frac(s.P), V: frac(s.V), T: frac(s.T) };
}

export const isValidV = (V) => isInt(V) && CONFIG.VOLUME_UNITS.includes(V.n);
export const isValidT = (T) => isInt(T) && CONFIG.TEMPS_K.includes(T.n);
export const isValidP = (P) => isInt(P) && P.n >= CONFIG.P_MIN && P.n <= CONFIG.P_MAX;

// 出し方のきまり：温度カードは1回に1枚まで
export function isLegalPlay(cards) {
  return cards.filter(isTempCard).length <= CONFIG.MAX_TEMP_CARDS;
}

// ---- 計算 ----
// model を指定すると、考え違いのモデル（4.5）で計算する。null なら正しい計算。
//   正しい計算：P後 = P × (V前 / V後) × (T後 / T前)
export function applyCard(s, card, model = null) {
  let V2 = s.V;
  let T2 = s.T;
  if (card.type === 'vmul') V2 = mul(s.V, frac(card.num, card.den));
  else if (card.type === 'vset') V2 = frac(card.v);
  else if (card.type === 'tset_k') T2 = frac(card.k);
  else if (card.type === 'tset_c') T2 = model === 'celsius' ? frac(celsiusOf(card.k)) : frac(card.k);
  if (model === 'ignore_t') T2 = s.T;

  const vRatio = model === 'inverse_v' ? div(V2, s.V) : div(s.V, V2);
  const tRatio = model === 'inverse_t' ? div(s.T, T2) : div(T2, s.T);
  return { P: mul(mul(s.P, vRatio), tRatio), V: V2, T: T2 };
}

// 左の枠から順に適用。途中で体積・温度が決まった値から外れたら valid=false（ハズレ扱い）
// steps には1枚ごとの途中の状態が入る（演出で使う）
export function applySequence(s, cards, model = null) {
  let cur = s;
  let valid = true;
  const steps = [];
  for (const c of cards) {
    cur = applyCard(cur, c, model);
    if (!model && (!isValidV(cur.V) || !isValidT(cur.T))) valid = false;
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
    default:
      return { top: '?', bottom: '' };
  }
}

export function cardLabel(card) {
  const l = cardLines(card);
  return `${l.top} ${l.bottom}`.replace('V ×', 'V ×');
}
