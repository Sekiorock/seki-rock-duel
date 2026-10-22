// ボンベ（ピストン付きシリンダー）、中の気体の粒、温度計、圧力計の描画。Canvas 2D。
// 立体感は陰影で出す（3D描画は使わない）。色は白・黒が基調、差し色はピンクとシアン（v1.0）。
//
// 見え方のきまり（直感的に分かるように）
//   体積 V … ピストンの高さ（気体の部分の高さは V に比例）
//   温度 T … 左の温度計の高さと、粒の速さ（√T に比例）と粒の色（熱いほど濃い青）
//   圧力 P … 壁を押す矢印の長さ、気体の色の濃さ、圧力計の針。粒が壁に当たると光る
//   物質量 n … 粒の数（n に比例。v0.6〜）
//   混合気体 … 窒素 N₂ は黒の粒、酸素 O₂ はシアンの粒（v0.7〜、v1.0 で配色変更）。温度は粒の速さと温度計で見る

import { CONFIG } from './config.js?v=1.0.0';
import { drawChar } from './chars.js?v=1.0.0';

const NAVY = '#121212';
const BLUE = '#FE2C55';
const PALE = '#D4FAF8';
const WHITE = '#FFFFFF';
const SURFACE = '#F5F5F5';
const CYAN = '#25F4EE';   // 差し色（v1.0）。O₂ の粒など

const V_MAX = Math.max(...CONFIG.VOLUME_UNITS);  // 12 L
const T_MIN = 100;
const T_MAX = Math.max(...CONFIG.TEMPS_K) + 50;

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

