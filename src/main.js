// 全体の進行（画面の切り替え）と、盤面の表示・タッチ操作。

import { CONFIG } from './config.js';
import { TEXT, formatP, formatV, formatT } from './text.js';
import { toNumber } from './frac.js';
import { createRng, randomSeed } from './rng.js';
import { Board } from './game.js';
import { BombeView } from './render.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 対応していない端末 */ } };

// ---------- 文言を流し込む ----------
document.querySelectorAll('[data-t]').forEach((el) => {
  const v = TEXT[el.dataset.t];
  if (typeof v === 'string') el.textContent = v;
});
$('version').textContent = CONFIG.VERSION;
$('btn-home').setAttribute('aria-label', TEXT.home);

// ---------- 誤操作の防止（長押しメニュー、ピンチ拡大） ----------
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// ---------- 画面の切り替え ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

// ---------- タイトル画面 ----------
const titleBombe = new BombeView($('title-bombe'), { showGauge: false });
const stageWrap = $('stage-buttons');
for (const n of CONFIG.AVAILABLE_STAGES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stage-btn';
  b.innerHTML = `<b>${TEXT.playStage(n)}</b><small>${TEXT.stageHint[n] || ''}</small>`;
  b.addEventListener('pointerdown', () => { b.classList.add('press'); vibrate(CONFIG.VIBRATE_TAP_MS); });
  b.addEventListener('pointerleave', () => b.classList.remove('press'));
  b.addEventListener('click', () => { b.classList.remove('press'); startGame(n); });
  stageWrap.appendChild(b);
}

// ---------- プレイ画面 ----------
let board = null;
let view = null;
let busy = false;     // 演出中は操作を受け付けない
let msgTimer = null;

function startGame(stage) {
  board = new Board({ stage, rng: createRng(randomSeed()) });
  show('screen-play');
  if (!view) view = new BombeView($('bombe'));
  else view.resize();
  $('stage-num').textContent = String(stage);
  busy = false;
  renderAll();
  view.set(toNumber(board.state.P), toNumber(board.target));
  showMessage(TEXT.handHint, 'hint');
}

$('btn-home').addEventListener('click', () => {
  if (busy) return;
  show('screen-title');
  titleBombe.resize();
});

function renderAll() {
  $('just-count').textContent = String(board.justCount);
  $('target-text').textContent = TEXT.targetText(formatP(board.target));
  renderState(board.state);
  renderField();
  renderHand();
}

function renderState(s) {
  $('state-text').innerHTML =
    `<span><i>P</i>${formatP(s.P)}</span><span><i>V</i>${formatV(s.V)}</span><span><i>T</i>${formatT(s.T)}</span>`;
}

function showMessage(text, kind = 'show', ms = 0) {
  const el = $('message');
  clearTimeout(msgTimer);
  el.textContent = text;
  el.className = `message ${kind === 'hint' ? 'show hint' : 'show'}`;
  if (ms) msgTimer = setTimeout(() => { el.className = 'message'; }, ms);
}
function hideMessage() {
  clearTimeout(msgTimer);
  $('message').className = 'message';
}

// カードの見た目
const PISTON_ICON =
  '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="14" height="11" rx="2" fill="none" stroke="#1B2A49" stroke-width="2"/><rect x="4.5" y="9" width="11" height="3" fill="#2F6FED"/><path d="M10 9V2M6 2h8" stroke="#1B2A49" stroke-width="2" stroke-linecap="round"/></svg>';

function cardHTML(card) {
  if (card.type === 'vmul') {
    const r = card.den === 1 ? `×${card.num}` : `×${card.num}/${card.den}`;
    return `${PISTON_ICON}<span class="label"><span class="v">V</span><span class="x">${r}</span></span><span class="foot"></span>`;
  }
  return '<span class="label">?</span>';
}

function makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = cardHTML(card);
  el.setAttribute('role', 'button');
  return el;
}

function renderField() {
  const field = $('field');
  field.innerHTML = '';
  board.field.forEach((handIdx, slot) => {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.slot = String(slot);
    s.dataset.n = String(slot + 1);
    if (handIdx === null) {
      s.classList.add('empty');
    } else {
      const c = makeCard(board.hand[handIdx]);
      c.classList.add('on-field');
      c.addEventListener('pointerdown', (e) => {
        if (busy) return;
        e.preventDefault();
        vibrate(CONFIG.VIBRATE_TAP_MS);
        board.unplace(slot);
        renderField();
        renderHand();
      });
      s.appendChild(c);
    }
    field.appendChild(s);
  });
  $('btn-duel').disabled = !board.canDuel();
}

function renderHand() {
  const hand = $('hand');
  hand.innerHTML = '';
  board.hand.forEach((card, idx) => {
    const pos = document.createElement('div');
    pos.className = 'hand-pos';
    if (!card || board.isOnField(idx)) {
      pos.classList.add('used');
    } else {
      const el = makeCard(card);
      attachDrag(el, idx);
      pos.appendChild(el);
    }
    hand.appendChild(pos);
  });
}

