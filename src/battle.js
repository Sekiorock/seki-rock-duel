// 対戦ルール（6章）。v0.5：ストーリーの相手の技（おじゃま）。
// v0.9：ひとり対戦（CPU戦）の熱波・着弾待ち・相殺・攻撃先・バルブ・冷却係（下の BattleRun）。ライブ戦でも同じルールを使う。

import { frost, tsetC, tsetF, nmul, addGas, applyCard, isValidN, isValidP, isValidAmount, isMix } from './cards.js?v=1.1.0';
import { CONFIG } from './config.js?v=1.1.0';
import { generateProblem } from './puzzle.js?v=1.1.0';
import { Board } from './game.js?v=1.1.0';
import { Bot } from './bots.js?v=1.1.0';

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

// 気体を混ぜる（ストーリー6章、ドルトンの技）：ボンベに別の気体を入れ、その状態から新しい目標を出す。
// 体積・温度は同じなので、入れた気体の分圧のぶんだけ全圧が上がる（もとの気体の分圧は変わらない）
export function mixIn(board, rng) {
  if (!isMix(board.state)) return leakGas(board, rng);
  const options = rng.shuffle([['A', 1], ['B', 1], ['A', 2], ['B', 2]]);
  for (const [gas, k] of options) {
    const next = applyCard(board.state, addGas(gas, k));
    if (!isValidAmount(next) || !isValidP(next.P)) continue;
    board.field.fill(null);
    const p = generateProblem({ state: next, keep: board.hand.slice(), stage: board.stage, rng, preferModel: null });
    board.loadProblem(p);
    return { type: 'mix_in', gas };
  }
  return sendFrost(board, rng);
}

// Z≠1カード（7章、ファンデルワールスの技）：霜と同じく手札の枠を1つふさぐ。
// 「実在気体は pV = nRT からずれる」ことの目印。次のジャストで消える
export function sendRealGas(board, rng) {
  const slots = freeSlots(board);
  if (!slots.length) return null;
  const i = rng.pick(slots);
  board.hand[i] = { ...frost('z'), uid: `z-${Date.now()}-${i}` };
  const rebuilt = ensureSolvable(board, rng);
  return { type: 'real_gas', slot: i, rebuilt };
}

// ℉化（隠し章、ファーレンハイトの技）：手札の K・℃ の温度カード1枚を、同じ温度の℉表記に書き換える
export function sendToFahrenheit(board, rng) {
  const slots = freeSlots(board, (c) => c.type === 'tset_k' || c.type === 'tset_c');
  if (slots.length) {
    const i = rng.pick(slots);
    board.hand[i] = { ...tsetF(board.hand[i].k), uid: `fah-${Date.now()}-${i}` };
    board.refreshSolutions();
    return { type: 'to_fahrenheit', slot: i };
  }
  // K・℃のカードがないときは、正解に使わないカード1枚を、新しい℉カードに入れ替える
  const used = new Set(board.solutions.flat());
  const free = freeSlots(board);
  const cand = free.filter((i) => !used.has(i));
  if (!free.length) return null;
  const i = rng.pick(cand.length ? cand : free);
  board.hand[i] = { ...tsetF(rng.pick(CONFIG.TEMPS_K)), uid: `fah-${Date.now()}-${i}` };
  ensureSolvable(board, rng);
  return { type: 'to_fahrenheit', slot: i };
}

export const TRICKS = { frost: sendFrost, to_celsius: sendToCelsius, swap_target: swapTarget, leak: leakGas, mix_in: mixIn, real_gas: sendRealGas, to_fahrenheit: sendToFahrenheit };

// =====================================================================
// ひとり対戦（CPU戦。6章のルールすべて。v0.9）
// 自分（id 0）と CPU（id 1〜）が同じ時計で進む。CPU は問題を実際には解かず、Bot の時間と確率でジャストする。
// 画面側は run.tick(dt) のあと run.drain() で起きたこと（熱波・着弾・破裂・冷却など）を受け取って演出する。
// =====================================================================

// 熱波の量（6.2）。chain は今回のジャストを入れた連鎖数
export function heatOf({ chain, smart, speed, valves }) {
  const B = CONFIG.BATTLE;
  let h = B.HEAT_JUST;
  for (const [from, add] of B.HEAT_CHAIN) if (chain >= from) h = B.HEAT_JUST + add; // 2〜3連鎖目 +1、4〜6 +2、7〜 +3
  if (smart) h += B.HEAT_SMART;
  if (speed) h += B.HEAT_SPEED;
  const mult = Math.min(B.VALVE_MAX_MULT, 1 + B.VALVE_STEP * valves);
  return Math.floor(h * mult);
}