// 2つの色（#RRGGBB）を混ぜる
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export class BombeView {
  constructor(canvas, { showGauge = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showGauge = showGauge;
    const s = CONFIG.START_STATE;
    this.cur = { P: s.P, V: s.V, T: s.T, N: s.N };   // いま表示している値（数）
    this.target = null;                       // 目標の圧力（数）
    this.shadow = null;                       // 補助ありのシャドウ { seq, start, onStep }
    this.ghost = null;                        // シャドウの今の状態（数）
    this.ghostAlpha = 0;
    this.danger = 0;                          // 危険メーター（震えに使う）
    this.burstAt = null;                      // 破裂した時刻
    this.tween = null;
    this.rings = [];
    this.hits = [];
    this.wobble = null;
    this.jolt = 0;                            // ピストンが止め具に当たったときの揺れ
    this.particles = [];
    this._initParticles();
    this.last = performance.now();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
    requestAnimationFrame((t) => this._loop(t));
  }

  _initParticles() {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < CONFIG.GAS.PARTICLES * 4; i++) { // 物質量が3倍（混合気体は各12）になっても足りるだけ用意しておく
      const a = rnd() * Math.PI * 2;
      this.particles.push({ x: rnd(), y: rnd(), dx: Math.cos(a), dy: Math.sin(a), sp: 0.7 + rnd() * 0.6 });
    }
  }

  // いま見えている粒。粒の数は物質量に比例する。混合気体では、用意した粒の前半を N₂、後半を O₂ に使う
  // （片方を混ぜても、もう片方の粒は入れ替わらない）
  _liveParticles(st) {
    const per = CONFIG.GAS.PARTICLES / CONFIG.START_STATE.N; // 物質量 1 あたりの粒の数
    if (st.A !== undefined) {
      const half = Math.floor(this.particles.length / 2);
      const na = Math.min(half, Math.round(per * st.A));
      const nb = Math.min(half, Math.round(per * st.B));
      const out = [];
      for (let i = 0; i < na; i++) { const p = this.particles[i]; p.gas = 'A'; out.push(p); }
      for (let i = 0; i < nb; i++) { const p = this.particles[half + i]; p.gas = 'B'; out.push(p); }
      return out;
    }
    const count = Math.max(6, Math.min(this.particles.length, Math.round(per * (st.N ?? CONFIG.START_STATE.N))));
    return this.particles.slice(0, count).map((p) => { p.gas = null; return p; });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 値をすぐに反映する（P は 0.1×10⁵ Pa 単位、V は 0.5 L 単位、T は K の数）
  set(state, target = this.target) {
    this.tween = null;
    this.cur = { N: CONFIG.START_STATE.N, ...state };
    this.target = target;
  }

  // 補助ありのシャドウ：seq は [今の状態, 1枚目のあと, 2枚目のあと, …]（数）。
  // 左のカードから1枚ずつ試すように、半透明のピストン・針・温度計が動き、最後で止まり、また繰り返す。
  // onStep(i) は、いま試しているカードの番号（0〜）。止まっている間は最後の番号、戻る間は -1
  setShadow(seq, onStep = null) {
    if (!seq || seq.length < 2) {
      this.shadow = null;
      this.ghost = null;
      if (this._lastStep !== -1 && this._onStep) this._onStep(-1);
      this._lastStep = -1;
      return;
    }
    this.shadow = { seq: seq.map((x) => ({ ...x })), start: performance.now() };
    this._onStep = onStep;
    this._lastStep = null;
  }

  _updateShadow(now) {
    const sh = this.shadow;
    if (!sh) { this.ghost = null; return; }
    const S = CONFIG.SHADOW;
    const n = sh.seq.length - 1;
    const seg = S.STEP_MS + S.GAP_MS;
    const total = n * seg + S.HOLD_MS + S.RESET_MS;
    // 描画の時刻は、シャドウを始めた時刻よりわずかに前のことがあるので、0 未満にしない
    const t = Math.max(0, now - sh.start) % total;
    let st;
    let step;
    let alpha = 1;
    if (t < n * seg) {
      const i = Math.min(n - 1, Math.max(0, Math.floor(t / seg)));
      const k = easeInOutCubic(Math.min(1, (t - i * seg) / S.STEP_MS));
      const a = sh.seq[i];
      const b = sh.seq[i + 1];
      st = { P: lerp(a.P, b.P, k), V: lerp(a.V, b.V, k), T: lerp(a.T, b.T, k), N: lerp(a.N ?? 6, b.N ?? 6, k) };
      if (a.A !== undefined && b.A !== undefined) { st.A = lerp(a.A, b.A, k); st.B = lerp(a.B, b.B, k); }
      step = i;
      if (t < 200) alpha = t / 200; // 最初は、ふわっと現れる
    } else if (t < n * seg + S.HOLD_MS) {
      st = sh.seq[n];
      step = n - 1;
    } else {
      st = sh.seq[n];
      step = -1;
      alpha = 1 - (t - n * seg - S.HOLD_MS) / S.RESET_MS;
    }
    this.ghost = st;
    this.ghostAlpha = Math.max(0, alpha) * S.ALPHA;
    if (step !== this._lastStep) {
      this._lastStep = step;
      if (this._onStep) this._onStep(step);
    }
  }

  setDanger(m) { this.danger = m; }

  // ボンベの顔（仲間にしたキャラクター）。表情は、ジャスト・ハズレ・危険・破裂で変わる（8.3）
  setFace(id) { this.face = id || null; }
  setExpr(expr, ms = 0) {
    this.expr = expr;
    this.exprUntil = ms ? performance.now() + ms : 0;
  }
  _faceExpr(now) {
    if (this.burstAt) return 'ascend';
    if (this.exprUntil && now < this.exprUntil) return this.expr;
    if (this.danger >= 90) return 'whiteeye';
    return 'normal';
  }

  // 集めた絵柄を、ボンベの正面にラベルとして貼る（img は画像。null ではがす）
  setSticker(img) { this.sticker = img || null; }

  burst() {
    this.burstAt = performance.now();
    this.shake();
  }

  clearBurst() { this.burstAt = null; }

  // 1枚ぶんの変化：ピストン・温度・針を同時に動かす
  animateTo(state, ms = CONFIG.ANIM.STEP_MS) {
    return new Promise((resolve) => {
      if (this.tween) this.tween.resolve();
      this.tween = { from: { ...this.cur }, to: { N: this.cur.N, ...state }, start: performance.now(), ms, resolve };
    });
  }

  ring() { this.rings.push({ start: performance.now() }); }
  shake() { this.wobble = { start: performance.now(), ms: 500 }; }

  // カードが吸い込まれる先（気体の真ん中）を画面座標で返す
  bombeCenter() {
    const r = this.canvas.getBoundingClientRect();
    const g = this._geom();
    const gas = this._gasRect(g, this.cur.V);
    return { x: r.left + g.cx, y: r.top + gas.top + gas.h / 2 };
  }

  // ---------- ループ ----------
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.canvas.getClientRects().length === 0) return; // 見えていない画面では描かない

    if (this.tween) {
      const tw = this.tween;
      const t = Math.min(1, (now - tw.start) / tw.ms);
      const e = easeInOutCubic(t);
      const eP = easeOutQuart(t);
      this.cur = {
        P: lerp(tw.from.P, tw.to.P, eP),
        V: lerp(tw.from.V, tw.to.V, e),
        T: lerp(tw.from.T, tw.to.T, e),
        N: lerp(tw.from.N ?? CONFIG.START_STATE.N, tw.to.N ?? CONFIG.START_STATE.N, e),
      };
      if (tw.to.A !== undefined) {
        this.cur.A = lerp(tw.from.A ?? tw.to.A, tw.to.A, e);
        this.cur.B = lerp(tw.from.B ?? tw.to.B, tw.to.B, e);
      }
      if (t >= 1) {
        this.tween = null;
        // 範囲の外まで動いたら、止め具に当たって揺れる
        if (tw.to.V > V_MAX || tw.to.V < Math.min(...CONFIG.VOLUME_UNITS)) this.jolt = 1;
        tw.resolve();
      }
    }
    this.jolt = Math.max(0, this.jolt - dt * 2.5);
    this._updateShadow(now);
    this._stepParticles(dt, now);
    this.rings = this.rings.filter((r) => now - r.start < CONFIG.ANIM.RING_MS);
    this.hits = this.hits.filter((h) => now - h.t < CONFIG.GAS.HIT_FLASH_MS);
    if (this.wobble && now - this.wobble.start > this.wobble.ms) this.wobble = null;
    this.draw(now);
  }

  _stepParticles(dt, now) {
    const g = this._geom();
    const gas = this._gasRect(g, this.cur.V);
    const speed = CONFIG.GAS.SPEED_AT_300K * Math.sqrt(Math.max(this.cur.T, 1) / 300);
    for (const p of this._liveParticles(this.cur)) {
      const d = speed * p.sp * dt;
      p.x += (p.dx * d) / gas.w;
      p.y += (p.dy * d) / gas.h;
      let hit = null;
      if (p.x < 0) { p.x = -p.x; p.dx = Math.abs(p.dx); hit = 'L'; }
      if (p.x > 1) { p.x = 2 - p.x; p.dx = -Math.abs(p.dx); hit = 'R'; }
      if (p.y < 0) { p.y = -p.y; p.dy = Math.abs(p.dy); hit = 'T'; }
      if (p.y > 1) { p.y = 2 - p.y; p.dy = -Math.abs(p.dy); hit = 'B'; }
      p.x = clamp(p.x, 0, 1);
      p.y = clamp(p.y, 0, 1);
      if (hit) this.hits.push({ t: now, side: hit, x: p.x, y: p.y });
    }
  }

  // ---------- 形の計算 ----------
  _geom() {
    const { w, h } = this;
    const cx = this.showGauge ? w * 0.36 : w * 0.5;
    const bodyW = Math.min(w * 0.3, h * 0.48, 130);
    const top = h * 0.1;            // シリンダーの口（上端）
    const bottom = h * 0.9;         // 底
    const ry = bodyW * 0.16;        // だ円の縦の半径（立体感）
    const maxH = bottom - top - ry * 1.2; // 12 L のときの気体の高さ
    const gr = Math.min(h * 0.27, w * 0.17);
    const gx = w * 0.79;
    const gy = h * 0.36;
    return { cx, bodyW, top, bottom, ry, maxH, gx, gy, gr };
  }

  _gasRect(g, V) {
    const vis = clamp(V, 0.7, V_MAX * 1.06);
    const gh = (g.maxH * vis) / V_MAX;
    const inset = 5;
    return { left: g.cx - g.bodyW / 2 + inset, w: g.bodyW - inset * 2, top: g.bottom - gh, h: gh - 2 };
  }

  // ---------- 描画 ----------
  draw(now = performance.now()) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const g = this._geom();
    const { P, V, T } = this.cur;

    let dx = 0;
    let dy = 0;
    let rot = 0;
    if (this.wobble) {
      const t = (now - this.wobble.start) / this.wobble.ms;
      const k = (1 - t) * Math.sin(t * Math.PI * 6);
      dx = k * 6;
      rot = k * 0.04;
    }
    // 危険メーターが高いと、ボンベが震える
    const warn = CONFIG.DOJO.WARN_AT;
    if (this.danger >= warn) {
      const amp = 0.6 + ((this.danger - warn) / (100 - warn)) * 2.4;
      dx += (Math.random() - 0.5) * amp * 2;
      dy += (Math.random() - 0.5) * amp;
    }
    if (this.burstAt) {
      const bt = (now - this.burstAt) / 1000;
      const k = Math.max(0, 1 - bt * 1.5);
      dx += (Math.random() - 0.5) * 18 * k;
      dy += (Math.random() - 0.5) * 10 * k;
    }

    // 光の輪（ジャスト）
    for (const r of this.rings) {
      const t = (now - r.start) / CONFIG.ANIM.RING_MS;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(g.cx, (g.top + g.bottom) / 2, g.bodyW * 0.55 + t * h * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.showGauge) this._drawPipe(g);

    ctx.save();
    ctx.translate(g.cx + dx, g.bottom + dy);
    ctx.rotate(rot);
    ctx.translate(-g.cx, -g.bottom);
    this._drawCylinder(g, P, V, T, now);
    ctx.restore();

    this._drawThermometer(g, T);
    if (this.ghost) this._drawThermometer(g, this.ghost.T, true);
    if (this.showGauge) this._drawGauge(g, P);
    if (this.face) {
      // 圧力計の下（タイトルではボンベの右）に、キャラクターがのぞいている
      const size = this.showGauge ? Math.min(h * 0.36, w * 0.22) : Math.min(h * 0.46, w * 0.36);
      const fx = this.showGauge ? g.gx : g.cx + g.bodyW * 0.95;
      const fy = this.showGauge ? h - size * 0.5 - 2 : g.bottom - size * 0.5;
      drawChar(ctx, this.face, this._faceExpr(now), fx, fy, size, now / 1000);
    }
    if (this.burstAt) this._drawBurst(g, now);
  }

  // 破裂：光と、飛び散る粒
  _drawBurst(g, now) {
    const { ctx } = this;
    const t = (now - this.burstAt) / 1000;
    if (t > 2) return;
    const cy = g.bottom - g.maxH * 0.4;
    ctx.save();
    // 光
    ctx.globalAlpha = Math.max(0, 0.9 - t * 1.6);
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(g.cx, cy, 20 + t * 400, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, 1 - t * 1.2);
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 8 * Math.max(0.1, 1 - t);
    ctx.beginPath();
    ctx.arc(g.cx, cy, 30 + t * 300, 0, Math.PI * 2);
    ctx.stroke();
    // 粒が飛び出す
    ctx.globalAlpha = Math.max(0, 1 - t * 0.7);
    ctx.fillStyle = BLUE;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.2;
    this.particles.slice(0, CONFIG.GAS.PARTICLES).forEach((p, i) => {
      const ang = (i / CONFIG.GAS.PARTICLES) * Math.PI * 2 + p.sp;
      const sp = 160 + p.sp * 160;
      const x = g.cx + Math.cos(ang) * sp * t;
      const y = cy + Math.sin(ang) * sp * t + 300 * t * t;
      ctx.beginPath();
      ctx.arc(x, y, CONFIG.GAS.RADIUS + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  _drawPipe(g) {
    const { ctx } = this;
    const y = g.bottom - g.maxH * 0.12;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(g.cx + g.bodyW / 2, y);
    ctx.lineTo(g.gx, y);
    ctx.lineTo(g.gx, g.gy + g.gr);
    ctx.stroke();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  _drawCylinder(g, P, V, T, now) {
    const { ctx } = this;
    const L = g.cx - g.bodyW / 2;
    const R = g.cx + g.bodyW / 2;
    const bw = g.bodyW;
    const gas = this._gasRect(g, V);
    const pressureT = clamp(P / CONFIG.GAUGE_MAX, 0, 1.1);

    // 奥の壁（陰影で円柱に見せる）
    const wall = ctx.createLinearGradient(L, 0, R, 0);
    wall.addColorStop(0, PALE);
    wall.addColorStop(0.35, WHITE);
    wall.addColorStop(0.75, SURFACE);
    wall.addColorStop(1, PALE);
    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.moveTo(L, g.top);
    ctx.lineTo(L, g.bottom);
    ctx.ellipse(g.cx, g.bottom, bw / 2, g.ry, 0, Math.PI, 0, true);
    ctx.lineTo(R, g.top);
    ctx.ellipse(g.cx, g.top, bw / 2, g.ry, 0, 0, Math.PI, true);
    ctx.fill();

    // 気体（圧力が高いほど濃い）
    const pistonY = gas.top;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(L + 2, pistonY);
    ctx.lineTo(L + 2, g.bottom);
    ctx.ellipse(g.cx, g.bottom, bw / 2 - 2, g.ry - 1, 0, Math.PI, 0, true);
    ctx.lineTo(R - 2, pistonY);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 0.25 + 0.6 * Math.pow(Math.min(pressureT, 1), 0.7);
    const gasFill = ctx.createLinearGradient(L, 0, R, 0);
    gasFill.addColorStop(0, BLUE);
    gasFill.addColorStop(0.4, PALE);
    gasFill.addColorStop(1, BLUE);
    ctx.fillStyle = gasFill;
    ctx.fillRect(L, pistonY, bw, g.bottom - pistonY + g.ry);
    ctx.globalAlpha = 1;

    // 壁に当たった光
    for (const hItem of this.hits) {
      const a = 1 - (now - hItem.t) / CONFIG.GAS.HIT_FLASH_MS;
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = WHITE;
      let x = gas.left + hItem.x * gas.w;
      let y = gas.top + hItem.y * gas.h;
      if (hItem.side === 'L') x = gas.left;
      if (hItem.side === 'R') x = gas.left + gas.w;
      if (hItem.side === 'T') y = gas.top;
      if (hItem.side === 'B') y = gas.top + gas.h;
      ctx.beginPath();
      ctx.arc(x, y, 6 * a + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 粒（温度が高いほど濃い青）
    const tt = clamp((T - T_MIN) / (T_MAX - T_MIN), 0, 1);
    ctx.fillStyle = mix(PALE, BLUE, 0.25 + tt * 0.75);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.2;
    const r = CONFIG.GAS.RADIUS;
    // 粒の数は物質量に比例する
    const hot = ctx.fillStyle;
    for (const p of this.burstAt ? [] : this._liveParticles(this.cur)) {
      const x = gas.left + r + p.x * (gas.w - r * 2);
      const y = gas.top + r + p.y * Math.max(0, gas.h - r * 2);
      if (p.gas === 'A') { ctx.fillStyle = NAVY; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.2; }
      else if (p.gas === 'B') { ctx.fillStyle = CYAN; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.4; }
      else { ctx.fillStyle = hot; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.2; }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 1.2;

    // 圧力の矢印（気体が壁を押す力。長さは P に比例）
    const len = 8 + 30 * Math.min(pressureT, 1.05);
    const under = pistonY + g.ry + 3; // ピストンの下面
    ctx.strokeStyle = NAVY;
    ctx.fillStyle = NAVY;
    const room = g.bottom - under;
    const upLen = Math.min(len, Math.max(6, room - 6));
    for (const x of [g.cx - bw * 0.26, g.cx, g.cx + bw * 0.26]) arrow(ctx, x, under + upLen, x, under);
    if (room > 40) {
      const midY = under + room * 0.55;
      const sideLen = Math.min(len, bw * 0.3);
      arrow(ctx, L + sideLen + 5, midY, L + 5, midY);
      arrow(ctx, R - sideLen - 5, midY, R - 5, midY);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 絵柄のラベル（実物のボンベのラベルのように、正面の下のほうに貼る）
    if (this.sticker && this.sticker.complete !== false && this.sticker.naturalWidth !== 0) {
      const lw = bw * 0.5;
      const lh = lw * 1.1;
      const lx = g.cx - lw / 2;
      const ly = g.bottom - lh - g.ry * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx, ly, lw, lh, 5) : ctx.rect(lx, ly, lw, lh);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.clip();
      try {
        // 絵柄（縦長）の真ん中を切り取って貼る
        const iw = this.sticker.naturalWidth || this.sticker.width;
        const ih = this.sticker.naturalHeight || this.sticker.height;
        const sh = iw * (lh / lw);
        ctx.drawImage(this.sticker, 0, (ih - sh) / 2, iw, sh, lx, ly, lw, lh);
      } catch (e) { /* 読み込めていない画像は無視 */ }
      ctx.restore();
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx, ly, lw, lh, 5) : ctx.rect(lx, ly, lw, lh);
      ctx.stroke();
    }

    // 手前の壁の線と底
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(L, g.top);
    ctx.lineTo(L, g.bottom);
    ctx.ellipse(g.cx, g.bottom, bw / 2, g.ry, 0, Math.PI, 0, true);
    ctx.lineTo(R, g.top);
    ctx.stroke();

    // 12 L の止め具
    const stopY = g.bottom - g.maxH - 2;
    ctx.fillStyle = NAVY;
    ctx.fillRect(L - 4, stopY - 3, 9, 6);
    ctx.fillRect(R - 5, stopY - 3, 9, 6);

    // ピストン
    const jolt = this.jolt * Math.sin(now / 25) * 3;
    this._drawPiston(g, pistonY + jolt);

    // シャドウピストン（補助あり）：半透明の青いピストンが、出したときの位置まで動く
    if (this.ghost && this.ghostAlpha > 0) {
      const gg = this._gasRect(g, this.ghost.V);
      ctx.save();
      ctx.globalAlpha = this.ghostAlpha;
      // 動いた分の気体の範囲を、うすい青で示す
      ctx.fillStyle = PALE;
      const y1 = Math.min(gg.top, pistonY);
      const y2 = Math.max(gg.top, pistonY);
      ctx.fillRect(L + 3, y1, bw - 6, y2 - y1);
      this._drawPiston(g, gg.top, true);
      ctx.restore();
    }

    // 口のふち
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.top, bw / 2, g.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawPiston(g, y, shadow = false) {
    const { ctx } = this;
    const bw = g.bodyW - 6;
    const thick = Math.max(10, g.ry * 1.1);
    const rodTop = Math.max(g.ry * 0.5 + 3, Math.min(y - thick - 8, g.top - 18));
    const INK = shadow ? BLUE : NAVY;
    // 棒と取っ手
    ctx.fillStyle = INK;
    ctx.fillRect(g.cx - 4, rodTop, 8, y - thick - rodTop);
    ctx.beginPath();
    ctx.ellipse(g.cx, rodTop, bw * 0.3, g.ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // ピストンの厚み（側面）
    const side = ctx.createLinearGradient(g.cx - bw / 2, 0, g.cx + bw / 2, 0);
    side.addColorStop(0, INK);
    side.addColorStop(0.35, shadow ? '#FF7A96' : '#3A3A3A');
    side.addColorStop(1, INK);
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.ellipse(g.cx, y, bw / 2, g.ry, 0, 0, Math.PI);
    ctx.lineTo(g.cx - bw / 2, y - thick);
    ctx.ellipse(g.cx, y - thick, bw / 2, g.ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    // 上の面
    const topFace = ctx.createLinearGradient(g.cx - bw / 2, 0, g.cx + bw / 2, 0);
    topFace.addColorStop(0, PALE);
    topFace.addColorStop(0.4, WHITE);
    topFace.addColorStop(1, PALE);
    ctx.fillStyle = topFace;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(g.cx, y - thick, bw / 2, g.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 棒の付け根
    ctx.fillStyle = INK;
    ctx.fillRect(g.cx - 4, rodTop, 8, y - thick - rodTop);
    ctx.beginPath();
    ctx.ellipse(g.cx, y - thick, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // shadow=true：シャドウ温度計（半透明の青。本物の温度計の左に並ぶ）
  _drawThermometer(g, T, shadow = false) {
    const { ctx } = this;
    const gap = Math.max(16, g.bodyW * 0.18);
    const x = g.cx - g.bodyW / 2 - gap - (shadow ? 18 : 0);
    ctx.save();
    if (shadow) ctx.globalAlpha = this.ghostAlpha * 1.4;
    const INK = shadow ? BLUE : NAVY;
    const top = g.top + g.maxH * 0.25;
    const bulbY = g.bottom - 6;
    const bw = 8;
    const t = clamp((T - T_MIN) / (T_MAX - T_MIN), 0, 1.02);
    // 管
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - bw / 2, top, bw, bulbY - top, bw / 2) : ctx.rect(x - bw / 2, top, bw, bulbY - top);
    ctx.fill();
    ctx.stroke();
    // 中身
    const fillTop = lerp(bulbY - 4, top + 3, t);
    ctx.fillStyle = BLUE;
    ctx.fillRect(x - bw / 2 + 2.2, fillTop, bw - 4.4, bulbY - fillTop);
    // 球
    ctx.beginPath();
    ctx.arc(x, bulbY + 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 目盛り
    if (!shadow) {
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 1.2;
      for (let k = 1; k < 5; k++) {
        const yy = lerp(bulbY - 4, top + 3, k / 5);
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, yy);
        ctx.lineTo(x + bw / 2 + 4, yy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawGauge(g, P) {
    const { ctx } = this;
    const max = CONFIG.GAUGE_MAX;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const ang = (v) => a0 + (a1 - a0) * clamp(v / max, 0, 1.04);

    // 立体感のある縁
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(g.gx + 2, g.gy + 3, g.gr + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(g.gx, g.gy, g.gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 目標（青い印）
    if (this.target !== null) {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 7;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(g.gx, g.gy, g.gr * 0.8, ang(this.target) - 0.07, ang(this.target) + 0.07);
      ctx.stroke();
    }

    // 目盛り
    ctx.strokeStyle = NAVY;
    for (let v = 0; v <= max; v += 5) {
      const a = ang(v);
      const big = v % 10 === 0;
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(g.gx + Math.cos(a) * g.gr * (big ? 0.66 : 0.74), g.gy + Math.sin(a) * g.gr * (big ? 0.66 : 0.74));
      ctx.lineTo(g.gx + Math.cos(a) * g.gr * 0.86, g.gy + Math.sin(a) * g.gr * 0.86);
      ctx.stroke();
    }
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${Math.round(g.gr * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of [0, 30, 60, 90]) {
      const a = ang(v);
      ctx.fillText(String(v / 10), g.gx + Math.cos(a) * g.gr * 0.46, g.gy + Math.sin(a) * g.gr * 0.46);
    }
    ctx.font = `${Math.round(g.gr * 0.17)}px system-ui, sans-serif`;
    ctx.fillText('×10⁵ Pa', g.gx, g.gy + g.gr * 0.58);

    // シャドウの針（補助あり）：半透明の青い針が、出したときの値まで動く
    if (this.ghost && this.ghostAlpha > 0) {
      const a = ang(this.ghost.P);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.ghostAlpha * 1.5);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.gx - Math.cos(a) * g.gr * 0.12, g.gy - Math.sin(a) * g.gr * 0.12);
      ctx.lineTo(g.gx + Math.cos(a) * g.gr * 0.8, g.gy + Math.sin(a) * g.gr * 0.8);
      ctx.stroke();
      ctx.restore();
    }

    // 針
    const a = ang(P);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(g.gx - Math.cos(a) * g.gr * 0.12, g.gy - Math.sin(a) * g.gr * 0.12);
    ctx.lineTo(g.gx + Math.cos(a) * g.gr * 0.8, g.gy + Math.sin(a) * g.gr * 0.8);
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(g.gx, g.gy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function arrow(ctx, x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.55) * 8, y2 - Math.sin(a - 0.55) * 8);
  ctx.lineTo(x2 - Math.cos(a + 0.55) * 8, y2 - Math.sin(a + 0.55) * 8);
  ctx.closePath();
  ctx.fill();
}

// ---------- 画面全体の演出（紙吹雪） ----------
export class FxLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pieces = [];
    this.running = false;
  }

  _size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 画面を切り替えたときに、残っている紙吹雪と応援のキャラクターを消す
  clear() {
    this.pieces = [];
    this.sprites = [];
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.w) this._size();
  }

  // 白い紙吹雪（フィーバー）。n 枚
  confetti(n = 60, colors = [WHITE, CYAN, PALE]) {
    this._size();
    for (let i = 0; i < n; i++) {
      this.pieces.push({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.4,
        vx: (Math.random() - 0.5) * 60,
        vy: 90 + Math.random() * 140,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        color: colors[i % colors.length],
      });
    }
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }
  }

  // 仲間のキャラクターが、次々と画面に飛び込んでくる（超フィーバー・昇段・章クリア）
  cheer(ids) {
    if (!ids || !ids.length) return;
    this._size();
    this.sprites = this.sprites || [];
    ids.forEach((id, i) => {
      const fromLeft = i % 2 === 0;
      this.sprites.push({
        id, t0: performance.now() + i * 260, dur: 1700,
        x0: fromLeft ? -60 : this.w + 60, x1: fromLeft ? this.w + 60 : -60,
        y: this.h * (0.35 + (i % 3) * 0.13), size: Math.min(110, this.w * 0.26),
      });
    });
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.sprites = (this.sprites || []).filter((sp) => now - sp.t0 < sp.dur);
    for (const sp of this.sprites) {
      const k = (now - sp.t0) / sp.dur;
      if (k < 0) continue;
      const x = sp.x0 + (sp.x1 - sp.x0) * k;
      const y = sp.y - Math.abs(Math.sin(k * Math.PI * 3)) * 60; // 弾みながら横切る
      drawChar(ctx, sp.id, 'smug', x, y, sp.size, now / 1000);
    }
    for (const p of this.pieces) {
      p.x += p.vx * dt + Math.sin(now / 300 + p.rot) * 0.6;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(18, 18, 18,0.25)';
      ctx.lineWidth = 1;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    this.pieces = this.pieces.filter((p) => p.y < this.h + 30);
    if (this.pieces.length || this.sprites.length) requestAnimationFrame((t) => this._loop(t));
    else {
      ctx.clearRect(0, 0, this.w, this.h);
      this.running = false;
    }
  }
}

// ---------- 実在気体の Z の模式図（7章の解説。v0.8） ----------
// kind：'zp'（低温・高温の気体の Z と圧力）、'zgas'（気体の種類と Z）。数値のデータではなく、形のイメージ
// labels：文言（言語ごと）。k：描く割合（0〜1。左から右へ線がのびる）
export function drawZGraph(canvas, kind, labels, k = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, r.width);
  const h = Math.max(1, r.height);
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const L = 34, R = w - 12, T = 16, B = h - 26;
  const Z0 = 0.4, Z1 = 1.7;
  const X = (x) => L + x * (R - L);
  const Y = (z) => B - ((z - Z0) / (Z1 - Z0)) * (B - T);
  // 軸
  ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(L, T - 6); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
  ctx.fillStyle = NAVY; ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('Z', L - 8, T + 2);
  ctx.fillText('1', L - 6, Y(1));
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(labels.p, R, B + 6);
  ctx.textAlign = 'left';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.globalAlpha = 0.7;
  ctx.fillText(labels.note, L + 4, B + 7);
  ctx.globalAlpha = 1;
  // 理想気体：Z = 1 の点線
  ctx.setLineDash([6, 5]); ctx.strokeStyle = NAVY; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(L, Y(1)); ctx.lineTo(R, Y(1)); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '700 11.5px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
  ctx.fillText(labels.ideal, L + 6, Y(1) - 3); // 左の方は、どの線も Z = 1 より下なので、線の上に書く
  const curves = kind === 'zgas'
    ? [
      { f: (x) => 1 + 0.35 * x, color: BLUE, width: 2.5, label: 'H₂', dash: [] },
      { f: (x) => 1 - 0.9 * x + 1.2 * x * x, color: mix(NAVY, BLUE, 0.5), width: 2.5, label: 'CH₄', dash: [3, 3] },
      { f: (x) => 1 - 1.8 * x + 2.0 * x * x, color: NAVY, width: 3, label: 'CO₂', dash: [] },
    ]
    : [
      { f: (x) => 1 - 0.3 * x + 0.6 * x * x, color: BLUE, width: 2.5, label: labels.high, dash: [] },
      { f: (x) => 1 - 1.6 * x + 2.2 * x * x, color: NAVY, width: 3, label: labels.low, dash: [] },
    ];
  const end = Math.max(0.02, Math.min(1, k));
  for (const c of curves) {
    ctx.strokeStyle = c.color; ctx.lineWidth = c.width; ctx.setLineDash(c.dash);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * end;
      const px = X(x);
      const py = Y(c.f(x));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (k >= 1) {
      ctx.fillStyle = c.color; ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(c.label, R - 2, Y(c.f(1)) - 4);
    }
  }
  // 低温の線のくぼみ（分子間力）と、右上（分子の体積）の説明
  if (kind === 'zp' && k >= 1) {
    ctx.fillStyle = NAVY; ctx.font = '700 11.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(labels.attract, X(0.36), Y(0.71) + 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(labels.volume, X(0.5), Y(1.45));
  }
}
