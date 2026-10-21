// 音の合成と効果音（9.4、9.5）。既存の音声ファイルは使わず、その場で合成する。
// スマホは画面に触れるまで音を出せないので、最初のタップで unlock() を呼ぶ。

import { CONFIG } from './config.js?v=0.7.0';

// ヘ長調のペンタトニック（F G A C D）。ジャストの音は連鎖ごとに1段ずつ上がる
const PENTA = [0, 2, 4, 7, 9];
const F4 = 65;
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const pentaNote = (deg, base = F4) => base + 12 * Math.floor(deg / 5) + PENTA[((deg % 5) + 5) % 5];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  get ready() {
    return !!this.ctx && !this.muted;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // 最初のタップで呼ぶ
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this._build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.ctx = null;
    }
  }

  _build() {
    const c = this.ctx;
    const A = CONFIG.AUDIO;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : A.MASTER;
    // 鳴りすぎを防ぐ
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);

    this.sfx = c.createGain();
    this.sfx.gain.value = A.SFX;
    this.sfx.connect(this.master);

    // 曲：ドラム → 曲の出口、それ以外の楽器 → ポンピング → 曲の出口
    this.musicOut = c.createGain();
    this.musicOut.gain.value = A.MUSIC;
    this.musicFilter = c.createBiquadFilter();       // ハズレのとき、こもらせる
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicOut.connect(this.musicFilter).connect(this.master);
    this.drums = c.createGain();
    this.drums.connect(this.musicOut);
    this.pump = c.createGain();                       // バスドラムの瞬間に一瞬下げる
    this.pump.connect(this.musicOut);

    // ノイズ（ハイハット、紙の音、破裂音）
    const len = Math.floor(c.sampleRate * 1.0);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : CONFIG.AUDIO.MASTER, t, 0.03);
    }
  }

  suspend() {
    try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* 無視 */ }
  }

  resume() {
    try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { /* 無視 */ }
  }

  // ---------- 部品 ----------
  // 音程のある音
  tone({ type = 'sine', freq, freqEnd = null, start = this.now(), dur = 0.2, gain = 0.3, attack = 0.005,
    release = null, dest = this.sfx, filter = null, filterQ = 1, detune = 0 }) {
    if (!this.ctx) return null;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + dur);
    if (detune) o.detune.value = detune;
    const g = c.createGain();
    const rel = release ?? dur;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.01, rel));
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = filterQ;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    o.start(start);
    o.stop(start + Math.max(attack + 0.02, rel) + 0.05);
    return o;
  }

  // ノイズ
  noise({ start = this.now(), dur = 0.1, gain = 0.2, type = 'bandpass', freq = 2000, freqEnd = null, Q = 1, dest = this.sfx, attack = 0.003 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    f.Q.value = Q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(start, Math.random() * 0.5);
    s.stop(start + dur + 0.05);
  }

  // ---------- 効果音 ----------
  // カードを場に置く：軽い紙の音。左の枠から順に音程が上がる
  place(slot = 0) {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 0.06, gain: 0.25, freq: 3000 + slot * 700, Q: 1.2 });
    this.tone({ type: 'triangle', freq: midiToHz(pentaNote(5 + slot * 2)), start: t, dur: 0.12, gain: 0.12 });
  }

  // カードを手札に戻す：逆向きの短い音
  unplace() {
    if (!this.ready) return;
    const t = this.now();
    this.tone({ type: 'triangle', freq: 880, freqEnd: 440, start: t, dur: 0.09, gain: 0.1 });
    this.noise({ start: t, dur: 0.05, gain: 0.12, freq: 1800, freqEnd: 900 });
  }

  // カードが吸い込まれる音（1枚ずつ）
  suck(i = 0) {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 0.18, gain: 0.22, freq: 600 + i * 200, freqEnd: 4000 + i * 600, Q: 3, attack: 0.03 });
  }

  // 針が振れる音
  needle(up = true) {
    if (!this.ready) return;
    const t = this.now();
    this.tone({ type: 'sine', freq: up ? 420 : 620, freqEnd: up ? 620 : 420, start: t, dur: 0.16, gain: 0.08 });
  }

  // ジャスト：曲の調に合ったキラッとした和音。連鎖ごとに1段ずつ上がる
  just(chain = 1, { smart = false, speed = false } = {}) {
    if (!this.ready) return;
    const t = this.now();
    const d = Math.min(Math.max(chain - 1, 0), 14);
    const degs = [d, d + 2, d + 4];
    if (smart) degs.push(d + 7);
    if (speed) degs.push(d + 9);
    degs.forEach((g, k) => {
      const f = midiToHz(pentaNote(g));
      const at = t + k * 0.045;
      this.tone({ type: 'triangle', freq: f, start: at, dur: 0.5, gain: 0.16 });
      this.tone({ type: 'sine', freq: f * 2, start: at, dur: 0.35, gain: 0.06 });
    });
    this.noise({ start: t, dur: 0.25, gain: 0.08, type: 'highpass', freq: 7000 });
  }

  // ハズレ：柔らかい低い音1つ
  miss() {
    if (!this.ready) return;
    const t = this.now();
    this.tone({ type: 'sine', freq: 174.6, freqEnd: 155, start: t, dur: 0.45, gain: 0.22, attack: 0.02 });
  }

  // 引き直し：カードをめくる音
  reroll() {
    if (!this.ready) return;
    const t = this.now();
    for (let k = 0; k < 5; k++) this.noise({ start: t + k * 0.04, dur: 0.05, gain: 0.15, freq: 2500 + k * 300, Q: 1.5 });
  }

  // 置けないとき
  deny() {
    if (!this.ready) return;
    this.tone({ type: 'square', freq: 220, start: this.now(), dur: 0.08, gain: 0.05, filter: 900 });
  }

  // フィーバー：上昇音のあとの、はじける音
  feverStart(superFever = false) {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 1.2, gain: 0.18, type: 'highpass', freq: 5000, attack: 0.005 });
    const degs = superFever ? [10, 12, 14, 15, 17] : [5, 7, 9, 10, 12];
    degs.forEach((g, k) => this.tone({ type: 'sawtooth', freq: midiToHz(pentaNote(g)), start: t + k * 0.06, dur: 0.4, gain: 0.06, filter: 4000 }));
  }

  // 連鎖が切れた
  chainLost() {
    if (!this.ready) return;
    const t = this.now();
    this.tone({ type: 'triangle', freq: 523, freqEnd: 262, start: t, dur: 0.3, gain: 0.08 });
  }

  // 鼓動（危険メーター75以上）
  heartbeat(at) {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 62, freqEnd: 40, start: at, dur: 0.16, gain: 0.5, dest: this.drums });
    this.tone({ type: 'sine', freq: 55, freqEnd: 38, start: at + 0.14, dur: 0.14, gain: 0.32, dest: this.drums });
  }

  // 破裂：ポンッ
  burst() {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 0.5, gain: 0.6, type: 'lowpass', freq: 3000, freqEnd: 200, attack: 0.002 });
    this.tone({ type: 'sine', freq: 160, freqEnd: 40, start: t, dur: 0.5, gain: 0.6 });
  }

  // 自己ベスト・昇段など：盛り上がりと拍手風の音
  fanfare() {
    if (!this.ready) return;
    const t = this.now();
    [0, 2, 4, 5, 7].forEach((g, k) => {
      this.tone({ type: 'triangle', freq: midiToHz(pentaNote(g + 5)), start: t + k * 0.09, dur: 0.6, gain: 0.12 });
    });
    for (let k = 0; k < 24; k++) {
      this.noise({ start: t + 0.4 + Math.random() * 1.2, dur: 0.04, gain: 0.08 + Math.random() * 0.06, freq: 1500 + Math.random() * 1500, Q: 2 });
    }
  }

  // カードパック：封を切る音
  packTear() {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 0.35, gain: 0.3, type: 'bandpass', freq: 1500, freqEnd: 6000, Q: 0.8, attack: 0.01 });
  }

  // カードパック：めくる音。レア度に応じて3段階に盛り上がる
  packFlip(rarity = 'normal') {
    if (!this.ready) return;
    const t = this.now();
    this.noise({ start: t, dur: 0.08, gain: 0.2, freq: 3000, Q: 1 });
    const degs = rarity === 'kimo' ? [0, 2, 4, 5, 7, 9, 10, 12] : rarity === 'rare' ? [2, 4, 7, 9] : [4];
    degs.forEach((g, k) => this.tone({ type: rarity === 'kimo' ? 'sawtooth' : 'triangle', freq: midiToHz(pentaNote(g + 5)), start: t + 0.05 + k * 0.06, dur: 0.4, gain: rarity === 'normal' ? 0.1 : 0.12, filter: 5000 }));
    if (rarity !== 'normal') this.noise({ start: t + 0.05, dur: 0.8, gain: rarity === 'kimo' ? 0.16 : 0.1, type: 'highpass', freq: 6000 });
    if (rarity === 'kimo') this.tone({ type: 'sine', freq: 90, freqEnd: 45, start: t, dur: 0.5, gain: 0.4 });
  }

  // ボタン
  click() {
    if (!this.ready) return;
    this.tone({ type: 'triangle', freq: 660, start: this.now(), dur: 0.05, gain: 0.07 });
  }
}
