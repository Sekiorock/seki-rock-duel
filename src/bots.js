// CPUプレイヤーの動き（5.6）。v0.5：ストーリーの相手。v0.9（CPU対戦）でも同じものを使う。
// CPU は問題を実際には解かず、「解く時間」と「ジャストの確率」でジャスト・ハズレを起こす。

import { CONFIG } from './config.js?v=0.6.0';

export class Bot {
  // level：'novice'（見習い）/ 'regular'（一人前）/ 'master'（達人）
  // speed：解く時間に掛ける倍率（小さいほど速い）
  constructor({ level = 'regular', speed = 1, rng }) {
    this.cfg = CONFIG.BOT.LEVELS[level];
    this.speed = speed;
    this.rng = rng;
    this.justs = 0;
    this.misses = 0;
    this.stage = 1;
    this.mistakeModel = null;
    this._next();
  }

  // 問題の段階が上がるほど、解く時間を長くする
  _next() {
    const [a, b] = this.cfg.SOLVE_MS;
    const stageMul = CONFIG.BOT.STAGE_FACTOR[this.stage - 1] || 1;
    this.left = (a + (b - a) * this.rng.next()) * stageMul * this.speed;
  }

  setStage(stage) { this.stage = stage; }

  // 時間を進める。'just' か 'miss' か null を返す
  tick(dt) {
    this.left -= dt;
    if (this.left > 0) return null;
    this._next();
    if (this.rng.next() < this.cfg.ACCURACY) {
      this.justs++;
      return 'just';
    }
    this.misses++;
    // ハズレのときは、考え違いのモデルの1つを選んだことにする（演出用）
    this.mistakeModel = this.rng.pick(CONFIG.MISTAKE_MODELS);
    return 'miss';
  }

  // 次のジャストまでの残り（0〜1、表示用）
  progress() {
    const [a, b] = this.cfg.SOLVE_MS;
    const total = ((a + b) / 2) * (CONFIG.BOT.STAGE_FACTOR[this.stage - 1] || 1) * this.speed;
    return Math.max(0, Math.min(1, 1 - this.left / total));
  }
}
