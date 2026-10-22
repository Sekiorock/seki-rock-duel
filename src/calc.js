// 電卓（v1.0）：暗算が苦手な生徒のための小さな電卓。プレイ画面・確認問題・解説の右上のボタンで開く。
// 画面の下に浮かぶ小窓で、上の帯をドラッグすると動かせる。ゲームは止めない（使うかどうかは本人しだい）。
// 式は自前で計算する（eval は使わない）。×10ⁿ キーで、教科書と同じ 1.04×10⁵ のような数を入れられる。

// ---- 式の計算 ----
// 内部の式：数字・小数点・+ - * / ( ) と、指数の印 E（「×10ⁿ」。後ろに − と数字が続く）
export function evaluate(expr) {
  const toks = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      const m = expr.slice(i).match(/^(\d*\.?\d*)(E-?\d+)?/);
      let lit = m[0];
      if (!/\d/.test(m[1])) return null;
      if (lit.endsWith('E') || lit.endsWith('E-')) return null;
      toks.push({ n: parseFloat(lit.replace('E', 'e')) });
      i += lit.length;
    } else if (c === 'E') {
      // 数字のない「×10ⁿ」は 10ⁿ とみなす
      const m = expr.slice(i).match(/^E(-?\d+)/);
      if (!m) return null;
      toks.push({ n: Math.pow(10, Number(m[1])) });
      i += m[0].length;
    } else if ('+-*/()'.includes(c)) {
      toks.push({ op: c });
      i++;
    } else return null;
  }
  // 再帰下降：式 = 項 (± 項)*、項 = 因子 (×÷ 因子)*、因子 = −因子 | 数 | ( 式 )
  let k = 0;
  const peek = () => toks[k];
  function factor() {
    const t = toks[k++];
    if (!t) throw 0;
    if (t.op === '-') return -factor();
    if (t.op === '+') return factor();
    if (t.op === '(') {
      const v = sum();
      if (!peek() || peek().op !== ')') { if (!peek()) return v; throw 0; } // 閉じかっこは省略してもよい
      k++;
      return v;
    }
    if (t.n !== undefined) {
      // 数のすぐあとに ( が来たら掛け算とみなす
      return t.n;
    }
    throw 0;
  }
  function term() {
    let v = factor();
    while (peek() && (peek().op === '*' || peek().op === '/' || peek().op === '(' || peek().n !== undefined)) {
      const t = peek();
      if (t.op === '*' || t.op === '/') { k++; const r = factor(); v = t.op === '*' ? v * r : v / r; }
      else v *= factor(); // 2(3+4) のような省略
    }
    return v;
  }
  function sum() {
    let v = term();
    while (peek() && (peek().op === '+' || peek().op === '-')) {
      const t = toks[k++];
      const r = term();
      v = t.op === '+' ? v + r : v - r;
    }
    return v;
  }
  try {
    if (!toks.length) return null;
    const v = sum();
    if (k !== toks.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (str) => str.replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);

// 答えの表示：大きい数・小さい数は 1.04×10⁵ の形（有効数字3桁）、それ以外は6桁まで
export function formatNum(v) {
  return formatNum0(v).replace(/^-/, '−');
}
function formatNum0(v) {
  if (v === null || v === undefined) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    let e = Math.floor(Math.log10(a));
    let m = v / Math.pow(10, e);
    let ms = m.toFixed(2);
    if (Math.abs(Number(ms)) >= 10) { e += 1; ms = (v / Math.pow(10, e)).toFixed(2); }
    return `${ms}×10${sup(String(e))}`;
  }
  return String(Number(v.toPrecision(6)));
}

// 式の表示：* → ×、/ → ÷、- → −、E-3 → ×10⁻³
export function prettyExpr(expr) {
  return expr
    .replace(/E(-?\d*)/g, (m, ex) => `×10${sup(ex)}${ex === '' || ex === '-' ? '□' : ''}`)
    .replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}

