// みんなで対戦（ライブ対戦）。v1.0：部屋をつくる・入る・待合室・同時スタート・ほかの参加者の表示。
// v1.1：本番ルール（熱波・着弾待ち・相殺・おじゃま・攻撃先・破裂とバルブ・冷却係・決勝・切断）。ルールは CPU 戦と同じ（battle.js）。
// 通信は net.js（Firebase か、動作確認用のにせもの）。データの形は仕様書 7.2。

import { CONFIG } from './config.js?v=1.2.0';
import { Board } from './game.js?v=1.2.0';
import { createRng } from './rng.js?v=1.2.0';
import { phaseAt, heatOf, sendFrost, sendToCelsius } from './battle.js?v=1.2.0';

export const NAME_MAX = 8;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // 作成から3時間たった部屋は、次に部屋を作る人が消す
const MAX_PLAYERS = 40;

// ---------- 部屋 ----------
export class Room {
  constructor(net, code) {
    this.net = net;
    this.code = code;
    this.data = null;
    this.off = null;
    this.onChange = () => {};
  }

  get path() { return `rooms/${this.code}`; }
  get uid() { return this.net.uid; }
  get isHost() { return !!this.data && this.data.host === this.uid; }

  // 参加者（抜けた人を除く）を参加順に
  players() {
    const ps = (this.data && this.data.players) || {};
    return Object.entries(ps).map(([uid, p]) => ({ uid, ...p })).filter((p) => !p.left).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  }

  static myEntry(net, me) {
    return { name: me.name, char: me.char || '', joinedAt: net.ts(), meter: 0, chain: 0, alive: true, valves: 0 };
  }

  // 部屋をつくる：4桁の番号を選び、自分を最初の参加者にする
  static async create(net, me) {
    await Room.cleanup(net);
    for (let t = 0; t < 30; t++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      if (await net.get(`rooms/${code}/host`)) continue;
      await net.set(`rooms/${code}`, {
        host: net.uid, state: 'lobby', seed: Math.floor(Math.random() * 2 ** 31), createdAt: net.ts(), startAt: 0,
        players: { [net.uid]: Room.myEntry(net, me) },
      });
      const r = new Room(net, code);
      await r._afterJoin();
      return r;
    }
    throw new Error('no_room');
  }

  // 部屋に入る。'none'（その番号の部屋がない）'started'（試合中）'full' のときはエラー
  static async join(net, code, me) {
    const data = await net.get(`rooms/${code}`);
    if (!data || !data.host) throw new Error('none');
    if (data.state !== 'lobby') throw new Error('started');
    const n = Object.values(data.players || {}).filter((p) => !p.left).length;
    if (n >= MAX_PLAYERS) throw new Error('full');
    await net.set(`rooms/${code}/players/${net.uid}`, Room.myEntry(net, me));
    const r = new Room(net, code);
    await r._afterJoin();
    return r;
  }

  // 古い部屋の後片付け（7.5）
  static async cleanup(net) {
    try {
      const all = await net.get('rooms');
      if (!all) return;
      const now = net.serverNow();
      await Promise.all(Object.entries(all)
        .filter(([, r]) => r && r.createdAt && now - r.createdAt > ROOM_TTL_MS)
        .map(([code]) => net.remove(`rooms/${code}`).catch(() => {})));
    } catch (e) { /* 読めなくても部屋は作れる */ }
  }

  async _afterJoin() {
    // 接続が切れたら、自分は抜けたことにする（生存も false）
    await this.net.onDisconnectUpdate(`${this.path}/players/${this.uid}`, { alive: false, left: true });
    this.off = this.net.on(this.path, (d) => {
      this.data = d;
      if (d) this._hostCheck();
      this.onChange(d);
    });
  }

  // 部屋を作った人が抜けたら、残っている人のうち最も早く入った人が引き継ぐ（7.5）
  _hostCheck() {
    const host = this.data.players && this.data.players[this.data.host];
    if (host && !host.left) return;
    const ps = this.players();
    if (ps.length && ps[0].uid === this.uid) this.net.update(this.path, { host: this.uid });
  }

  updateMe(obj) { return this.net.update(`${this.path}/players/${this.uid}`, obj); }

  // スタート（部屋を作った人だけ）：3.5秒後に全員がそろって始める（7.3）
  async start() {
    if (!this.isHost || this.players().length < 2) return false;
    await this.net.update(this.path, { state: 'countdown', startAt: this.net.serverNow() + 3500, seed: Math.floor(Math.random() * 2 ** 31) });
    return true;
  }

  setState(state) { return this.net.update(this.path, { state }); }

