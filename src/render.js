// ボンベと圧力計、演出（光の輪、よろけ）の描画。Canvas 2D。

import { CONFIG } from './config.js';

const NAVY = '#1B2A49';
const BLUE = '#2F6FED';
const PALE = '#DCE7FD';
const WHITE = '#FFFFFF';
const SURFACE = '#F4F7FB';

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class BombeView {
  constructor(canvas, { showGauge = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showGauge = showGauge;
    this.needle = CONFIG.START_STATE.P; // 圧力（0.1×10⁵ Pa 単位の数）
    this.target = null;
    this.tween = null;
    this.rings = [];
    this.wobble = null;
    this.running = false;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(canvas);
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
    this.draw();
  }

  set(needle, target) {
    this.needle = needle;
    this.target = target;
    this.draw();
  }

  // 針を動かす。ピタッと止まるように最後だけ減速
  moveNeedle(to, ms = CONFIG.ANIM.NEEDLE_MS, ease = easeOutQuart) {
    return new Promise((resolve) => {
      this.tween = { from: this.needle, to, start: performance.now(), ms, ease, resolve };
      this._kick();
    });
  }

  ring() {
    this.rings.push({ start: performance.now() });
    this._kick();
  }

  shake() {
    this.wobble = { start: performance.now(), ms: 500 };
    this._kick();
  }

  // ボンベの中心（カードが吸い込まれる先）を画面座標で返す
  bombeCenter() {
    const r = this.canvas.getBoundingClientRect();
    const g = this._geom();
    return { x: r.left + g.cx, y: r.top + g.cy };
  }

  _kick() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      let active = false;
      if (this.tween) {
        const t = Math.min(1, (now - this.tween.start) / this.tween.ms);
        this.needle = this.tween.from + (this.tween.to - this.tween.from) * this.tween.ease(t);
        if (t >= 1) {
          const done = this.tween.resolve;
          this.tween = null;
          done();
        } else active = true;
      }
      this.rings = this.rings.filter((r) => now - r.start < CONFIG.ANIM.RING_MS);
      if (this.rings.length) active = true;
      if (this.wobble && now - this.wobble.start > this.wobble.ms) this.wobble = null;
      if (this.wobble) active = true;
      this.draw(now);
      if (active || this.tween) requestAnimationFrame(loop);
      else this.running = false;
    };
    requestAnimationFrame(loop);
  }

  _geom() {
    const { w, h } = this;
    const bodyH = h * 0.66;
    const bodyW = Math.min(h * 0.42, w * 0.26);
    const cx = this.showGauge ? w * 0.34 : w * 0.5;
    const cy = h * 0.6;
    const gr = Math.min(h * 0.36, w * 0.2);
    const gx = w * 0.7;
    const gy = h * 0.46;
    return { cx, cy, bodyW, bodyH, gx, gy, gr };
  }

  draw(now = performance.now()) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const g = this._geom();

    let dx = 0;
    let rot = 0;
    if (this.wobble) {
      const t = (now - this.wobble.start) / this.wobble.ms;
      const k = (1 - t) * Math.sin(t * Math.PI * 6);
      dx = k * 6;
      rot = k * 0.05;
    }

    // 光の輪（ジャスト）
    for (const r of this.rings) {
      const t = (now - r.start) / CONFIG.ANIM.RING_MS;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.bodyW * 0.6 + t * g.bodyH * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 管（ボンベ → 圧力計）
    if (this.showGauge) {
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 4;
      ctx.beginPath();
      const topY = g.cy - g.bodyH / 2 - 14;
      ctx.moveTo(g.cx + dx, topY);
      ctx.lineTo(g.cx + dx, topY - 8);
      ctx.lineTo(g.gx - g.gr * 0.7, topY - 8);
      ctx.lineTo(g.gx - g.gr * 0.7, g.gy);
      ctx.stroke();
    }

    // ボンベ本体
    ctx.save();
    ctx.translate(g.cx + dx, g.cy + g.bodyH / 2);
    ctx.rotate(rot);
    ctx.translate(0, -g.bodyH / 2);
    const bw = g.bodyW;
    const bh = g.bodyH;
    // 首とバルブ
    ctx.fillStyle = NAVY;
    roundRect(ctx, -bw * 0.16, -bh / 2 - 16, bw * 0.32, 18, 4);
    ctx.fill();
    roundRect(ctx, -bw * 0.3, -bh / 2 - 22, bw * 0.6, 7, 3);
    ctx.fill();
    // 胴
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 4;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bw * 0.38);
    ctx.fill();
    ctx.stroke();
    // 帯
    ctx.fillStyle = PALE;
    ctx.fillRect(-bw / 2 + 2, -bh * 0.08, bw - 4, bh * 0.16);
    ctx.fillStyle = BLUE;
    ctx.fillRect(-bw / 2 + 2, -bh * 0.08, bw - 4, 3);
    ctx.fillRect(-bw / 2 + 2, bh * 0.08 - 3, bw - 4, 3);
    // つや
    ctx.strokeStyle = SURFACE;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-bw * 0.28, -bh * 0.3);
    ctx.lineTo(-bw * 0.28, -bh * 0.16);
    ctx.stroke();
    ctx.restore();

    if (this.showGauge) this._drawGauge(g);
  }

  _drawGauge(g) {
    const { ctx } = this;
    const max = CONFIG.GAUGE_MAX;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const ang = (v) => a0 + (a1 - a0) * Math.max(0, Math.min(1.04, v / max));

    ctx.fillStyle = WHITE;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(g.gx, g.gy, g.gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 目標の範囲（青い弧）
    if (this.target !== null) {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 7;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(g.gx, g.gy, g.gr * 0.8, ang(this.target) - 0.06, ang(this.target) + 0.06);
      ctx.stroke();
    }

    // 目盛り
    ctx.strokeStyle = NAVY;
    for (let v = 0; v <= max; v += 5) {
      const a = ang(v);
      const big = v % 10 === 0;
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(g.gx + Math.cos(a) * g.gr * (big ? 0.68 : 0.74), g.gy + Math.sin(a) * g.gr * (big ? 0.68 : 0.74));
      ctx.lineTo(g.gx + Math.cos(a) * g.gr * 0.86, g.gy + Math.sin(a) * g.gr * 0.86);
      ctx.stroke();
    }
    ctx.fillStyle = NAVY;
    ctx.font = `600 ${Math.round(g.gr * 0.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of [0, 30, 60, 90]) {
      const a = ang(v);
      ctx.fillText(String(v / 10), g.gx + Math.cos(a) * g.gr * 0.5, g.gy + Math.sin(a) * g.gr * 0.5);
    }
    ctx.font = `${Math.round(g.gr * 0.15)}px system-ui, sans-serif`;
    ctx.fillText('×10⁵ Pa', g.gx, g.gy + g.gr * 0.55);

    // 針
    const a = ang(this.needle);
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

export { easeInOut };

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