const LEVEL_ORDER = ['novice', 'regular', 'master'];
const BOT_CHARS = ['boyle', 'charles', 'kelvin', 'celsius', 'avogadro', 'dalton', 'vdw', 'fahrenheit'];

// 試合の時刻から、段階の候補と自然上昇の間隔を返す
export function phaseAt(cards, clock) {
  const list = CONFIG.BATTLE.PHASES[cards] || CONFIG.BATTLE.PHASES.basic;
  let cur = list[0];
  let idx = 0;
  list.forEach((p, i) => { if (clock >= p[0]) { cur = p; idx = i; } });
  return { index: idx, stages: cur[1], riseMs: cur[2] };
}

export class BattleRun {
  // opponents：CPU の数（11 か 39）、level：中心の強さ、cards：'basic'（段階1〜6）か 'all'（物質量・混合気体も）
  constructor({ opponents = 11, level = 'regular', cards = 'basic', rng, me = {} }) {
    const B = CONFIG.BATTLE;
    this.kind = 'battle';
    this.canReroll = true;
    this.rng = rng;
    this.cards = cards;
    this.level = level;
    this.clock = 0;
    this.riseAcc = 0;
    this.events = [];
    this.over = false;
    this.finalStarted = false;
    this.mistakes = {};
    const ph = phaseAt(cards, 0);
    this.phase = ph.index;
    this.board = new Board({ stage: rng.pick(ph.stages), rng, preferModel: () => null });

    // 強さの混ぜ方（例：一人前を選ぶと11体なら 見習い3・一人前5・達人3）
    const li = LEVEL_ORDER.indexOf(level);
    const mixCount = B.MIX[opponents] || [Math.round(opponents * 0.27), 0, Math.round(opponents * 0.27)];
    mixCount[1] = opponents - mixCount[0] - mixCount[2];
    const levels = [];
    [-1, 0, 1].forEach((d, k) => {
      const lv = LEVEL_ORDER[Math.max(0, Math.min(2, li + d))];
      for (let i = 0; i < mixCount[k]; i++) levels.push(lv);
    });
    rng.shuffle(levels);

    const base = () => ({
      alive: true, meter: 0, pending: [], valves: 0, chain: 0, maxChain: 0, lastJustAt: null,
      justs: 0, misses: 0, coolSent: 0, coolRecv: [], killer: null, lastHitBy: null, rank: 0,
      mode: 'random', randTarget: null, randAt: -1e9, coolTarget: null, cheerFor: null, jamUntil: 0, targetAt: 0,
    });
    this.players = [{ ...base(), id: 0, me: true, char: me.char || null, level: null }];
    const used = {};
    levels.forEach((lv, i) => {
      const char = BOT_CHARS[(i + rng.int(BOT_CHARS.length)) % BOT_CHARS.length];
      used[char] = (used[char] || 0) + 1;
      const p = { ...base(), id: i + 1, me: false, char, num: used[char], level: lv };
      p.bot = new Bot({ level: lv, speed: B.BOT_SLOW, rng, accuracyMul: B.BOT_ACCURACY });
      p.bot.setStage(this._botStage());
      p.mode = lv === 'master' ? 'finish' : 'random';
      this.players.push(p);
    });
    this.total = this.players.length;
    this.me = this.players[0];
  }

  get stage() { return this.board.stage; }
  get aliveCount() { return this.players.filter((p) => p.alive).length; }
  alive() { return this.players.filter((p) => p.alive); }
  drain() { const e = this.events; this.events = []; return e; }
  _emit(e) { this.events.push(e); }

  _botStage() {
    const st = phaseAt(this.cards, this.clock).stages;
    return st[Math.floor(st.length / 2)];
  }

  // 次の問題の段階（試合の時刻で決まる候補から1つ）
  _nextStage() {
    return this.rng.pick(phaseAt(this.cards, this.clock).stages);
  }

