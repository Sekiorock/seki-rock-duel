// ひとり修行モード。v0.3 は道場（5.2）。
// 危険メーターに追われながら解き続け、破裂するまでの得点を競う。

import { CONFIG } from './config.js?v=0.3.0';
import { Board, Vitals } from './game.js?v=0.3.0';

export class Dojo {
  constructor({ rng, preferModel }) {
    const D = CONFIG.DOJO;
    this.board = new Board({ stage: D.START_STAGE, rng, preferModel });
    this.vitals = new Vitals(D);
    this.clock = 0;            // ゲームの時計（ミリ秒）。一時停止中は進まない
    this.score = 0;
    this.justs = 0;
    this.misses = 0;
    this.smarts = 0;
    this.speeds = 0;
    this.mistakes = {};        // 考え違いの種類ごとの回数（この回のぶん）
    this.fever = null;         // { endAt, startChain, super }
    this.over = false;
    this.vitals.onNewTarget(0);
  }

  get stage() { return this.board.stage; }

  // 自然上昇の間隔（段階が上がるほど、また2分半を過ぎるほど速い）
  riseMs() {
    const D = CONFIG.DOJO;
    let ms = D.RISE_MS_BY_STAGE[this.stage] || 3000;
    if (this.clock > D.LATE_START_MS) {
      ms *= Math.pow(D.LATE_FACTOR_PER_MIN, (this.clock - D.LATE_START_MS) / 60000);
    }
    return Math.max(250, ms);
  }

  // 時間を進める。起きたこと（'chain_lost' 'fever_end' 'burst'）を返す
  tick(dt) {
    if (this.over) return [];
    this.clock += dt;
    const events = this.vitals.tick(this.clock, dt, this.riseMs());
    if (this.fever && this.clock >= this.fever.endAt) {
      this.fever = null;
      events.push('fever_end');
    }
    if (events.includes('burst')) this.over = true;
    return events;
  }

  feverLeft() {
    if (!this.fever) return 0;
    return Math.max(0, Math.min(1, (this.fever.endAt - this.clock) / CONFIG.DOJO.FEVER_MS));
  }

  // ジャスト：得点・連鎖・メーター・フィーバー・段階を進め、次の問題を出す
  // at：デュエル！を押した時刻（スピードの判定に使う）
  onJust(result, at = this.clock) {
    const D = CONFIG.DOJO;
    const S = CONFIG.SCORE;
    const v = this.vitals.onJust(result, at, this.board.minCount);
    this.justs++;
    if (v.smart) this.smarts++;
    if (v.speed) this.speeds++;

    // フィーバー（5連鎖ごと）と超フィーバー（フィーバー中にさらに5連鎖）
    let feverStarted = false;
    let superStarted = false;
    if (this.fever) {
      this.fever.endAt += D.FEVER_EXTEND_MS;
      if (!this.fever.super && v.chain >= this.fever.startChain + D.SUPER_EXTRA_CHAIN) {
        this.fever.super = true;
        superStarted = true;
      }
    } else if (v.chain % D.FEVER_EVERY === 0) {
      this.fever = { endAt: this.clock + D.FEVER_MS, startChain: v.chain, super: false };
      feverStarted = true;
    }

    // 得点：(100 + スマート + スピード) × 連鎖の倍率 × フィーバーの倍率
    let base = S.JUST + (v.smart ? S.SMART : 0) + (v.speed ? S.SPEED : 0);
    const chainMult = 1 + Math.min(S.CHAIN_MAX_BONUS, S.CHAIN_STEP * v.chain);
    const feverMult = this.fever ? (this.fever.super ? S.SUPER_MULT : S.FEVER_MULT) : 1;
    const points = Math.round(base * chainMult * feverMult);
    this.score += points;

    // 段階：ジャスト5回ごとに1つ上がる（最大6）
    const before = this.board.stage;
    const maxStage = Math.max(...CONFIG.AVAILABLE_STAGES);
    this.board.stage = Math.min(maxStage, D.START_STAGE + Math.floor(this.justs / D.JUSTS_PER_STAGE));
    const stageUp = this.board.stage > before;

    this.board.commitJust(result);
    this.vitals.onNewTarget(this.clock);
    return { ...v, points, feverStarted, superStarted, stageUp, fever: !!this.fever, superFever: !!(this.fever && this.fever.super) };
  }

  onMiss(result) {
    this.vitals.onMiss();
    this.misses++;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    this.board.commitMiss();
    if (this.vitals.isBurst()) this.over = true;
  }

  onReroll() {
    this.vitals.onReroll();
    this.board.reroll();
    if (this.board.ventilated) this.vitals.onNewTarget(this.clock);
    if (this.vitals.isBurst()) this.over = true;
  }

  summary() {
    return {
      score: this.score,
      maxChain: this.vitals.maxChain,
      justs: this.justs,
      misses: this.misses,
      smarts: this.smarts,
      speeds: this.speeds,
      stage: this.stage,
      timeMs: this.clock,
      mistakes: { ...this.mistakes },
    };
  }
}
