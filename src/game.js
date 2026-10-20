// 1人分の盤面の進行（選ぶ、出す、判定）。ひとりでも対戦でも同じものを使う。

import { CONFIG } from './config.js';
import { eq } from './frac.js';
import { startState, applySequence } from './cards.js';
import { generateProblem, rerollHand } from './puzzle.js';

let uidCounter = 1;
const withUid = (c) => (c && !c.uid ? { ...c, uid: uidCounter++ } : c);

export class Board {
  constructor({ stage, rng }) {
    this.stage = stage;
    this.rng = rng;
    this.state = startState();
    this.hand = Array(CONFIG.HAND_SIZE).fill(null);
    this.field = Array(CONFIG.FIELD_SIZE).fill(null); // 手札の位置（0〜4）を入れる
    this.justCount = 0;
    this.missCount = 0;
    this._setProblem(generateProblem({ state: this.state, keep: null, stage, rng }));
  }

  _setProblem(p) {
    this.state = p.state;
    this.hand = p.hand.map(withUid);
    this.target = p.target;
    this.solutions = p.solutions;
    this.minCount = p.minCount;
    this.ventilated = p.ventilated;
    this.field.fill(null);
  }

  isOnField(handIdx) {
    return this.field.includes(handIdx);
  }

  // 手札のカードを場へ。slot を指定しなければ左から空いている枠へ
  place(handIdx, slot = null) {
    if (!this.hand[handIdx] || this.isOnField(handIdx)) return false;
    if (slot === null || this.field[slot] !== null) slot = this.field.indexOf(null);
    if (slot < 0) return false;
    this.field[slot] = handIdx;
    return true;
  }

  // 場のカードを手札へ戻す
  unplace(slot) {
    if (this.field[slot] === null) return false;
    this.field[slot] = null;
    return true;
  }

  canDuel() {
    return this.field.some((i) => i !== null);
  }

  // デュエル！の計算（盤面はまだ変えない）
  duel() {
    const used = this.field.filter((i) => i !== null);
    const cards = used.map((i) => this.hand[i]);
    const r = applySequence(this.state, cards);
    const just = r.valid && eq(r.state.P, this.target);
    return {
      kind: just ? 'just' : 'miss',
      valid: r.valid,
      before: this.state,
      after: r.state,
      used,
      count: used.length,
      smart: just && used.length === this.minCount, // v0.3 の得点で使う
    };
  }

  // ジャストの確定：状態を引き継ぎ、使ったカードを捨てて補充し、新しい目標を出す
  commitJust(result) {
    this.justCount++;
    const keep = this.hand.map((c, i) => (result.used.includes(i) ? null : c));
    this._setProblem(generateProblem({ state: result.after, keep, stage: this.stage, rng: this.rng }));
  }

  // ハズレの確定：カードは手札に戻り、ボンベも元のまま。同じ問題に再挑戦
  commitMiss() {
    this.missCount++;
    this.field.fill(null);
  }

  // 引き直し：手札5枚をすべて入れ替える（目標はそのまま）
  reroll() {
    this._setProblem(rerollHand({ state: this.state, target: this.target, stage: this.stage, rng: this.rng }));
  }
}
