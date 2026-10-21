// 対戦ルール（6章）。v0.5：ストーリーの相手の技（おじゃま）だけ。
// v0.9 で、熱波・着弾待ち・相殺・バルブ・冷却係を足す。CPU戦とライブ戦で共通にする。

import { frost, tsetC, nmul, applyCard, isValidN, isValidP } from './cards.js?v=0.6.0';
import { generateProblem } from './puzzle.js?v=0.6.0';

// 場に出ていない手札の位置（霜は除く）
function freeSlots(board, pred = () => true) {
  return board.hand
    .map((c, i) => (c && c.type !== 'frost' && !board.isOnField(i) && pred(c) ? i : -1))
    .filter((i) => i >= 0);
}

// 解けなくなったら、手札を作り直す（6.4：おじゃまカードで正解の組み合わせが失われた場合）
function ensureSolvable(board, rng) {
  if (board.refreshSolutions()) return false;
  const keep = board.hand.map((c) => (c && c.type === 'frost' ? c : null));
  const p = generateProblem({ state: board.state, keep, stage: board.stage, rng, preferModel: null });
  board.loadProblem(p);
  board.refreshSolutions();
  return true;
}

// 霜カード：手札の枠を1つふさぐ。場に置けない。次のジャストで溶ける
export function sendFrost(board, rng) {
  const slots = freeSlots(board);
  if (!slots.length) return null;
  const i = rng.pick(slots);
  board.hand[i] = { ...frost(), uid: `frost-${Date.now()}-${i}` };
  const rebuilt = ensureSolvable(board, rng);
  return { type: 'frost', slot: i, rebuilt };
}

// セルシウス化：手札のKの温度カード1枚を、同じ温度の℃表記に書き換える（Kカードがなければ霜）
export function sendToCelsius(board, rng) {
  const slots = freeSlots(board, (c) => c.type === 'tset_k');
  if (!slots.length) return sendFrost(board, rng);
  const i = rng.pick(slots);
  board.hand[i] = { ...tsetC(board.hand[i].k), uid: `cel-${Date.now()}-${i}` };
  board.refreshSolutions();
  return { type: 'to_celsius', slot: i };
}

// 目標の書き換え（ストーリー2章、シャルルの技）：ボンベの状態はそのままで、新しい目標を出す
export function swapTarget(board, rng) {
  if (board.field.some((x) => x !== null)) board.field.fill(null);
  const keep = board.hand.map((c) => (c && c.type === 'frost' ? c : c));
  const p = generateProblem({ state: board.state, keep, stage: board.stage, rng, preferModel: null });
  board.loadProblem(p);
  return { type: 'swap_target' };
}

// 気体のもれ・注入（ストーリー5章、アボガドロの技）：ボンベの物質量を変え、その状態から新しい目標を出す
export function leakGas(board, rng) {
  const options = rng.shuffle([[2, 1], [1, 2], [3, 2], [2, 3]]);
  for (const [a, b] of options) {
    const next = applyCard(board.state, nmul(a, b));
    if (!isValidN(next.N) || !isValidP(next.P)) continue;
    board.field.fill(null);
    const p = generateProblem({ state: next, keep: board.hand.slice(), stage: board.stage, rng, preferModel: null });
    board.loadProblem(p);
    return { type: 'leak', dir: a > b ? 'in' : 'out' };
  }
  return null;
}

export const TRICKS = { frost: sendFrost, to_celsius: sendToCelsius, swap_target: swapTarget, leak: leakGas };