  // 熱波・冷却・破裂のイベント（7.2）。自分が送ったものだけ書ける
  sendEvent(ev) { return this.net.push(`${this.path}/events`, { ...ev, from: this.uid, t: this.net.ts() }); }
  onEvent(cb) { return this.net.onAdded(`${this.path}/events`, cb); }
  // 結果を出したあと、部屋を作った人がイベントを消す（7.5）
  clearEvents() { if (this.isHost) return this.net.remove(`${this.path}/events`); return null; }

  // もう1試合：部屋を作った人が待合室に戻す。各自が自分の値を元に戻す
  async backToLobby() {
    if (this.isHost) await this.net.update(this.path, { state: 'lobby', startAt: 0 });
  }
  resetMe() { return this.updateMe({ meter: 0, chain: 0, alive: true, valves: 0, burstAt: null, stats: null }); }

  async leave() {
    if (this.off) this.off();
    this.off = null;
    try {
      await this.net.cancelDisconnect(`${this.path}/players/${this.uid}`);
      if (this.data && this.data.state === 'lobby') await this.net.remove(`${this.path}/players/${this.uid}`);
      else await this.updateMe({ alive: false, left: true });
      // 自分しか残っていなければ部屋ごと消す
      const rest = this.players().filter((p) => p.uid !== this.uid);
      if (!rest.length) await this.net.remove(this.path);
    } catch (e) { /* 通信が切れていても戻れるように */ }
  }
}

// ---------- 試合（v1.1：本番ルール） ----------
// 自分の盤面・危険メーター・着弾待ちは、自分のスマホの中で計算する（7.1）。
// ほかの人の危険メーター・連鎖・生存・バルブ・攻撃先は、部屋のデータ（players）から写す。
// 熱波・冷却ガス・破裂は events で送り合い、受け取った側が自分で着弾待ちに積む。
export class LiveRun {
  constructor({ room, seed }) {
    this.kind = 'live';
    this.canReroll = true;
    this.room = room;
    this.rng = createRng(seed);   // 全員が同じシードから始める（6.1-5）
    this.cards = 'basic';
    this.clock = 0;
    this.riseAcc = 0;
    this.events = [];
    this.over = false;
    this.finalStarted = false;
    this.mistakes = {};
    this.lastSent = -1e9;
    this.sentKey = '';
    this.startAt = (room.data && room.data.startAt) || 0;
    this.board = new Board({ stage: this.rng.pick(phaseAt(this.cards, 0).stages), rng: this.rng, preferModel: () => null });
    const me = {
      id: 0, uid: room.uid, me: true, name: '', char: null, alive: true, meter: 0, chain: 0, maxChain: 0, valves: 0,
      pending: [], justs: 0, misses: 0, coolSent: 0, coolRecv: [], lastJustAt: null, targetAt: 0,
      mode: 'random', randTarget: null, randAt: -1e9, coolTarget: null, cheerFor: null, lastHitBy: null, killer: null,
    };
    this.players = [me];
    this.me = me;
    this._sync();
    // 試合が始まってからのイベントだけを受け取る
    this.offEvents = room.onEvent((key, ev) => this._onEvent(ev));
  }

  get stage() { return this.board.stage; }
  get total() { return this.players.length; }
  get aliveCount() { return this.players.filter((p) => p.alive).length; }
  alive() { return this.players.filter((p) => p.alive); }
  drain() { const e = this.events; this.events = []; return e; }
  byUid(uid) { return this.players.find((p) => p.uid === uid) || null; }

  // 部屋のデータから、ほかの参加者の表示を作り直す（自分は id 0、ほかは参加順に 1〜）
  _sync() {
    const all = (this.room.data && this.room.data.players) || {};
    const ps = Object.entries(all).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    const meData = all[this.room.uid];
    if (meData) { this.me.name = meData.name; this.me.char = meData.char || null; }
    for (const p of ps) {
      if (p.uid === this.room.uid) continue;
      let q = this.byUid(p.uid);
      if (!q) {
        if (p.left) continue; // 試合の前に抜けた人は並べない
        q = { id: this.players.length, uid: p.uid, me: false, pending: [], alive: true };
        this.players.push(q);
      }
      const wasAlive = q.alive;
      const alive = p.alive !== false && !p.left;
      Object.assign(q, {
        name: p.name, char: p.char || 'boyle', meter: p.meter || 0, chain: p.chain || 0, alive,
        valves: p.valves || 0, burstAt: p.burstAt || q.burstAt || null, targeting: p.targeting || '', stats: p.stats || null,
        maxChain: Math.max(q.maxChain || 0, p.chain || 0, (p.stats && p.stats.maxChain) || 0),
        coolSent: (p.stats && p.stats.coolSent) || q.coolSent || 0,
      });
      if (wasAlive && !alive) {
        if (!q.burstAt) q.burstAt = this.room.net.serverNow();
        const by = p.burstBy ? this.byUid(p.burstBy) : null;
        q.killer = by ? by.id : null;
        this.events.push({ type: 'burst', id: q.id, by: q.killer });
      }
    }
    this._finalCheck();
    if (this.room.data && this.room.data.state === 'result') this._end();
  }

