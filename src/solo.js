// ひとり修行モード（5章）。
// v0.3：道場。v0.4：タイムアタック、今日の5問、昇段試験、段位と経験値、カードパック、称号、熟練度。
// どのモードも同じ形（board, clock, over, tick, onJust, onMiss, onReroll, summary）で、画面側から同じように扱える。

import { CONFIG } from './config.js?v=0.5.0';
import { Board, Vitals } from './game.js?v=0.5.0';
import { generateProblem } from './puzzle.js?v=0.5.0';
import { createRng } from './rng.js?v=0.5.0';
import { frac } from './frac.js?v=0.5.0';
import { ARTS } from './chars.js?v=0.5.0';
import { Bot } from './bots.js?v=0.5.0';
import { TRICKS } from './battle.js?v=0.5.0';

export class Dojo {
  constructor({ rng, preferModel }) {
    const D = CONFIG.DOJO;
    this.kind = 'dojo';
    this.canReroll = true;
    this.fevers = 0;
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
      this.fevers++;
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
      fevers: this.fevers,
      mistakes: { ...this.mistakes },
    };
  }
}

// ---------- 練習室 ----------
export class PracticeRun {
  constructor({ stage, rng, preferModel }) {
    this.kind = 'practice';
    this.canReroll = true;
    this.board = new Board({ stage, rng, preferModel });
    this.clock = 0;
    this.streak = 0;
    this.over = false;
    this.mistakes = {};
  }

  get stage() { return this.board.stage; }
  tick(dt) { this.clock += dt; return []; }

  onJust(result) {
    this.streak++;
    this.board.commitJust(result);
    return { chain: this.streak, smart: false, speed: false, points: 0 };
  }

  onMiss(result) {
    this.streak = 0;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    this.board.commitMiss();
  }

  onReroll() { this.board.reroll(); }
}

// ---------- タイムアタック：60秒で何回ジャストできるか（危険メーターなし） ----------
export class TimeAttack {
  constructor({ rng, preferModel }) {
    const T = CONFIG.TA;
    this.kind = 'ta';
    this.canReroll = true;
    this.board = new Board({ stage: T.START_STAGE, rng, preferModel });
    this.vitals = new Vitals(CONFIG.DOJO); // 連鎖・スマート・スピードの判定だけに使う
    this.clock = 0;
    this.justs = 0;
    this.misses = 0;
    this.smarts = 0;
    this.speeds = 0;
    this.mistakes = {};
    this.over = false;
  }

  get stage() { return this.board.stage; }
  timeLeft() { return Math.max(0, CONFIG.TA.TIME_MS - this.clock); }

  tick(dt) {
    if (this.over) return [];
    this.clock += dt;
    const events = this.vitals.tick(this.clock, dt, 0);
    if (this.clock >= CONFIG.TA.TIME_MS) {
      this.over = true;
      events.push('time_up');
    }
    return events;
  }

  onJust(result, at = this.clock) {
    const T = CONFIG.TA;
    const v = this.vitals.onJust(result, at, this.board.minCount);
    this.justs++;
    if (v.smart) this.smarts++;
    if (v.speed) this.speeds++;
    const before = this.board.stage;
    const maxStage = Math.max(...CONFIG.AVAILABLE_STAGES);
    this.board.stage = Math.min(maxStage, T.START_STAGE + Math.floor(this.justs / T.JUSTS_PER_STAGE));
    this.board.commitJust(result);
    this.vitals.onNewTarget(this.clock);
    return { ...v, points: 0, stageUp: this.board.stage > before };
  }

  onMiss(result) {
    this.vitals.onMiss();
    this.misses++;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    this.board.commitMiss();
  }

  onReroll() { this.board.reroll(); }

  summary() {
    return {
      justs: this.justs, misses: this.misses, smarts: this.smarts, speeds: this.speeds,
      maxChain: this.vitals.maxChain, stage: this.stage, timeMs: Math.min(this.clock, CONFIG.TA.TIME_MS),
      mistakes: { ...this.mistakes },
    };
  }
}

