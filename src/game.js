// 1人分の盤面の進行（選ぶ、出す、判定）。ひとりでも対戦でも同じものを使う。

import { CONFIG } from './config.js?v=0.5.0';
import { eq } from './frac.js?v=0.5.0';
import { startState, applySequence, isTempCard } from './cards.js?v=0.5.0';
import { generateProblem, rerollHand, estimateMistake, enumerateSolutions } from './puzzle.js?v=0.5.0';

let uidCounter = 1;
const withUid = (c) => (c && !c.uid ? { ...c, uid: uidCounter++ } : c);

export class Board {
  // preferModel：おとりで優先する考え違い（関数で渡すと、問題を作るたびに最新の値を使う）
  // problem を渡すと、その問題から始める（今日の5問のように、問題が決まっているとき）
  constructor({ stage, rng, preferModel = () => null, problem = null }) {
    this.stage = stage;
    this.rng = rng;
    this.preferModel = preferModel;
    this.state = startState();
    this.hand = Array(CONFIG.HAND_SIZE).fill(null);
    this.field = Array(CONFIG.FIELD_SIZE).fill(null); // 手札の位置（0〜4）を入れる
    this.justCount = 0;
    this.missCount = 0;
    this.dealt = 0;           // 問題を出した回数（新しく配られたカードの見分けに使う）
    this._setProblem(problem || generateProblem(this._genArgs({ state: this.state, keep: null })));
  }

  // 決まった問題を読み込む
  loadProblem(p) {
    this._setProblem(p);
  }

  _genArgs(extra) {
    return { stage: this.stage, rng: this.rng, preferModel: this.preferModel(), ...extra };
  }

  // 手札を書き換えたあと（おじゃまカードなど）、解の一覧を作り直す
  refreshSolutions() {
    const r = enumerateSolutions(this.state, this.hand, this.target);
    this.solutions = r.solutions;
    this.minCount = r.minCount;
    return r.solutions.length > 0;
  }

  _setProblem(p) {
    this.dealt++;
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
    if (card.type === 'frost') return 'frost';
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
    // 使ったカードは捨て札に。霜カードは次のジャストで溶けて、通常のカードに入れ替わる（6.4）
    const keep = this.hand.map((c, i) => (result.used.includes(i) || (c && c.type === 'frost') ? null : c));
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

// ---- 危険メーターと連鎖（3.4）。道場でも、のちの対戦でも同じものを使う ----
// 時間はゲームの時計（一時停止中は進まない、ミリ秒）で数える
export class Vitals {
  constructor(cfg = CONFIG.DOJO) {
    this.cfg = cfg;
    this.meter = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.lastJustAt = null;   // 前のジャストの時刻
    this.targetAt = 0;        // 今の目標が出た時刻
    this.riseAcc = 0;
  }

  addMeter(d) {
    this.meter = Math.max(0, Math.min(this.cfg.METER_MAX, this.meter + d));
    return this.meter;
  }

  isBurst() {
    return this.meter >= this.cfg.METER_MAX;
  }

  // 時間を dt 進める。riseMs ごとに危険メーター +1。起きたことを配列で返す
  tick(now, dt, riseMs) {
    const events = [];
    if (riseMs > 0) {
      this.riseAcc += dt;
      while (this.riseAcc >= riseMs) {
        this.riseAcc -= riseMs;
        this.addMeter(1);
      }
    }
    if (this.chain > 0 && this.lastJustAt !== null && now - this.lastJustAt > this.cfg.CHAIN_TIMEOUT_MS) {
      this.chain = 0;
      events.push('chain_lost');
    }
    if (this.isBurst()) events.push('burst');
    return events;
  }

  // 連鎖が切れるまでの残り（0〜1）
  chainLeft(now) {
    if (this.chain === 0 || this.lastJustAt === null) return 0;
    return Math.max(0, 1 - (now - this.lastJustAt) / this.cfg.CHAIN_TIMEOUT_MS);
  }

  // ジャスト：スマート・スピードを判定し、連鎖とメーターを進める
  onJust(result, now, minCount) {
    const smart = result.count === minCount;
    const speed = now - this.targetAt <= this.cfg.SPEED_MS;
    this.chain++;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.lastJustAt = now;
    let d = this.cfg.METER_JUST;
    if (smart) d += this.cfg.METER_SMART;
    if (speed) d += this.cfg.METER_SPEED;
    this.addMeter(d);
    return { smart, speed, chain: this.chain, meterDelta: d };
  }

  onMiss() {
    this.chain = 0;
    this.addMeter(this.cfg.METER_MISS);
  }

  onReroll() {
    this.addMeter(this.cfg.METER_REROLL);
  }

  onNewTarget(now) {
    this.targetAt = now;
  }
}
