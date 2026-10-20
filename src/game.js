// 1人分の盤面の進行（選ぶ、出す、判定）。ひとりでも対戦でも同じものを使う。

import { CONFIG } from './config.js?v=0.2.1';
import { eq } from './frac.js?v=0.2.1';
import { startState, applySequence, isTempCard } from './cards.js?v=0.2.1';
import { generateProblem, rerollHand, estimateMistake } from './puzzle.js?v=0.2.1';

let uidCounter = 1;
const withUid = (c) => (c && !c.uid ? { ...c, uid: uidCounter++ } : c);

export class Board {
  // preferModel：おとりで優先する考え違い（関数で渡すと、問題を作るたびに最新の値を使う）
  constructor({ stage, rng, preferModel = () => null }) {
    this.stage = stage;
    this.rng = rng;
    this.preferModel = preferModel;
    this.state = startState();
    this.hand = Array(CONFIG.HAND_SIZE).fill(null);
    this.field = Array(CONFIG.FIELD_SIZE).fill(null); // 手札の位置（0〜4）を入れる
    this.justCount = 0;
    this.missCount = 0;
    this._setProblem(generateProblem(this._genArgs({ state: this.state, keep: null })));
  }

  _genArgs(extra) {
    return { stage: this.stage, rng: this.rng, preferModel: this.preferModel(), ...extra };
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

  fieldCards() {
    return this.field.filter((i) => i !== null).map((i) => this.hand[i]);
  }

  // 手札のカードを場へ。slot を指定しなければ左から空いている枠へ。
  // 置けたら 'ok'、置けなければ理由を返す
  place(handIdx, slot = null) {
    const card = this.hand[handIdx];
    if (!card || this.isOnField(handIdx)) return 'none';
    if (isTempCard(card) && this.fieldCards().filter(isTempCard).length >= CONFIG.MAX_TEMP_CARDS) {
      return 'temp_limit';
    }
    if (slot === null || this.field[slot] !== null) slot = this.field.indexOf(null);
    if (slot < 0) return 'full';
    this.field[slot] = handIdx;
    return 'ok';
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

  // 場のカードを出したらどうなるか（予告表示用。盤面は変えない）
  preview() {
    if (!this.canDuel()) return null;
    return applySequence(this.state, this.fieldCards());
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
      steps: r.steps,
      cards,
      used,
      count: used.length,
      smart: just && used.length === this.minCount, // v0.3 の得点で使う
      mistake: just ? null : estimateMistake(this.state, cards, this.target),
    };
  }

  // ジャストの確定：状態を引き継ぎ、使ったカードを捨てて補充し、新しい目標を出す
  commitJust(result) {
    this.justCount++;
    const keep = this.hand.map((c, i) => (result.used.includes(i) ? null : c));
    this._setProblem(generateProblem(this._genArgs({ state: result.after, keep })));
  }

  // ハズレの確定：カードは手札に戻り、ボンベも元のまま。同じ問題に再挑戦
  commitMiss() {
    this.missCount++;
    this.field.fill(null);
  }

  // 引き直し：手札5枚をすべて入れ替える（目標はそのまま）
  reroll() {
    this._setProblem(rerollHand(this._genArgs({ state: this.state, target: this.target })));
  }
}
