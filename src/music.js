// 曲の設計（9.1〜9.3）：連鎖で育つ音楽。
// 4つ打ちのドラムに、連鎖が伸びるほど楽器が加わり、フィーバーで一気に解放される。
// 楽器の出し入れは、必ず次の小節の頭にそろえる。

import { CONFIG } from './config.js?v=0.3.0';
import { midiToHz } from './audio.js?v=0.3.0';

const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];
// I–V–vi–IV
const PROG = [[0, MAJ], [7, MAJ], [9, MIN], [5, MAJ]];

// 少なくとも3曲。同じ仕組みで、テンポ・調・音色を変える
export const SONGS = {
  dojo: {        // 道場：124 BPM、ヘ長調（F–C–Dm–B♭）
    bpm: 124, root: 41, prog: PROG,
    bass: 'sawtooth', pad: 'sawtooth', arp: 'square', lead: 'triangle', padCut: 1800,
    melody: [[7, null, 9, 7, 5, null, 4, null], [4, null, 5, 4, 2, null, 0, null], [2, 4, 5, null, 7, 9, 7, null], [5, null, 4, 2, 4, null, null, null]],
  },
  practice: {    // 練習室：112 BPM、ハ長調、やわらかい音色
    bpm: 112, root: 36, prog: PROG,
    bass: 'triangle', pad: 'triangle', arp: 'triangle', lead: 'sine', padCut: 1400,
    melody: [[4, null, 5, null, 7, null, 5, null], [4, null, 2, null, 0, null, null, null], [2, null, 4, null, 5, null, 7, null], [9, null, 7, null, 5, null, 4, null]],
  },
  battle: {      // 対戦：128 BPM、ト長調（v0.6 から使う）
    bpm: 128, root: 43, prog: PROG,
    bass: 'square', pad: 'sawtooth', arp: 'sawtooth', lead: 'square', padCut: 2400,
    melody: [[9, 7, 9, null, 7, 5, 4, null], [5, 4, 2, null, 4, null, 0, null], [7, null, 9, 11, 12, null, 11, 9], [7, null, 5, null, 4, 2, 4, null]],
  },
};