  // 残り2人：決勝。冷却係は2つの応援団に分かれる（全員のスマホで同じ分け方になるよう、uid の順で決める）
  _finalCheck() {
    const alive = this.alive();
    if (alive.length !== 2 || this.finalStarted) return;
    this.finalStarted = true;
    const fin = alive.map((p) => p.uid).sort();
    const cool = this.players.filter((p) => !p.alive).map((p) => p.uid).sort();
    const i = cool.indexOf(this.me.uid);
    if (i >= 0) this.me.cheerFor = this.byUid(fin[i % 2]).id;
    this.events.push({ type: 'final', ids: alive.map((p) => p.id) });
  }

  _end() {
    if (this.over) return;
    this.over = true;
    if (this.offEvents) { this.offEvents(); this.offEvents = null; }
    const me = this.me;
    if (me.alive) me.rank = 1;
    this.room.updateMe({ stats: { justs: me.justs, maxChain: me.maxChain, coolSent: me.coolSent } });
  }

  // ---------- 攻撃先（6.5） ----------
  // ほかの人：部屋のデータの targeting（攻撃先の uid）を使う
  targetsOf(p) {
    if (!p.alive) return [];
    if (!p.me) { const t = this.byUid(p.targeting); return t && t.alive ? [t.id] : []; }
    const others = this.players.filter((q) => q.alive && !q.me);
    if (!others.length) return [];
    switch (p.mode) {
      case 'counter': {
        const att = this.attackersOf(0);
        return att.length ? att : [this._random(p, others)];
      }
      case 'finish': {
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

  _random(p, pool) {
    if (!pool.some((q) => q.id === p.randTarget)) { p.randTarget = this.rng.pick(pool).id; p.randAt = this.clock; }
    return p.randTarget;
  }

  // 今わたしを狙っている人（その人の targeting がわたし）
  attackersOf(id) {
    if (id !== 0) return [];
    return this.players.filter((q) => !q.me && q.alive && q.targeting === this.me.uid).map((q) => q.id);
  }

  setMode(mode) { this.me.mode = mode; this._publish(true); }

  coolTargetOf(p) {
    if (p.cheerFor !== null && this.players[p.cheerFor] && this.players[p.cheerFor].alive) return p.cheerFor;
    if (p.coolTarget !== null && this.players[p.coolTarget] && this.players[p.coolTarget].alive) return p.coolTarget;
    const pool = this.players.filter((q) => q.alive && q.id !== p.killer);
    const list = pool.length ? pool : this.alive();
    if (!list.length) return null;
    const top = Math.max(...list.map((q) => q.meter));
    return list.find((q) => q.meter === top).id;
  }

  setCoolTarget(id) {
    if (this.me.cheerFor !== null) return false;
    const q = this.players[id];
    if (!q || !q.alive || q.me) return false;
    this.me.coolTarget = id;
    return true;
  }

  // ---------- 受け取ったイベント ----------
  _onEvent(ev) {
    if (!ev || this.over) return;
    if (ev.t && this.startAt && ev.t < this.startAt - 2000) return; // 前の試合のイベント
    const me = this.me;
    const B = CONFIG.BATTLE;
    const from = this.byUid(ev.from);
    if (ev.from === me.uid) return;
    if (ev.type === 'heat') {
      if (from) this.events.push({ type: 'heat', from: from.id, made: ev.amount, offset: 0, sent: [[this.byUid(ev.to) ? this.byUid(ev.to).id : -1, ev.amount]] });
      if (ev.to === me.uid && me.alive) {
        me.pending.push({ amt: ev.amount, at: this.clock + B.LAND_MS, from: from ? from.id : null, fromUid: ev.from });
        me.pending.sort((a, b) => a.at - b.at);
      }
    } else if (ev.type === 'cool') {
      if (ev.to === me.uid && me.alive) {
        // 1人が受け取れる冷却ガスは10秒に3回まで（受け取る側で数える）
        me.coolRecv = me.coolRecv.filter((t) => this.clock - t < B.COOL_WINDOW_MS);
        if (me.coolRecv.length < B.COOL_LIMIT) {
          me.coolRecv.push(this.clock);
          if (me.pending.length) me.pending.shift();
          else me.meter = Math.max(0, me.meter + B.COOL_METER);
          this.events.push({ type: 'cool', from: from ? from.id : -1, to: 0 });
        }
      }
    } else if (ev.type === 'burst') {
      // 破裂させた人にバルブ（破裂した人のバルブすべて ＋ 1）
      if (ev.to === me.uid && me.alive) {
        me.valves = Math.min(20, me.valves + (ev.amount || 1));
        this.events.push({ type: 'ko', id: from ? from.id : -1 });
        this._publish(true);
      }
    }
  }

  // ---------- 時間を進める ----------
  tick(dt) {
    if (this.over) return [];
    const B = CONFIG.BATTLE;
    const me = this.me;
    this.clock += dt;
    const ph = phaseAt(this.cards, this.clock);
    if (ph.index !== this.phase) {
      if (this.phase !== undefined) this.events.push({ type: 'phase', index: ph.index, stages: ph.stages });
      this.phase = ph.index;
    }
    if (me.alive) {
      if (this.clock - me.randAt >= B.RANDOM_REPICK_MS) {
        const pool = this.players.filter((q) => q.alive && !q.me);
        if (pool.length) { me.randTarget = this.rng.pick(pool).id; me.randAt = this.clock; }
      }
      this.riseAcc += dt;
      while (this.riseAcc >= ph.riseMs) { this.riseAcc -= ph.riseMs; me.meter = Math.min(100, me.meter + 1); }
      // 着弾（6.3）
      let landed = 0;
      while (me.pending.length && me.pending[0].at <= this.clock) {
        const h = me.pending.shift();
        landed += h.amt;
        me.meter = Math.min(100, me.meter + h.amt * B.METER_PER_HEAT);
        me.lastHitBy = h.fromUid || null;
      }
      if (landed > 0) {
        let jamInfo = null;
        if (landed >= B.JAM_AT) {
          const b = this.board;
          const hasK = b.hand.some((c, i) => c && c.type === 'tset_k' && !b.isOnField(i));
          jamInfo = hasK && this.rng.next() < 0.5 ? sendToCelsius(b, this.rng) : sendFrost(b, this.rng);
        }
        this.events.push({ type: 'land', to: 0, amt: landed, jam: landed >= B.JAM_AT, jamInfo });
      }
    }
    if (me.chain > 0 && me.lastJustAt !== null && this.clock - me.lastJustAt > B.CHAIN_TIMEOUT_MS) me.chain = 0;
    this._checkBurst();
    this._sync();
    this._publish();
    // 生き残りが1人以下になったら、部屋を作った人の端末が結果に進める（7.4-3）
    if (this.room.isHost && this.room.data && this.room.data.state === 'playing' && this.aliveCount <= 1) {
      this.room.setState('result').then(() => this.room.clearEvents());
    }
    return [];
  }

  _checkBurst() {
    const me = this.me;
    if (!me.alive || me.meter < 100) return;
    me.alive = false;
    me.pending = [];
    me.chain = 0;
    me.burstAt = this.room.net.serverNow(); // 順位を決めるため、自分の分も覚えておく
    const killer = me.lastHitBy ? this.byUid(me.lastHitBy) : null;
    me.killer = killer ? killer.id : null;
    const gift = Math.min(20, me.valves + 1);
    me.valves = 0;
    this.events.push({ type: 'burst', id: 0, by: me.killer });
    const upd = { alive: false, meter: 100, valves: 0, burstAt: this.room.net.ts() };
    if (killer) upd.burstBy = killer.uid;
    this.room.updateMe(upd);
    // 破裂のイベント（7.4）：破裂させた人を to にして、バルブの数を amount で渡す
    const ev = { type: 'burst' };
    if (killer) { ev.to = killer.uid; ev.amount = gift; }
    this.room.sendEvent(ev);
  }

  // 危険メーター・連鎖・バルブ・攻撃先は、変わったときに送る（0.3秒に1回まで。7.1）
  _publish(force = false) {
    const me = this.me;
    const t = me.alive ? this.targetsOf(me)[0] : null;
    const tUid = t !== undefined && t !== null && this.players[t] ? this.players[t].uid : '';
    const key = `${Math.round(me.meter)}|${me.chain}|${me.alive}|${me.valves}|${tUid}`;
    if (!force && (key === this.sentKey || this.clock - this.lastSent < 300)) return;
    if (force && key === this.sentKey) return;
    this.sentKey = key;
    this.lastSent = this.clock;
    this.room.updateMe({ meter: Math.round(me.meter), chain: me.chain, alive: me.alive, valves: me.valves, targeting: tUid });
  }

  // ---------- 自分の操作 ----------
  onJust(result, at = this.clock) {
    const B = CONFIG.BATTLE;
    const me = this.me;
    const smart = result.count === this.board.minCount;
    const speed = at - me.targetAt <= B.SPEED_MS;
    me.justs++;
    me.chain++;
    me.maxChain = Math.max(me.maxChain, me.chain);
    me.lastJustAt = this.clock;
    let info = { made: 0, offset: 0, sent: [], cooled: null };
    if (me.alive) {
      me.meter = Math.max(0, me.meter + B.METER_JUST + (smart ? CONFIG.DOJO.METER_SMART : 0) + (speed ? CONFIG.DOJO.METER_SPEED : 0));
      let heat = heatOf({ chain: me.chain, smart, speed, valves: me.valves });
      info.made = heat;
      // 相殺：まず自分の着弾待ちを古い順に打ち消す
      while (heat > 0 && me.pending.length) {
        const h = me.pending[0];
        const k = Math.min(h.amt, heat);
        h.amt -= k; heat -= k; info.offset += k;
        if (h.amt <= 0) me.pending.shift();
      }
      if (heat > 0) {
        const ids = this.targetsOf(me);
        const each = Math.floor(heat / Math.max(1, ids.length));
        let rest = heat - each * ids.length;
        ids.forEach((id) => {
          const amt = Math.min(20, each + (rest > 0 ? rest : 0));
          rest = 0;
          if (amt <= 0) return;
          this.room.sendEvent({ type: 'heat', to: this.players[id].uid, amount: amt });
          info.sent.push([id, amt]);
        });
      }
    } else {
      // 冷却係：冷却ガスを1回送る（受け取れるかどうかは、受け取る側が数える）
      const id = this.coolTargetOf(me);
      if (id !== null) {
        this.room.sendEvent({ type: 'cool', to: this.players[id].uid });
        me.coolSent++;
        info.cooled = id;
      }
    }
    this.board.stage = this.rng.pick(phaseAt(this.cards, this.clock).stages);
    this.board.commitJust(result);
    me.targetAt = this.clock;
    this._publish(true);
    return { chain: me.chain, smart, speed, points: 0, ...info, cooling: !me.alive };
  }

  onMiss(result) {
    const me = this.me;
    me.misses++;
    me.chain = 0;
    if (result.mistake) this.mistakes[result.mistake] = (this.mistakes[result.mistake] || 0) + 1;
    if (me.alive) me.meter = Math.min(100, me.meter + CONFIG.BATTLE.METER_MISS);
    this.board.commitMiss();
    this._checkBurst();
  }

  onReroll() {
    const me = this.me;
    if (me.alive) me.meter = Math.min(100, me.meter + CONFIG.BATTLE.METER_REROLL);
    this.board.reroll();
    me.targetAt = this.clock;
    this._checkBurst();
  }

  // 順位：生き残った人が1位、あとは破裂したのが遅い順
  ranking() {
    const ps = this.players.slice();
    ps.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return (b.burstAt || 0) - (a.burstAt || 0);
    });
    return ps.map((p, i) => ({ id: p.id, rank: i + 1 }));
  }

  // 結果（6.10）：全員に、優勝者・最長連鎖・最多バルブ・冷却MVP。自分にだけ、順位・ジャスト率など
  summary() {
    this._sync();
    const rk = this.ranking();
    const me = this.me;
    const myRank = (rk.find((r) => r.id === 0) || { rank: this.total }).rank;
    // 同じ数のときは、どのスマホでも同じ人になるよう uid の順で決める
    const best = (f) => this.players.reduce((a, b) => (f(b) > f(a) || (f(b) === f(a) && b.uid < a.uid) ? b : a), this.players[0]);
    const ch = best((p) => p.maxChain || 0);
    const va = best((p) => p.valves || 0);
    const co = best((p) => p.coolSent || 0);
    return {
      won: myRank === 1 && me.alive, rank: myRank, total: this.total, justs: me.justs, misses: me.misses,
      maxChain: me.maxChain, valves: me.valves, coolSent: me.coolSent, timeMs: this.clock, winner: rk.length ? rk[0].id : null,
      chainTop: { id: ch.id, n: ch.maxChain || 0 }, valveTop: { id: va.id, n: va.valves || 0 }, coolTop: { id: co.id, n: co.coolSent || 0 },
      players: this.players.map((p) => ({ id: p.id, char: p.char, name: p.name, me: p.me })),
      ranking: rk, mistakes: { ...this.mistakes }, level: null, opponents: this.total - 1, live: true,
    };
  }
}
