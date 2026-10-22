// みんなで対戦（ライブ対戦）。v1.0：部屋をつくる・入る・待合室・同時スタート・ほかの参加者の表示。
// 熱波のやりとり・相殺・おじゃま・攻撃先・バルブ・冷却係は v1.1 で battle.js のルールを使ってつなぐ。
// 通信は net.js（Firebase か、動作確認用のにせもの）。データの形は仕様書 7.2。

import { CONFIG } from './config.js?v=1.0.0';
import { Board } from './game.js?v=1.0.0';
import { createRng } from './rng.js?v=1.0.0';
import { phaseAt } from './battle.js?v=1.0.0';

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

// ---------- 試合（v1.0：各自が自分の盤面を解き、危険メーターなどを送り合って表示する） ----------
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
    this.mistakes = {};
    this.lastSent = -1e9;
    this.sentKey = '';
    this.board = new Board({ stage: this.rng.pick(phaseAt(this.cards, 0).stages), rng: this.rng, preferModel: () => null });
    const me = { id: 0, uid: room.uid, me: true, name: '', char: null, alive: true, meter: 0, chain: 0, maxChain: 0, valves: 0, pending: [], justs: 0, misses: 0, coolSent: 0, lastJustAt: null, targetAt: 0, mode: 'random' };
    this.players = [me];
    this.me = me;
    this._sync();
  }

  get stage() { return this.board.stage; }
  get total() { return this.players.length; }
  get aliveCount() { return this.players.filter((p) => p.alive).length; }
  drain() { const e = this.events; this.events = []; return e; }

  // 部屋のデータから、ほかの参加者の表示を作り直す（自分は id 0、ほかは参加順に 1〜）
  _sync() {
    const ps = this.room.players();
    const meData = ps.find((p) => p.uid === this.room.uid);
    if (meData) { this.me.name = meData.name; this.me.char = meData.char || null; }
    const others = ps.filter((p) => p.uid !== this.room.uid);
    const all = (this.room.data && this.room.data.players) || {};
    others.forEach((p, i) => {
      let q = this.players.find((x) => x.uid === p.uid);
      if (!q) { q = { id: this.players.length, uid: p.uid, me: false, pending: [] }; this.players.push(q); }
      const wasAlive = q.alive;
      Object.assign(q, { name: p.name, char: p.char || 'boyle', meter: p.meter || 0, chain: p.chain || 0, alive: p.alive !== false, valves: p.valves || 0, burstAt: p.burstAt || null });
      if (wasAlive === true && !q.alive) this.events.push({ type: 'burst', id: q.id, by: null });
    });
    // 途中で抜けた人も、破裂したことにして並べたままにする
    this.players.forEach((q) => { if (!q.me && all[q.uid] && all[q.uid].left && q.alive) { q.alive = false; this.events.push({ type: 'burst', id: q.id, by: null }); } });
    if (this.room.data && this.room.data.state === 'result') this.over = true;
  }

  // v1.0 は熱波がないので、攻撃先・狙われ・冷却は空にしておく（画面の作りは CPU 戦と同じ）
  targetsOf() { return []; }
  attackersOf() { return []; }
  coolTargetOf() { return null; }
  setMode() {}
  setCoolTarget() { return false; }

  tick(dt) {
    if (this.over) return [];
    const B = CONFIG.BATTLE;
    const me = this.me;
    this.clock += dt;
    const ph = phaseAt(this.cards, this.clock);
    if (me.alive) {
      this.riseAcc += dt;
      while (this.riseAcc >= ph.riseMs) { this.riseAcc -= ph.riseMs; me.meter = Math.min(100, me.meter + 1); }
      if (me.chain > 0 && me.lastJustAt !== null && this.clock - me.lastJustAt > B.CHAIN_TIMEOUT_MS) me.chain = 0;
    }
    this._checkBurst();
    this._sync();
    this._publish();
    // 生き残りが1人以下になったら、部屋を作った人の端末が結果に進める（7.4-3）
    if (this.room.isHost && this.room.data && this.room.data.state === 'playing' && this.aliveCount <= 1) this.room.setState('result');
    return [];
  }

  _checkBurst() {
    const me = this.me;
    if (!me.alive || me.meter < 100) return;
    me.alive = false;
    me.burstAt = this.room.net.serverNow(); // 順位を決めるため、自分の分も覚えておく
    this.events.push({ type: 'burst', id: 0, by: null });
    this.room.updateMe({ alive: false, meter: 100, burstAt: this.room.net.ts() });
  }

  // 危険メーターと連鎖は、変わったときに送る（0.3秒に1回まで。7.1）
  _publish(force = false) {
    const me = this.me;
    const key = `${Math.round(me.meter)}|${me.chain}|${me.alive}`;
    if (!force && (key === this.sentKey || this.clock - this.lastSent < 300)) return;
    this.sentKey = key;
    this.lastSent = this.clock;
    this.room.updateMe({ meter: Math.round(me.meter), chain: me.chain, alive: me.alive });
  }

  onJust(result, at = this.clock) {
    const B = CONFIG.BATTLE;
    const me = this.me;
    const smart = result.count === this.board.minCount;
    const speed = at - me.targetAt <= B.SPEED_MS;
    me.justs++;
    me.chain++;
    me.maxChain = Math.max(me.maxChain, me.chain);
    me.lastJustAt = this.clock;
    if (me.alive) me.meter = Math.max(0, me.meter + B.METER_JUST + (smart ? CONFIG.DOJO.METER_SMART : 0) + (speed ? CONFIG.DOJO.METER_SPEED : 0));
    this.board.stage = this.rng.pick(phaseAt(this.cards, this.clock).stages);
    this.board.commitJust(result);
    me.targetAt = this.clock;
    this._publish(true);
    return { chain: me.chain, smart, speed, points: 0, made: 0, offset: 0, sent: [], cooling: !me.alive, cooled: null };
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

  summary() {
    const rk = this.ranking();
    const me = this.me;
    const myRank = (rk.find((r) => r.id === 0) || { rank: this.total }).rank;
    const winner = rk.length ? rk[0].id : null;
    const top = (f) => this.players.reduce((a, b) => (f(b) > f(a) ? b : a), this.players[0]);
    const ch = top((p) => p.id === 0 ? p.maxChain : (p.chain || 0));
    // 送ってもらった集計（7.2 の stats）は v1.1 でそろえる。v1.0 は自分の記録だけ
    this.room.updateMe({ stats: { justs: me.justs, maxChain: me.maxChain, coolSent: 0 } });
    return {
      won: myRank === 1 && me.alive, rank: myRank, total: this.total, justs: me.justs, misses: me.misses,
      maxChain: me.maxChain, valves: me.valves, coolSent: 0, timeMs: this.clock, winner,
      chainTop: { id: ch.id, n: ch.id === 0 ? ch.maxChain : 0 }, valveTop: { id: 0, n: 0 }, coolTop: { id: 0, n: 0 },
      players: this.players.map((p) => ({ id: p.id, char: p.char, name: p.name, me: p.me })),
      ranking: rk, mistakes: { ...this.mistakes }, level: null, opponents: this.total - 1, live: true,
    };
  }
}