// 長調の音階（メロディー用）
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const scaleNote = (deg) => 12 * Math.floor(deg / 7) + SCALE[((deg % 7) + 7) % 7];

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.song = null;
    this.timer = null;
    this.level = 0;          // 0：ドラム＋ベース 1：＋和音 2：＋アルペジオと溜め 3：フィーバー 4：超フィーバー
    this.pending = 0;
    this.drop = 0;           // ハズレで1段階減らす
    this.heartbeat = false;
    this.step = 0;
    this.nextTime = 0;
  }

  get playing() { return !!this.timer; }

  start(songId) {
    const a = this.audio;
    if (!a.ctx) return;
    this.stop();
    this.song = SONGS[songId] || SONGS.dojo;
    this.songId = songId;
    this.step = 0;
    this.bar = 0;
    this.level = this.pending = 0;
    this.drop = 0;
    this.nextTime = a.now() + 0.08;
    this.timer = setInterval(() => this._schedule(), CONFIG.AUDIO.LOOKAHEAD_MS);
    this._schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // 状態から楽器の段階を決める（実際に変わるのは次の小節の頭）
  setState({ chain = 0, fever = false, superFever = false }) {
    const L = CONFIG.AUDIO.CHAIN_LAYERS;
    let lv = 0;
    if (chain >= L[1]) lv = 1;
    if (chain >= L[2]) lv = 2;
    if (fever) lv = 3;
    if (superFever) lv = 4;
    if (chain > 0) this.drop = 0;
    this.pending = lv;
  }

  // ハズレ：0.5秒こもり、楽器が1段階減る
  onMiss() {
    const a = this.audio;
    if (!a.ctx) return;
    const t = a.now();
    const f = a.musicFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(500, t);
    f.exponentialRampToValueAtTime(18000, t + CONFIG.AUDIO.MISS_MUFFLE_S);
    this.drop = 1;
  }

  setHeartbeat(on) { this.heartbeat = on; }

  // ---------- 先読みの予約 ----------
  _schedule() {
    const a = this.audio;
    if (!a.ctx || a.ctx.state !== 'running') return;
    const s16 = 60 / this.song.bpm / 4;
    // 長く止まっていたら、今から鳴らし直す
    if (this.nextTime < a.now() - 0.2) this.nextTime = a.now() + 0.05;
    while (this.nextTime < a.now() + CONFIG.AUDIO.SCHEDULE_AHEAD_S) {
      this._playStep(this.step, this.nextTime, s16);
      this.nextTime += s16;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  _playStep(step, t, s16) {
    const a = this.audio;
    const song = this.song;
    if (step === 0) {
      // 小節の頭：楽器の出し入れ
      const before = this.level;
      this.level = Math.max(0, this.pending - this.drop);
      if (this.level >= 3 && before < 3) this._crash(t);
    }
    const lv = this.level;
    const [rootOff, chord] = song.prog[this.bar % 4];
    const root = song.root + rootOff;
    const beat = step % 4 === 0;

    // ---- ドラム（どの段階でも） ----
    if (beat) {
      this._kick(t);
      this._pumpAt(t);
      if (this.heartbeat && (step === 0 || step === 8)) a.heartbeat(t + 0.01);
    }
    if (step % 4 === 2) this._hat(t, 0.09);
    else if (lv >= 3 && step % 2 === 1) this._hat(t, 0.035);
    if (step === 4 || step === 12) this._clap(t);

    // ---- ベース（裏拍の8分） ----
    if (step % 4 === 2 || (lv >= 3 && step % 4 === 3 && step === 15)) {
      a.tone({ type: song.bass, freq: midiToHz(root), start: t, dur: s16 * 1.6, gain: 0.22, filter: 600, filterQ: 4, dest: a.pump });
    }

    // ---- 和音（2連鎖から） ----
    if (lv >= 1 && step === 0) {
      const dur = s16 * 16;
      chord.forEach((iv, k) => {
        const f = midiToHz(root + 24 + iv);
        a.tone({ type: song.pad, freq: f, start: t, dur, gain: 0.045, attack: 0.05, filter: song.padCut, dest: a.pump, detune: k === 0 ? -7 : 7 });
      });
    }

    // ---- アルペジオ（4連鎖から） ----
    if (lv >= 2) {
      const seq = [0, 1, 2, 1];
      const n = chord[seq[step % 4]] + 12 * (Math.floor(step / 8) % 2);
      a.tone({ type: song.arp, freq: midiToHz(root + 36 + n), start: t, dur: s16 * 0.9, gain: 0.035, filter: 3500, dest: a.pump });
    }
    // ---- 溜め（4連鎖、フィーバー前だけ）：2小節かけて音程が上がり続ける ----
    if (lv === 2 && step === 0) {
      const dur = s16 * 16;
      const up = this.bar % 2;
      a.tone({ type: 'sawtooth', freq: midiToHz(root + 24 + up * 6), freqEnd: midiToHz(root + 30 + up * 6), start: t, dur, gain: 0.025, attack: dur * 0.9, release: dur, filter: 2500, dest: a.pump });
      a.noise({ start: t, dur, gain: 0.04 + up * 0.03, type: 'bandpass', freq: 800 + up * 1500, freqEnd: 2300 + up * 3000, Q: 2, attack: dur * 0.95, dest: a.pump });
    }

    // ---- メロディー（フィーバーから） ----
    if (lv >= 3 && step % 2 === 0) {
      const m = song.melody[this.bar % 4][step / 2];
      if (m !== null && m !== undefined) {
        const f = midiToHz(song.root + 36 + scaleNote(m));
        a.tone({ type: song.lead, freq: f, start: t, dur: s16 * 1.8, gain: 0.07, filter: 5000, dest: a.pump });
        // 超フィーバー：さらに高いメロディー
        if (lv >= 4) a.tone({ type: 'sine', freq: f * 2, start: t, dur: s16 * 1.6, gain: 0.035, dest: a.pump });
      }
    }
    // ---- コーラス風の音（超フィーバー） ----
    if (lv >= 4 && step === 0) {
      const dur = s16 * 16;
      chord.forEach((iv) => {
        for (const det of [-10, 0, 10]) {
          a.tone({ type: 'sine', freq: midiToHz(root + 36 + iv), start: t, dur, gain: 0.02, attack: 0.25, filter: 1500, dest: a.pump, detune: det });
        }
      });
    }
  }

  _kick(t) {
    const a = this.audio;
    a.tone({ type: 'sine', freq: 150, freqEnd: 45, start: t, dur: 0.28, gain: 0.7, dest: a.drums });
  }

  _hat(t, gain) {
    this.audio.noise({ start: t, dur: 0.045, gain, type: 'highpass', freq: 8000, dest: this.audio.drums });
  }

  _clap(t) {
    const a = this.audio;
    for (let k = 0; k < 3; k++) a.noise({ start: t + k * 0.012, dur: 0.06 + k * 0.03, gain: 0.12, type: 'bandpass', freq: 1500, Q: 1.5, dest: a.drums });
  }

  _crash(t) {
    this.audio.noise({ start: t, dur: 1.4, gain: 0.16, type: 'highpass', freq: 4500, dest: this.audio.drums });
  }

  // ポンピング：バスドラムの瞬間に他の楽器の音量を下げて、約150 msで戻す
  _pumpAt(t) {
    const g = this.audio.pump.gain;
    const A = CONFIG.AUDIO;
    g.setValueAtTime(1 - A.PUMP_DEPTH, t);
    g.linearRampToValueAtTime(1, t + A.PUMP_RECOVER_S);
  }
}