  // ---------- 攻撃先（6.5） ----------
  // p が今ねらっている相手の id の一覧（表示用にも使う）
  targetsOf(p) {
    if (!p.alive || this.aliveCount < 2) return [];
    const others = this.players.filter((q) => q.alive && q.id !== p.id);
    if (!others.length) return [];
    switch (p.mode) {
      case 'counter': {
        const att = others.filter((q) => q.id !== p.id && this._rawTargets(q).includes(p.id));
        if (att.length) return att.map((q) => q.id);
        return [this._random(p, others)];
      }
      case 'finish': {
        // 危険メーターが最も高い人（同じなら、その中からランダム）。まだ誰も高くなければランダム
        const top = Math.max(...others.map((q) => q.meter));
        if (top < CONFIG.BATTLE.FINISH_MIN) return [this._random(p, others)];
        const c = others.filter((q) => q.meter === top);
        return [c.length === 1 ? c[0].id : this._random(p, c)];
      }
      case 'valve': {
        const top = Math.max(...others.map((q) => q.valves));
        const c = others.filter((q) => q.valves === top);
        return [c.length === 1 ? c[0].id : this._random(p, c)];
      }
      default:
        return [this._random(p, others)];
    }
  }

  // 反撃の計算の中で使う（反撃どうしが互いを探して終わらなくならないように、反撃はランダム扱い）
  _rawTargets(q) {
    if (!q.alive) return [];
    if (q.mode === 'counter') return q.randTarget !== null ? [q.randTarget] : [];
    return this.targetsOf(q);
  }

  _random(p, pool) {
    const ok = pool.some((q) => q.id === p.randTarget);
    if (!ok) { p.randTarget = this.rng.pick(pool).id; p.randAt = this.clock; }
    return p.randTarget;
  }

  // 自分をねらっている相手の id
  attackersOf(id) {
    return this.players.filter((q) => q.alive && q.id !== id && this.targetsOf(q).includes(id)).map((q) => q.id);
  }

  setMode(mode) { this.me.mode = mode; }

  // ---------- 時間を進める ----------
  tick(dt) {
    if (this.over) return [];
    const B = CONFIG.BATTLE;
    this.clock += dt;
    const ph = phaseAt(this.cards, this.clock);
    if (ph.index !== this.phase) {
      this.phase = ph.index;
      const st = this._botStage();
      this.players.forEach((p) => p.bot && p.bot.setStage(st));
      this._emit({ type: 'phase', index: ph.index, stages: ph.stages });
    }
    // ランダムの攻撃先は2秒ごとに選び直す
    for (const p of this.players) {
      if (p.alive && this.clock - p.randAt >= B.RANDOM_REPICK_MS) {
        const pool = this.players.filter((q) => q.alive && q.id !== p.id);
        if (pool.length) { p.randTarget = this.rng.pick(pool).id; p.randAt = this.clock; }
      }
    }
    // 危険メーターの自然上昇（生き残っている全員）
    this.riseAcc += dt;
    while (this.riseAcc >= ph.riseMs) {
      this.riseAcc -= ph.riseMs;
      for (const p of this.players) if (p.alive) p.meter = Math.min(100, p.meter + 1);
    }
    // 連鎖が切れる
    for (const p of this.players) {
      if (p.chain > 0 && p.lastJustAt !== null && this.clock - p.lastJustAt > B.CHAIN_TIMEOUT_MS) p.chain = 0;
    }
    // 着弾（6.3）
    for (const p of this.players) {
      if (!p.alive || !p.pending.length) continue;
      let landed = 0;
      while (p.pending.length && p.pending[0].at <= this.clock) {
        const h = p.pending.shift();
        landed += h.amt;
        p.meter = Math.min(100, p.meter + h.amt * B.METER_PER_HEAT);
        p.lastHitBy = h.from;
      }
      if (landed > 0) {
        const jam = landed >= B.JAM_AT;
        let jamInfo = null;
        if (jam) {
          if (p.me) jamInfo = this._jamMe();
          else p.jamUntil = this.clock + B.BOT_JAM_MS;
        }
        this._emit({ type: 'land', to: p.id, amt: landed, jam, jamInfo });
      }
    }
    // CPU の動き
    for (const p of this.players) {
      if (p.me) continue;
      if (p.jamUntil > this.clock) continue;
      const r = p.bot.tick(dt);
      if (r === 'just') this._botJust(p);
      else if (r === 'miss') {
        p.misses++;
        p.chain = 0;
        if (p.alive) p.meter = Math.min(100, p.meter + B.METER_MISS);
      }
    }
    this._checkBursts();
    return [];
  }