// ---- 小窓 ----
const KEYS = [
  ['C', 'c', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['⌫', 'bs', 'fn'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-', 'op'],
  ['0', '0'], ['.', '.'], ['×10ⁿ', 'E', 'op exp'], ['+', '+', 'op'],
];

export class Calculator {
  constructor(root, { text, onKey = () => {}, onChange = () => {} }) {
    this.onChange = onChange; // 開いた・閉じたとき（ボタンの見た目を変える）
    this.root = root;
    this.text = text;      // () => 今の言語の文言
    this.onKey = onKey;    // キーの音など
    this.expr = '';
    this.lastAns = null;
    this.justEvaluated = false;
    this._build();
  }

  _build() {
    const r = this.root;
    r.innerHTML = `
      <div class="calc-head"><b data-t="calc">電卓</b><span class="calc-grip" aria-hidden="true"></span><button type="button" class="calc-close" aria-label="close">×</button></div>
      <div class="calc-screen"><div class="calc-expr num"></div><div class="calc-ans num"></div></div>
      <div class="calc-keys">${KEYS.map(([l, k, cls]) => `<button type="button" class="ck ${cls || ''}" data-k="${k}">${l}</button>`).join('')}
        <button type="button" class="ck eq" data-k="=">=</button></div>`;
    r.querySelectorAll('.ck').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.press(b.dataset.k); }));
    r.querySelector('.calc-close').addEventListener('click', () => this.close());
    // 上の帯をドラッグすると動かせる
    const head = r.querySelector('.calc-head');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.calc-close')) return;
      const rect = r.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const w = r.offsetWidth;
      const h = r.offsetHeight;
      const x = Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - drag.dx));
      const y = Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - drag.dy));
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      r.style.bottom = 'auto';
      r.style.transform = 'none';
      r.classList.remove('top');
      this.moved = true;
    });
    const end = () => { drag = null; };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    this.render();
  }

  get isOpen() { return !this.root.hidden; }
  // where：'top'（プレイ画面。手札が隠れないよう上のほう）か 'bottom'
  open(where = 'bottom') {
    const r = this.root;
    if (r.hidden && !this.moved) r.classList.toggle('top', where === 'top');
    r.hidden = false;
    this.render();
    this.onChange(true);
  }
  close() { this.root.hidden = true; this.onChange(false); }
  toggle(where) { if (this.isOpen) this.close(); else this.open(where); }

  press(k) {
    this.onKey(k);
    let e = this.expr;
    if (k === 'c') { this.expr = ''; this.lastAns = null; this.justEvaluated = false; return this.render(); }
    if (k === 'bs') { this.expr = e.slice(0, -1); this.justEvaluated = false; return this.render(); }
    if (k === '=') {
      const v = evaluate(e);
      if (v === null) { this.error = true; return this.render(); }
      this.lastAns = v;
      // 答えを次の式の始まりにする（指数の形で入れ直す）
      this.expr = toExpr(v);
      this.justEvaluated = true;
      return this.render();
    }
    // 答えのすぐあとに数字を押したら、新しい式にする
    if (this.justEvaluated && /[0-9.]/.test(k)) e = '';
    this.justEvaluated = false;
    if (k === 'E') {
      // ×10ⁿ：直前が数字か ) のときだけ。続けて押した − と数字が指数になる
      if (/E-?$/.test(e)) return this.render();
      if (e === '' || /[+\-*/(]$/.test(e)) e += '1';
      e += 'E';
    } else if (k === '-' && /E$/.test(e)) {
      e += '-';
    } else if ('+*/'.includes(k)) {
      if (/E-?$/.test(e)) return this.render();
      if (/[+\-*/]$/.test(e)) e = e.slice(0, -1);
      if (e === '' && this.lastAns !== null) e = toExpr(this.lastAns);
      if (e === '') return this.render();
      e += k;
    } else if (k === '.') {
      const m = e.match(/[\d.]*$/)[0];
      if (m.includes('.') || /E-?\d*$/.test(e)) return this.render();
      e += m === '' ? '0.' : '.';
    } else {
      e += k;
    }
    this.expr = e.slice(0, 60);
    this.error = false;
    this.render();
  }

  render() {
    const t = this.text();
    this.root.querySelector('[data-t="calc"]').textContent = t.calc;
    this.root.querySelector('.calc-expr').textContent = prettyExpr(this.expr) || ' ';
    const v = evaluate(this.expr);
    const ans = this.root.querySelector('.calc-ans');
    if (this.error) ans.textContent = t.calcError;
    else ans.textContent = v === null ? (this.expr ? '…' : '0') : `= ${formatNum(v)}`;
  }
}

// 数を式の形に戻す（大きい数・小さい数は E を使う）
function toExpr(v) {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) {
    const e = Math.floor(Math.log10(a));
    const m = Number((v / Math.pow(10, e)).toPrecision(6));
    return `${m}E${e}`;
  }
  return String(Number(v.toPrecision(10)));
}
