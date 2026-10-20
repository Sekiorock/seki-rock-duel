// カードの種類と、ボンベへの効果の計算。
// 状態は { P, V, T } で、どれも分数（frac.js）。

import { frac, mul, div, isInt } from './frac.js';
import { CONFIG } from './config.js';

// 体積カード：体積を num/den 倍する
export function vmul(num, den) {
  return { type: 'vmul', num, den };
}

export function startState() {
  const s = CONFIG.START_STATE;
  return { P: frac(s.P), V: frac(s.V), T: frac(s.T) };
}

export const isValidV = (V) => isInt(V) && CONFIG.VOLUME_UNITS.includes(V.n);
export const isValidT = (T) => isInt(T) && CONFIG.TEMPS_K.includes(T.n);
export const isValidP = (P) => isInt(P) && P.n >= CONFIG.P_MIN && P.n <= CONFIG.P_MAX;

// カード1枚を適用：P後 = P × (V前 / V後) × (T後 / T前)
export function applyCard(s, card) {
  let V2 = s.V;
  let T2 = s.T;
  if (card.type === 'vmul') V2 = mul(s.V, frac(card.num, card.den));
  const P2 = mul(mul(s.P, div(s.V, V2)), div(T2, s.T));
  return { P: P2, V: V2, T: T2 };
}

// 左の枠から順に適用。途中で体積・温度が決まった値から外れたら valid=false（ハズレ扱い）
export function applySequence(s, cards) {
  let cur = s;
  let valid = true;
  for (const c of cards) {
    cur = applyCard(cur, c);
    if (!isValidV(cur.V) || !isValidT(cur.T)) valid = false;
  }
  return { state: cur, valid };
}

export function cardLabel(card) {
  if (card.type === 'vmul') {
    return card.den === 1 ? `V ×${card.num}` : `V ×${card.num}/${card.den}`;
  }
  return '?';
}