  // 自分の手札1枚をおじゃまカードに（Kの温度カードがあれば半分の確率でセルシウス化、なければ霜）
  _jamMe() {
    const b = this.board;
    const hasK = b.hand.some((c, i) => c && c.type === 'tset_k' && !b.isOnField(i));
    const r = hasK && this.rng.next() < 0.5 ? sendToCelsius(b, this.rng) : sendFrost(b, this.rng);
    return r;
  }

  _checkBursts() {
    // 残っている全員が同時に破裂しそうなときは、1人だけ（ランダム）を踏みとどまらせて勝者にする
    const alive0 = this.alive();
    if (alive0.length && alive0.every((p) => p.meter >= 100)) this.rng.pick(alive0).meter = 99;
    for (const p of this.players) {
      if (!p.alive || p.meter < 100) continue;
      const rank = this.aliveCount;
      p.alive = false;
      p.rank = rank;
      p.pending = [];
      p.chain = 0;
      p.burstAt = this.clock;
      // バルブ（6.6）：最後に熱波を着弾させた人が、破裂した人のバルブすべてと、さらに1つを受け取る
      const killer = p.lastHitBy !== null ? this.players[p.lastHitBy] : null;
      p.killer = killer ? killer.id : null;
      let gained = 0;
      if (killer && killer.alive) {
        gained = p.valves + 1;
        killer.valves += gained;
      }
      p.valves = 0;
      // 冷却係（6.7）：初期の送り先は、自分を破裂させた人以外で、危険メーターが最も高い人
      p.coolTarget = null;
      this._emit({ type: 'burst', id: p.id, by: p.killer, valves: gained, rank });
    }
    const alive = this.alive();
    // 残り2人：決勝。冷却係は2つの応援団に分かれ、どちらかしか冷却できなくなる
    if (alive.length === 2 && !this.finalStarted) {
      this.finalStarted = true;
      const cool = this.players.filter((p) => !p.alive);
      this.rng.shuffle(cool).forEach((p, i) => { p.cheerFor = alive[i % 2].id; });
      this._emit({ type: 'final', ids: alive.map((p) => p.id) });
    }
    if (alive.length <= 1 && !this.over) {
      if (alive[0]) { alive[0].rank = 1; this.winner = alive[0].id; }
      this.over = true;
      this._emit({ type: 'end', winner: this.winner });
    }
  }

  // 冷却ガスの送り先
  coolTargetOf(p) {
    if (p.cheerFor !== null && this.players[p.cheerFor].alive) return p.cheerFor;
    if (p.coolTarget !== null && this.players[p.coolTarget].alive) return p.coolTarget;
    const pool = this.players.filter((q) => q.alive && q.id !== p.killer);
    const list = pool.length ? pool : this.alive();
    if (!list.length) return null;
    const top = Math.max(...list.map((q) => q.meter));
    return list.find((q) => q.meter === top).id;
  }

  setCoolTarget(id) {
    if (this.me.cheerFor !== null) return false; // 決勝では応援する側が決まっている
    if (!this.players[id] || !this.players[id].alive) return false;
    this.me.coolTarget = id;
    return true;
  }

  // ---------- ジャストしたとき（自分も CPU も同じ流れ） ----------
  _just(p, { smart, speed }) {
    const B = CONFIG.BATTLE;
    p.justs++;
    p.chain++;
    p.maxChain = Math.max(p.maxChain, p.chain);
    p.lastJustAt = this.clock;
    if (!p.alive) return this._cool(p);
    p.meter = Math.max(0, p.meter + B.METER_JUST + (smart ? CONFIG.DOJO.METER_SMART : 0) + (speed ? CONFIG.DOJO.METER_SPEED : 0));
    let heat = heatOf({ chain: p.chain, smart, speed, valves: p.valves });
    const made = heat;
    // 相殺：まず自分の着弾待ちを古い順に打ち消す
    let offset = 0;
    while (heat > 0 && p.pending.length) {
      const h = p.pending[0];
      const k = Math.min(h.amt, heat);
      h.amt -= k;
      heat -= k;
      offset += k;
      if (h.amt <= 0) p.pending.shift();
    }
    const sent = [];
    if (heat > 0) {
      const ids = this.targetsOf(p);
      if (ids.length) {
        // 反撃で複数の相手なら等分（端数は最初の人に）
        const each = Math.floor(heat / ids.length);
        let rest = heat - each * ids.length;
        ids.forEach((id) => {
          const amt = each + (rest > 0 ? rest : 0);
          rest = 0;
          if (amt <= 0) return;
          const pend = this.players[id].pending;
          pend.push({ amt, at: this.clock + B.LAND_MS, from: p.id });
          pend.sort((x, y) => x.at - y.at); // 着弾の早い順（相殺は古い順）
          sent.push([id, amt]);
        });
      }
    }
    this._emit({ type: 'heat', from: p.id, made, offset, sent });
    return { made, offset, sent };
  }