// ---------- タップとドラッグ ----------
function attachDrag(el, idx) {
  let start = null;
  let dragging = false;

  el.addEventListener('pointerdown', (e) => {
    if (busy) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging = false;
    el.classList.add('lift');
    vibrate(CONFIG.VIBRATE_TAP_MS);
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  });

  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) > CONFIG.DRAG_THRESHOLD_PX) {
      dragging = true;
      el.classList.add('dragging');
    }
    if (dragging) {
      el.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
      $('field').classList.toggle('drop', slotAt(e.clientX, e.clientY) !== undefined);
    }
  });

  const finish = (e, cancelled) => {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    el.classList.remove('lift', 'dragging');
    el.style.transform = '';
    $('field').classList.remove('drop');
    if (cancelled) return;
    let placed = false;
    if (dragging) {
      const slot = slotAt(e.clientX, e.clientY);
      if (slot !== undefined) placed = board.place(idx, slot);
    } else {
      placed = board.place(idx);
    }
    if (placed) {
      hideMessage();
      renderField();
      renderHand();
      const s = board.field.indexOf(idx);
      const c = document.querySelector(`.slot[data-slot="${s}"] .card`);
      if (c) c.classList.add('snap');
    }
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));
}

// 指の位置にある場の枠。場の上だが枠の外なら null（左から空いている枠へ）、場の外なら undefined
function slotAt(x, y) {
  const f = $('field').getBoundingClientRect();
  const pad = 24;
  if (x < f.left - pad || x > f.right + pad || y < f.top - pad * 2 || y > f.bottom + pad) return undefined;
  for (const s of document.querySelectorAll('.slot')) {
    const r = s.getBoundingClientRect();
    if (x >= r.left - 5 && x <= r.right + 5) return Number(s.dataset.slot);
  }
  return null;
}

// ---------- デュエル！ ----------
$('btn-duel').addEventListener('pointerdown', () => { if (!$('btn-duel').disabled) vibrate(CONFIG.VIBRATE_TAP_MS); });
$('btn-duel').addEventListener('click', async () => {
  if (busy || !board.canDuel()) return;
  busy = true;
  hideMessage();
  const result = board.duel();
  const A = CONFIG.ANIM;

  // 1) カードが左から1枚ずつ弧を描いてボンベへ
  const cards = [...document.querySelectorAll('.slot .card')];
  const to = view.bombeCenter();
  const flights = cards.map((c, i) => {
    const r = c.getBoundingClientRect();
    const dx = to.x - (r.left + r.width / 2);
    const dy = to.y - (r.top + r.height / 2);
    const anim = c.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.55 - 70}px) scale(0.85) rotate(${dx > 0 ? 12 : -12}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.15) rotate(${dx > 0 ? 25 : -25}deg)`, opacity: 0 },
      ],
      { duration: A.CARD_FLY_MS, delay: i * A.CARD_STAGGER_MS, easing: 'ease-in', fill: 'forwards' },
    );
    return anim.finished.catch(() => {});
  });
  await Promise.all(flights);

  const stamp = $('stamp');
  stamp.className = 'stamp';

  if (result.kind === 'just') {
    // 2) 針が目標でピタッと止まる → 3) JUST! → 4) 光の輪
    renderState(result.after);
    await view.moveNeedle(toNumber(result.after.P));
    stamp.textContent = TEXT.just;
    void stamp.offsetWidth;
    stamp.className = 'stamp show';
    view.ring();
    vibrate(CONFIG.VIBRATE_JUST);
    board.commitJust(result);
    const jc = $('just-count');
    jc.textContent = String(board.justCount);
    jc.classList.remove('bump'); void jc.offsetWidth; jc.classList.add('bump');
    await wait(A.STAMP_MS);
    // 5) 次の目標カード
    stamp.classList.add('fade');
    renderAll();
    view.set(toNumber(board.state.P), toNumber(board.target));
    const tc = document.querySelector('.target-card');
    tc.classList.remove('pop'); void tc.offsetWidth; tc.classList.add('pop');
    if (board.ventilated) showMessage(TEXT.ventilated, 'show', A.NOTICE_MS);
  } else {
    // ハズレ：針が結果の値まで振れて止まり、ボンベがよろける。カードは手札へ戻る
    renderState(result.after);
    await view.moveNeedle(Math.min(toNumber(result.after.P), CONFIG.GAUGE_MAX * 1.04), A.NEEDLE_MS * 1.3);
    view.shake();
    stamp.textContent = TEXT.miss;
    void stamp.offsetWidth;
    stamp.className = 'stamp miss show';
    showMessage(result.valid ? TEXT.missResult(formatP(result.after.P)) : TEXT.missInvalid, 'show', A.MISS_MSG_MS);
    await wait(A.MISS_HOLD_MS);
    stamp.classList.add('fade');
    board.commitMiss();
    renderState(board.state);
    renderField();
    renderHand();
    await view.moveNeedle(toNumber(board.state.P), A.NEEDLE_MS);
  }
  busy = false;
});

// ---------- 引き直し ----------
$('btn-reroll').addEventListener('click', () => {
  if (busy) return;
  vibrate(CONFIG.VIBRATE_TAP_MS);
  board.reroll();
  renderAll();
  view.set(toNumber(board.state.P), toNumber(board.target));
  showMessage(board.ventilated ? TEXT.ventilated : TEXT.rerolled, 'show', CONFIG.ANIM.NOTICE_MS);
});

show('screen-title');
