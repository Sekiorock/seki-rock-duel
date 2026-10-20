// ボンベ（ピストン付きシリンダー）、中の気体の粒、温度計、圧力計の描画。Canvas 2D。
// 立体感は陰影で出す（3D描画は使わない）。色は白・ネイビー・青の濃淡だけ。
//
// 見え方のきまり（直感的に分かるように）
//   体積 V … ピストンの高さ（気体の部分の高さは V に比例）
//   温度 T … 左の温度計の高さと、粒の速さ（√T に比例）と粒の色（熱いほど濃い青）
//   圧力 P … 壁を押す矢印の長さ、気体の色の濃さ、圧力計の針。粒が壁に当たると光る

import { CONFIG } from './config.js?v=0.2.1';

const NAVY = '#1B2A49';
const BLUE = '#2F6FED';
const PALE = '#DCE7FD';
const WHITE = '#FFFFFF';
const SURFACE = '#F4F7FB';

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
    this.cur = { P: s.P, V: s.V, T: s.T };   // いま表示している値（数）
    this.target = null;                       // 目標の圧力（数）
    this.ghost = null;                        // 予告表示（補助あり）
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
    for (let i = 0; i < CONFIG.GAS.PARTICLES; i++) {
      const a = rnd() * Math.PI * 2;
      this.particles.push({ x: rnd(), y: rnd(), dx: Math.cos(a), dy: Math.sin(a), sp: 0.7 + rnd() * 0.6 });
    }
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
    this.cur = { ...state };
    this.target = target;
  }

  setGhost(state) {
    this.ghost = state ? { ...state } : null;
  }

  // 1枚ぶんの変化：ピストン・温度・針を同時に動かす
  animateTo(state, ms = CONFIG.ANIM.STEP_MS) {
    return new Promise((resolve) => {
      if (this.tween) this.tween.resolve();
      this.tween = { from: { ...this.cur }, to: { ...state }, start: performance.now(), ms, resolve };
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
      };
      if (t >= 1) {
        this.tween = null;
        // 範囲の外まで動いたら、止め具に当たって揺れる
        if (tw.to.V > V_MAX || tw.to.V < Math.min(...CONFIG.VOLUME_UNITS)) this.jolt = 1;
        tw.resolve();
      }
    }
    this.jolt = Math.max(0, this.jolt - dt * 2.5);
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
    for (const p of this.particles) {
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
    let rot = 0;
    if (this.wobble) {
      const t = (now - this.wobble.start) / this.wobble.ms;
      const k = (1 - t) * Math.sin(t * Math.PI * 6);
      dx = k * 6;
      rot = k * 0.04;
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
    ctx.translate(g.cx + dx, g.bottom);
    ctx.rotate(rot);
    ctx.translate(-g.cx, -g.bottom);
    this._drawCylinder(g, P, V, T, now);
    ctx.restore();

    this._drawThermometer(g, T);
    if (this.showGauge) this._drawGauge(g, P);
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
    for (const p of this.particles) {
      const x = gas.left + r + p.x * (gas.w - r * 2);
      const y = gas.top + r + p.y * Math.max(0, gas.h - r * 2);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

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

    // 予告（補助あり）：点線のピストン
    if (this.ghost) {
      const gg = this._gasRect(g, this.ghost.V);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(g.cx, gg.top, bw / 2 - 3, g.ry - 1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ピストン
    const jolt = this.jolt * Math.sin(now / 25) * 3;
    this._drawPiston(g, pistonY + jolt);

    // 口のふち
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.top, bw / 2, g.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawPiston(g, y) {
    const { ctx } = this;
    const bw = g.bodyW - 6;
    const thick = Math.max(10, g.ry * 1.1);
    const rodTop = Math.max(g.ry * 0.5 + 3, Math.min(y - thick - 8, g.top - 18));
    // 棒と取っ手
    ctx.fillStyle = NAVY;
    ctx.fillRect(g.cx - 4, rodTop, 8, y - thick - rodTop);
    ctx.beginPath();
    ctx.ellipse(g.cx, rodTop, bw * 0.3, g.ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // ピストンの厚み（側面）
    const side = ctx.createLinearGradient(g.cx - bw / 2, 0, g.cx + bw / 2, 0);
    side.addColorStop(0, NAVY);
    side.addColorStop(0.35, '#3A4E78');
    side.addColorStop(1, NAVY);
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
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(g.cx, y - thick, bw / 2, g.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 棒の付け根
    ctx.fillStyle = NAVY;
    ctx.fillRect(g.cx - 4, rodTop, 8, y - thick - rodTop);
    ctx.beginPath();
    ctx.ellipse(g.cx, y - thick, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawThermometer(g, T) {
    const { ctx } = this;
    const x = g.cx - g.bodyW / 2 - Math.max(16, g.bodyW * 0.18);
    const top = g.top + g.maxH * 0.25;
    const bulbY = g.bottom - 6;
    const bw = 8;
    const t = clamp((T - T_MIN) / (T_MAX - T_MIN), 0, 1.02);
    // 管
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = NAVY;
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

    // 予告の針（点線）
    if (this.ghost) {
      const a = ang(this.ghost.P);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(g.gx, g.gy);
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