  // 冷却ガス（6.7）：着弾待ちがあれば最も古いものを1つ消す。なければ危険メーター −8。1人が受け取れるのは10秒間に3回まで
  _cool(p) {
    const B = CONFIG.BATTLE;
    const id = this.coolTargetOf(p);
    if (id === null) return { cooled: null };
    const q = this.players[id];
    q.coolRecv = q.coolRecv.filter((t) => this.clock - t < B.COOL_WINDOW_MS);
    if (q.coolRecv.length >= B.COOL_LIMIT) {
      this._emit({ type: 'cool_full', from: p.id, to: id });
      return { cooled: null, full: id };
    }
    q.coolRecv.push(this.clock);
    if (q.pending.length) q.pending.shift();
    else q.meter = Math.max(0, q.meter + B.COOL_METER);
    p.coolSent++;
    this._emit({ type: 'cool', from: p.id, to: id });
    return { cooled: id };
  }

  _botJust(p) {
    const B = CONFIG.BATTLE;
    // 一人前は、ねらわれていれば半分の確率で反撃する
    if (p.level === 'regular') p.mode = this.rng.next() < B.BOT_COUNTER_RATE ? 'counter' : 'random';
    const smart = this.rng.next() < B.BOT_SMART_RATE[p.level];
    const speed = this.rng.next() < B.BOT_SPEED_RATE[p.level];
    this._just(p, { smart, speed });
  }

  // ---------- 自分の操作（画面側から呼ぶ。道場などと同じ形） ----------
  onJust(result, at = this.clock) {
    const me = this.me;
    const smart = result.count === this.board.minCount;
    const speed = at - me.targetAt <= CONFIG.BATTLE.SPEED_MS;
    const r = this._just(me, { smart, speed });
    this.board.stage = this._nextStage();
    this.board.commitJust(result);
    me.targetAt = this.clock;
    this._checkBursts();
    return { chain: me.chain, smart, speed, points: 0, ...r, cooling: !me.alive };
  }

  onMiss(result) {
    const me = this.me;
    me.misses++;
    me.chain = 0;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    if (me.alive) me.meter = Math.min(100, me.meter + CONFIG.BATTLE.METER_MISS);
    this.board.commitMiss();
    this._checkBursts();
  }

  onReroll() {
    const me = this.me;
    if (me.alive) me.meter = Math.min(100, me.meter + CONFIG.BATTLE.METER_REROLL);
    this.board.reroll();
    me.targetAt = this.clock;
    this._checkBursts();
  }

  // 自分が破裂したあと、残りを早送りして決着させる
  fastForward(maxMs = 600000) {
    const step = CONFIG.BATTLE.FAST_FORWARD_MS;
    let t = 0;
    while (!this.over && t < maxMs) { this.tick(step); t += step; }
    this.events = [];
  }

  summary() {
    const ps = this.players;
    const best = (f) => ps.reduce((a, b) => (f(b) > f(a) ? b : a), ps[0]);
    const chainTop = best((p) => p.maxChain);
    const valveTop = best((p) => p.valves);
    const coolTop = best((p) => p.coolSent);
    const me = this.me;
    return {
      won: this.winner === 0,
      rank: me.rank || this.aliveCount,
      total: this.total,
      justs: me.justs,
      misses: me.misses,
      maxChain: me.maxChain,
      valves: me.valves,
      coolSent: me.coolSent,
      timeMs: this.clock,
      winner: this.winner ?? null,
      chainTop: { id: chainTop.id, n: chainTop.maxChain },
      valveTop: { id: valveTop.id, n: valveTop.valves },
      coolTop: { id: coolTop.id, n: coolTop.coolSent },
      players: ps.map((p) => ({ id: p.id, char: p.char, num: p.num, me: p.me })),
      mistakes: { ...this.mistakes },
      level: this.level,
      opponents: this.total - 1,
    };
  }
}