// ---------- 今日の5問：日付（日本時間）をシードにした5問。全員が同じ問題 ----------
// 日付の文字列 YYYYMMDD（日本時間）
export function dateKey(now = Date.now()) {
  const d = new Date(now + CONFIG.DAILY.TZ_OFFSET_MIN * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// その日の5問を作る。それぞれの問題は、日付と問題番号だけで決まる
// （前の問題の解き方によって次の問題が変わらないよう、1問ずつ開始状態も乱数で決める）
export function dailyProblems(key) {
  const D = CONFIG.DAILY;
  const base = hashString(`srd-daily-${key}`);
  const out = [];
  for (let i = 0; i < D.COUNT; i++) {
    const rng = createRng((base + Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    const state = {
      P: frac(10 + rng.int(21)),                       // 1.0〜3.0×10⁵ Pa
      V: frac(rng.pick([4, 6, 8, 12, 18])),            // 2.0〜9.0 L
      T: frac(rng.pick([200, 300, 400])),
    };
    const stage = D.STAGES[i];
    out.push({ stage, problem: generateProblem({ state, keep: null, stage, rng, preferModel: null }) });
  }
  return out;
}

// 問題の中身を短い文字列にする（同じ日付で同じ問題になるかの確認に使う）
export function problemSignature(list) {
  const f = (x) => `${x.n}/${x.d}`;
  return list.map(({ stage, problem: p }) =>
    `${stage}|${f(p.state.P)},${f(p.state.V)},${f(p.state.T)}|${f(p.target)}|` +
    p.hand.map((c) => JSON.stringify([c.type, c.num, c.den, c.v, c.k])).join(';')).join('#');
}

export class DailyRun {
  constructor({ key = dateKey() } = {}) {
    this.kind = 'daily';
    this.canReroll = false;     // 全員が同じ問題を解くので、引き直しはなし
    this.key = key;
    this.list = dailyProblems(key);
    this.index = 0;
    this.board = new Board({ stage: this.list[0].stage, rng: createRng(1), problem: this.list[0].problem });
    this.clock = 0;
    this.cards = 0;             // 正解の合計枚数
    this.misses = 0;
    this.mistakes = {};
    this.over = false;
    this.cleared = false;
  }

  get stage() { return this.board.stage; }
  tick(dt) { if (!this.over) this.clock += dt; return []; }

  onJust(result) {
    this.cards += result.count;
    this.index++;
    this.board.justCount++;
    if (this.index >= this.list.length) {
      this.over = true;
      this.cleared = true;
    } else {
      this.board.stage = this.list[this.index].stage;
      this.board.loadProblem(this.list[this.index].problem);
    }
    return { chain: this.index, smart: result.count === this.board.minCount, speed: false, points: 0 };
  }

  onMiss(result) {
    this.misses++;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    this.board.commitMiss();
  }

  onReroll() {}

  summary() {
    return {
      key: this.key, cleared: this.cleared, solved: this.index, cards: this.cards,
      misses: this.misses, timeMs: this.clock, mistakes: { ...this.mistakes },
    };
  }
}

// ---------- 昇段試験：その段位に応じた段階の問題を10問連続ジャスト（ハズレ1回で不合格） ----------
export class ExamRun {
  constructor({ rank, rng }) {
    this.kind = 'exam';
    this.canReroll = true;
    this.targetRank = rank + 1;
    const stage = CONFIG.RANK.EXAM_STAGE[Math.min(rank, CONFIG.RANK.EXAM_STAGE.length - 1)];
    this.board = new Board({ stage, rng, preferModel: () => null });
    this.clock = 0;
    this.count = 0;
    this.over = false;
    this.passed = false;
    this.mistakes = {};
  }

  get stage() { return this.board.stage; }
  tick(dt) { if (!this.over) this.clock += dt; return []; }

  onJust(result) {
    this.count++;
    this.board.commitJust(result);
    if (this.count >= CONFIG.RANK.EXAM_JUSTS) {
      this.over = true;
      this.passed = true;
    }
    return { chain: this.count, smart: false, speed: false, points: 0 };
  }

  onMiss(result) {
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    this.board.commitMiss();
    this.over = true;
  }

  onReroll() { this.board.reroll(); }

  summary() {
    return { targetRank: this.targetRank, passed: this.passed, count: this.count, timeMs: this.clock, mistakes: { ...this.mistakes } };
  }
}

// ---------- 段位と経験値 ----------
// rank：0 = 10級 … 9 = 1級、10 = 初段 … 19 = 十段
export function expToReach(rank) {
  const R = CONFIG.RANK;
  let sum = 0;
  for (let k = 0; k < rank; k++) sum += R.EXP_BASE + R.EXP_STEP * k;
  return sum;
}

// 今の段位で、次の段位までの進み具合
export function rankProgress(profile) {
  const R = CONFIG.RANK;
  if (profile.rank >= R.COUNT - 1) return { max: true, ratio: 1, have: 0, need: 0 };
  const lo = expToReach(profile.rank);
  const hi = expToReach(profile.rank + 1);
  return { max: false, ratio: Math.min(1, (profile.exp - lo) / (hi - lo)), have: Math.max(0, profile.exp - lo), need: hi - lo };
}

// 必要な経験値に達すると、昇段試験が出現する
export const examAvailable = (profile) => profile.rank < CONFIG.RANK.COUNT - 1 && profile.exp >= expToReach(profile.rank + 1);

export function dojoExp(sum) {
  const E = CONFIG.EXP;
  return sum.justs * E.DOJO_PER_JUST + sum.maxChain * E.DOJO_PER_CHAIN + Math.floor(sum.score / E.DOJO_SCORE_DIV);
}
export const taExp = (sum) => sum.justs * CONFIG.EXP.TA_PER_JUST;
export const dailyExp = (sum) => (sum.cleared ? CONFIG.EXP.DAILY_CLEAR : 0);

// ---------- カードパック（3枚。ノーマル75%・レア20%・キモレア5%） ----------
export function rollPack(rng) {
  const P = CONFIG.PACK;
  const total = P.RARITY.normal + P.RARITY.rare + P.RARITY.kimo;
  const out = [];
  for (let i = 0; i < P.CARDS; i++) {
    const r = rng.next() * total;
    const rarity = r < P.RARITY.kimo ? 'kimo' : r < P.RARITY.kimo + P.RARITY.rare ? 'rare' : 'normal';
    out.push(rng.pick(ARTS.filter((a) => a.rarity === rarity)).id);
  }
  return out;
}

// ---------- 称号 ----------
// check(d)：d = { records, profile, collection }
export const TITLES = [
  { id: 'first_step', check: (d) => d.records.totals.justs >= 1 },
  { id: 'trap_seer', check: (d) => d.records.totals.celsiusHighJusts >= 20 },
  { id: 'kelvin_user', check: (d) => d.records.totals.tempJusts >= 100 },
  { id: 'minimalist', check: (d) => d.records.totals.smarts >= 50 },
  { id: 'lightning', check: (d) => d.records.totals.speeds >= 50 },
  { id: 'chain_child', check: (d) => d.records.dojoMaxChain >= 15 },
  { id: 'fever_regular', check: (d) => d.records.totals.fevers >= 10 },
  { id: 'dojo_master', check: (d) => d.records.dojoBest >= 10000 },
  { id: 'daily_three', check: (d) => d.records.totals.dailyDays >= 3 },
  { id: 'collector', check: (d) => Object.keys(d.collection.owned).length >= 20 },
  { id: 'shodan', check: (d) => d.profile.rank >= 10 },
  { id: 'cooling_master', check: (d) => d.records.totals.coolGasMaxInMatch >= 10 }, // 対戦（v0.6）で冷却ガスを1試合10回
];

export function earnedTitles(d) {
  return TITLES.filter((t) => t.check(d)).map((t) => t.id);
}

// ---------- 熟練度 ----------
export const MASTERY_CARDS = ['vmul', 'vset', 'tset_k', 'tset_c'];

// 1回のデュエルを熟練度に記録する
// types：出したカードの種類、traps：その問題の手札にあった罠の考え違い、ok：ジャストか、ms：かかった時間
export function addMastery(m, { types, traps, ok, ms }) {
  const bump = (tbl, key) => {
    const e = tbl[key] || { n: 0, ok: 0, ms: 0 };
    e.n++;
    if (ok) e.ok++;
    e.ms += Math.min(ms, 120000);
    tbl[key] = e;
  };
  for (const t of new Set(types)) bump(m.cards, t);
  for (const t of traps) bump(m.traps, t);
  return m;
}

// 星1〜5（データが少ないときは 0）
export function masteryStars(e) {
  const M = CONFIG.MASTERY;
  if (!e || e.n < M.MIN_TRIES) return 0;
  const rate = e.ok / e.n;
  let stars = 1;
  M.STAR_RATES.forEach((r) => { if (rate >= r) stars++; });
  if (e.ms / e.n > M.SLOW_MS) stars = Math.max(1, stars - 1);
  return stars;
}

// ---------- ストーリー：キャラクターとの1対1のデュエル（先に need 回ジャストした方が勝ち） ----------
export const chapterOf = (id) => CONFIG.STORY.CHAPTERS.find((c) => c.id === id);

export class StoryDuel {
  constructor({ chapter, rng, losses = 0 }) {
    const S = CONFIG.STORY;
    this.kind = 'story';
    this.canReroll = true;
    this.ch = chapterOf(chapter);
    this.rng = rng;
    this.need = this.ch.need;
    this.board = new Board({ stage: this.ch.stages[0], rng, preferModel: () => null });
    this.vitals = new Vitals(CONFIG.DOJO);
    const ease = Math.pow(1 + S.LOSS_EASE, Math.min(losses, S.LOSS_EASE_MAX));
    this.bot = new Bot({ level: this.ch.level, speed: this.ch.speed * ease, rng });
    this.bot.setStage(this.board.stage);
    this.clock = 0;
    this.justs = 0;
    this.misses = 0;
    this.mistakes = {};
    this.trickAcc = 0;
    this.trickDue = false;
    this.over = false;
    this.won = false;
  }

  get stage() { return this.board.stage; }

  riseMs() {
    return (CONFIG.DOJO.RISE_MS_BY_STAGE[this.stage] || 2000) * CONFIG.STORY.RISE_SLOW;
  }

  tick(dt) {
    if (this.over) return [];
    this.clock += dt;
    const events = this.vitals.tick(this.clock, dt, this.riseMs());
    const b = this.bot.tick(dt);
    if (b) events.push(b === 'just' ? 'bot_just' : 'bot_miss');
    if (this.bot.justs >= this.need) {
      this.over = true;
      this.won = false;
      events.push('lost');
    }
    if (this.ch.trick) {
      this.trickAcc += dt;
      if (this.trickAcc >= this.ch.trickMs) {
        this.trickAcc = 0;
        this.trickDue = true;
        events.push('trick');
      }
    }
    if (this.vitals.isBurst()) {
      this.over = true;
      this.won = false;
    }
    return events;
  }

  // 相手の技を使う（演出中でないときに画面側から呼ぶ）
  applyTrick() {
    if (!this.trickDue || this.over) return null;
    this.trickDue = false;
    return TRICKS[this.ch.trick](this.board, this.rng);
  }

  onJust(result, at = this.clock) {
    const v = this.vitals.onJust(result, at, this.board.minCount);
    this.justs++;
    const S = CONFIG.STORY;
    const stages = this.ch.stages;
    const before = this.board.stage;
    this.board.stage = stages[Math.min(stages.length - 1, Math.floor(this.justs / S.STAGE_EVERY))];
    this.bot.setStage(this.board.stage);
    this.board.commitJust(result);
    this.vitals.onNewTarget(this.clock);
    if (this.justs >= this.need) {
      this.over = true;
      this.won = true;
    }
    return { ...v, points: 0, stageUp: this.board.stage > before };
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
    if (this.vitals.isBurst()) this.over = true;
  }

  summary() {
    return {
      chapter: this.ch.id, won: this.won, justs: this.justs, botJusts: this.bot.justs, need: this.need,
      misses: this.misses, timeMs: this.clock, maxChain: this.vitals.maxChain, mistakes: { ...this.mistakes },
      burst: this.vitals.isBurst(),
    };
  }
}
