// 全体の進行（画面の切り替え）と、盤面の表示・タッチ操作。

import { CONFIG } from './config.js?v=0.2.1';
import { TEXT, formatP, formatV, formatT, setLang, getLang, LANGS } from './text.js?v=0.2.1';
import { toNumber } from './frac.js?v=0.2.1';
import { createRng, randomSeed } from './rng.js?v=0.2.1';
import { cardLines, isTempCard } from './cards.js?v=0.2.1';
import { Board } from './game.js?v=0.2.1';
import { BombeView } from './render.js?v=0.2.1';
import { loadSettings, saveSettings, recordMistake, favoriteMistake } from './storage.js?v=0.2.1';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 対応していない端末 */ } };
const num = (s) => ({ P: toNumber(s.P), V: toNumber(s.V), T: toNumber(s.T) });

const settings = loadSettings();
setLang(settings.lang);

// ---------- 文言を流し込む（言語を切り替えたときも、ここを呼び直す） ----------
function applyTexts() {
  document.documentElement.lang = getLang();
  document.title = TEXT.title;
  document.querySelectorAll('[data-t]').forEach((el) => {
    const v = TEXT[el.dataset.t];
    if (typeof v === 'string') el.textContent = v;
  });
  $('btn-home').setAttribute('aria-label', TEXT.home);
  document.querySelectorAll('[data-lang-toggle]').forEach((b) => {
    b.setAttribute('aria-label', TEXT.langLabel);
    b.querySelectorAll('[data-l]').forEach((sp) => sp.classList.toggle('on', sp.dataset.l === getLang()));
  });
  document.querySelectorAll('#stage-grid .stage-btn').forEach((b) => {
    const n = Number(b.dataset.stage);
    b.innerHTML = `<b>${TEXT.stageName(n)}</b><small>${TEXT.stageHint[n] || ''}</small>`;
  });
}
$('version').textContent = CONFIG.VERSION;

// 言語の切り替え（ホーム・練習室・プレイ画面の右上のボタン）
function toggleLang() {
  const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
  settings.lang = setLang(next);
  saveSettings(settings);
  applyTexts();
  if (board) {
    // プレイ中の表示も、その場で言語を入れ替える（演出中はカードを作り直さない）
    $('target-text').textContent = TEXT.targetText(formatP(board.target));
    if (!busy) {
      hideMessage();
      hideHint();
      renderAll();
    }
  }
}
document.querySelectorAll('[data-lang-toggle]').forEach((b) => {
  b.addEventListener('pointerdown', () => vibrate(CONFIG.VIBRATE_TAP_MS));
  b.addEventListener('click', toggleLang);
});

// ---------- 誤操作の防止（長押しメニュー、ピンチ拡大） ----------
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// 押した瞬間に沈む・震える（10.4）
function pressable(el, onClick) {
  el.addEventListener('pointerdown', () => { el.classList.add('press'); vibrate(CONFIG.VIBRATE_TAP_MS); });
  el.addEventListener('pointerleave', () => el.classList.remove('press'));
  el.addEventListener('pointercancel', () => el.classList.remove('press'));
  el.addEventListener('click', () => { el.classList.remove('press'); onClick(); });
}

// ---------- 画面の切り替え ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id === 'screen-title') titleBombe.resize();
}

// ---------- タイトル画面 ----------
const titleBombe = new BombeView($('title-bombe'), { showGauge: false });
pressable($('btn-practice'), () => show('screen-select'));

// ---------- 練習室：段階の選択 ----------
function renderAssist() {
  $('btn-assist-on').setAttribute('aria-checked', String(settings.assist));
  $('btn-assist-off').setAttribute('aria-checked', String(!settings.assist));
}
$('btn-assist-on').addEventListener('click', () => { settings.assist = true; saveSettings(settings); renderAssist(); });
$('btn-assist-off').addEventListener('click', () => { settings.assist = false; saveSettings(settings); renderAssist(); });
renderAssist();
$('btn-select-back').addEventListener('click', () => show('screen-title'));

for (const n of CONFIG.AVAILABLE_STAGES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stage-btn';
  b.dataset.stage = String(n);
  pressable(b, () => startGame(n));
  $('stage-grid').appendChild(b);
}

// ---------- プレイ画面 ----------
let board = null;
let view = null;
let busy = false;     // 演出中は操作を受け付けない
let msgTimer = null;
let hintTimer = null;

function startGame(stage) {
  board = new Board({
    stage,
    rng: createRng(randomSeed()),
    preferModel: () => favoriteMistake(CONFIG.MISTAKE_MODELS),
  });
  show('screen-play');
  if (!view) view = new BombeView($('bombe'));
  else view.resize();
  $('stage-num').textContent = String(stage);
  $('assist-badge').hidden = !settings.assist;
  busy = false;
  hideHint();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  showMessage(TEXT.handHint, 'soft');
}

$('btn-home').addEventListener('click', () => {
  if (busy) return;
  show('screen-title');
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
  el.className = `message show ${kind}`;
  if (ms) msgTimer = setTimeout(() => { el.className = 'message'; }, ms);
}
function hideMessage() {
  clearTimeout(msgTimer);
  $('message').className = 'message';
}
// 考え違いの一言は目標カードの下に出す（5.3）
function showHint(text, ms) {
  const el = $('hint');
  clearTimeout(hintTimer);
  el.textContent = text;
  el.className = 'hint show';
  hintTimer = setTimeout(hideHint, ms);
}
function hideHint() {
  clearTimeout(hintTimer);
  $('hint').className = 'hint';
}

// 補助あり：場に置いたカードを出したときの変化を予告する
function updatePreview() {
  if (!settings.assist || busy) { view.setGhost(null); return; }
  const r = board.preview();
  if (!r) {
    view.setGhost(null);
    if ($('message').classList.contains('preview')) hideMessage();
    return;
  }
  view.setGhost(num(r.state));
  showMessage(r.valid ? TEXT.preview(formatP(r.state.P)) : TEXT.previewInvalid, 'preview');
}

// ---------- カードの見た目 ----------
const ICONS = {
  // 体積カード：ピストン
  vmul: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="14" height="11" rx="2" fill="none" stroke="#1B2A49" stroke-width="2"/><rect x="4.5" y="9" width="11" height="3" fill="#2F6FED"/><path d="M10 9V2M6 2h8" stroke="#1B2A49" stroke-width="2" stroke-linecap="round"/></svg>',
  // 体積指定カード：ピストンと目印
  vset: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="14" height="11" rx="2" fill="none" stroke="#1B2A49" stroke-width="2"/><rect x="4.5" y="9" width="11" height="3" fill="#2F6FED"/><path d="M10 9V3" stroke="#1B2A49" stroke-width="2" stroke-linecap="round"/><path d="M1 10.5h2M17 10.5h2" stroke="#2F6FED" stroke-width="2"/></svg>',
  // 温度カード（K）：温度計
  tset_k: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#fff" stroke="#1B2A49" stroke-width="2"/><circle cx="10" cy="15" r="2.2" fill="#2F6FED"/><path d="M10 13V7" stroke="#2F6FED" stroke-width="2"/><path d="M13 5h2M13 8h2M13 11h2" stroke="#1B2A49" stroke-width="1.5"/></svg>',
  // 温度カード（℃）：目盛りが途中でずれた温度計（セルシウスの罠の目印）
  tset_c: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#fff" stroke="#1B2A49" stroke-width="2"/><circle cx="10" cy="15" r="2.2" fill="#2F6FED"/><path d="M10 13V7" stroke="#2F6FED" stroke-width="2"/><path d="M13 4h2M13 7h2M14 9.5h3M14 12h3" stroke="#1B2A49" stroke-width="1.5"/></svg>',
};

function cardHTML(card) {
  const l = cardLines(card);
  const top = l.top.replace(/^([VT])/, '<span class="v">$1</span>');
  return `${ICONS[card.type] || ''}<span class="label"><span class="top">${top}</span><span class="bottom">${l.bottom}</span></span><span class="foot"></span>`;
}

function makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card' + (isTempCard(card) ? ' temp' : '');
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
  updatePreview();
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
    let res = 'none';
    if (dragging) {
      const slot = slotAt(e.clientX, e.clientY);
      if (slot !== undefined) res = board.place(idx, slot);
    } else {
      res = board.place(idx);
    }
    if (res === 'ok') {
      if (!settings.assist) hideMessage();
      renderField();
      renderHand();
      const s = board.field.indexOf(idx);
      const c = document.querySelector(`.slot[data-slot="${s}"] .card`);
      if (c) c.classList.add('snap');
    } else if (res === 'temp_limit') {
      showMessage(TEXT.tempLimit, 'show', CONFIG.ANIM.NOTICE_MS);
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

// カード1枚を、弧を描いてボンベへ飛ばす
function flyCard(c) {
  const to = view.bombeCenter();
  const r = c.getBoundingClientRect();
  const dx = to.x - (r.left + r.width / 2);
  const dy = to.y - (r.top + r.height / 2);
  const tilt = dx > 0 ? 1 : -1;
  const anim = c.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.55 - 70}px) scale(0.85) rotate(${12 * tilt}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.15) rotate(${25 * tilt}deg)`, opacity: 0 },
    ],
    { duration: CONFIG.ANIM.CARD_FLY_MS, easing: 'ease-in', fill: 'forwards' },
  );
  return anim.finished.catch(() => {});
}

// ---------- デュエル！ ----------
$('btn-duel').addEventListener('pointerdown', () => { if (!$('btn-duel').disabled) vibrate(CONFIG.VIBRATE_TAP_MS); });
$('btn-duel').addEventListener('click', async () => {
  if (busy || !board.canDuel()) return;
  busy = true;
  hideMessage();
  hideHint();
  view.setGhost(null);
  $('btn-duel').disabled = true;
  const result = board.duel();
  const A = CONFIG.ANIM;

  // 1) カードが左から1枚ずつボンベに吸い込まれ、そのたびにピストン・温度・針が変わる
  //    （次のカードは、前のカードの変化と重ねて飛ばし始める）
  const cards = [...document.querySelectorAll('.slot .card')];
  let prevStep = Promise.resolve();
  for (let i = 0; i < cards.length; i++) {
    await flyCard(cards[i]);
    await prevStep;
    const st = result.steps[i];
    renderState(st);
    prevStep = view.animateTo(num(st), A.STEP_MS);
  }
  await prevStep;

  const stamp = $('stamp');
  stamp.className = 'stamp';

  if (result.kind === 'just') {
    // 2) 針が目標でピタッと止まる → 3) JUST! → 4) 光の輪
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
    busy = false;
    renderAll();
    view.set(num(board.state), toNumber(board.target));
    const tc = document.querySelector('.target-card');
    tc.classList.remove('pop'); void tc.offsetWidth; tc.classList.add('pop');
    if (board.ventilated) showMessage(TEXT.ventilated, 'show', A.NOTICE_MS);
  } else {
    // ハズレ：ボンベがよろけ、考え違いの一言を目標カードの下に出す。カードは手札へ、ボンベは元へ
    view.shake();
    stamp.textContent = TEXT.miss;
    void stamp.offsetWidth;
    stamp.className = 'stamp miss show';
    if (result.mistake !== 'range') recordMistake(result.mistake, CONFIG.MISTAKE_HISTORY);
    showHint(TEXT.mistakes[result.mistake] || TEXT.mistakes.calc, A.MISS_MSG_MS);
    if (result.valid) showMessage(TEXT.missResult(formatP(result.after.P)), 'show', A.MISS_MSG_MS);
    await wait(A.MISS_HOLD_MS);
    stamp.classList.add('fade');
    board.commitMiss();
    renderState(board.state);
    await view.animateTo(num(board.state), A.MISS_BACK_MS);
    busy = false;
    renderField();
    renderHand();
  }
});

// ---------- 引き直し ----------
$('btn-reroll').addEventListener('click', () => {
  if (busy) return;
  vibrate(CONFIG.VIBRATE_TAP_MS);
  board.reroll();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  showMessage(board.ventilated ? TEXT.ventilated : TEXT.rerolled, 'show', CONFIG.ANIM.NOTICE_MS);
});

applyTexts();
show('screen-title');
window.__srdReady = true; // 読み込みに成功した印（index.html のお知らせを出さない）

// 動作確認用（URL に ?debug を付けたときだけ）
if (new URLSearchParams(location.search).has('debug')) {
  window.__srd = { get board() { return board; }, startGame };
}
