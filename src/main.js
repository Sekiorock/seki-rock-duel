// 全体の進行（画面の切り替え）と、盤面の表示・タッチ操作。
// 練習室と道場は、同じプレイ画面を使う（mode で切り替える）。

import { CONFIG } from './config.js?v=0.3.0';
import { TEXT, formatP, formatV, formatT, setLang, getLang, LANGS } from './text.js?v=0.3.0';
import { toNumber } from './frac.js?v=0.3.0';
import { createRng, randomSeed } from './rng.js?v=0.3.0';
import { cardLines, isTempCard } from './cards.js?v=0.3.0';
import { Board } from './game.js?v=0.3.0';
import { Dojo } from './solo.js?v=0.3.0';
import { BombeView, FxLayer } from './render.js?v=0.3.0';
import { AudioEngine } from './audio.js?v=0.3.0';
import { Music } from './music.js?v=0.3.0';
import {
  loadSettings, saveSettings, recordMistake, favoriteMistake, loadRecords, recordDojo,
} from './storage.js?v=0.3.0';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 対応していない端末 */ } };
const num = (s) => ({ P: toNumber(s.P), V: toNumber(s.V), T: toNumber(s.T) });
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const settings = loadSettings();
setLang(settings.lang);

// ---------- 音 ----------
const audio = new AudioEngine();
audio.muted = !!settings.muted;
const music = new Music(audio);
let songId = null;              // いま流している（流したい）曲

function playSong(id) {
  songId = id;
  if (!settings.muted && audio.ctx) music.start(id);
}
function stopSong() {
  songId = null;
  music.stop();
}
// スマホは画面に触れるまで音を出せない。最初のタップで音を有効にする（9.5）
document.addEventListener('pointerdown', () => {
  const first = !audio.ctx;
  audio.unlock();
  if (first && songId && !settings.muted && !music.playing) music.start(songId);
}, { capture: true });

// ---------- 文言を流し込む（言語を切り替えたときも、ここを呼び直す） ----------
const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

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
  renderMuteButtons();
  renderBest();
}
$('version').textContent = CONFIG.VERSION;

function renderMuteButtons() {
  document.querySelectorAll('[data-mute-toggle]').forEach((b) => {
    b.innerHTML = settings.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    b.setAttribute('aria-label', settings.muted ? TEXT.unmute : TEXT.mute);
    b.setAttribute('aria-pressed', String(!!settings.muted));
  });
}

function renderBest() {
  const r = loadRecords();
  $('dojo-best').textContent = r.dojoBest > 0 ? TEXT.best(fmtInt(r.dojoBest)) : '';
}

// 言語の切り替え（ホーム・練習室・プレイ画面の右上のボタン）
function toggleLang() {
  const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
  settings.lang = setLang(next);
  saveSettings(settings);
  applyTexts();
  if (board) {
    renderTargetLabel();
    $('target-text').textContent = TEXT.targetText(formatP(board.target));
    if (!busy) {
      hideMessage();
      hideHint();
      renderAll();
    }
  }
  if (!$('screen-result').hidden && lastSummary) renderResult(lastSummary, lastNewBest);
}
document.querySelectorAll('[data-lang-toggle]').forEach((b) => {
  b.addEventListener('pointerdown', () => vibrate(CONFIG.VIBRATE_TAP_MS));
  b.addEventListener('click', toggleLang);
});

// 消音（9.5：右上に常に置く）
function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings(settings);
  audio.setMuted(settings.muted);
  if (settings.muted) music.stop();
  else if (songId && audio.ctx) music.start(songId);
  renderMuteButtons();
}
document.querySelectorAll('[data-mute-toggle]').forEach((b) => {
  b.addEventListener('pointerdown', () => vibrate(CONFIG.VIBRATE_TAP_MS));
  b.addEventListener('click', toggleMute);
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
  el.addEventListener('click', () => { el.classList.remove('press'); audio.click(); onClick(); });
}

// ---------- 画面の切り替え ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id === 'screen-title') titleBombe.resize();
  if (id !== 'screen-play') setDangerLook(0);
}

// ---------- タイトル画面 ----------
const titleBombe = new BombeView($('title-bombe'), { showGauge: false });
pressable($('btn-dojo'), () => startDojo());
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
  pressable(b, () => startPractice(n));
  $('stage-grid').appendChild(b);
}

// ---------- プレイ画面 ----------
let mode = null;      // 'practice' | 'dojo'
let board = null;
let dojo = null;
let view = null;
let fx = null;
let busy = false;     // 演出中は操作を受け付けない
let paused = false;
let streak = 0;       // 練習室の連続ジャスト（音の高さと曲に使う）
let msgTimer = null;
let hintTimer = null;
let loopTimer = null;
let lastTick = 0;
let lastSummary = null;
let lastNewBest = false;

const prefer = () => favoriteMistake(CONFIG.MISTAKE_MODELS);

function enterPlay() {
  show('screen-play');
  const scr = $('screen-play');
  scr.dataset.mode = mode;
  scr.classList.remove('fever', 'super');
  if (!view) view = new BombeView($('bombe'));
  else view.resize();
  if (!fx) fx = new FxLayer($('fx'));
  view.clearBurst();
  view.setShadow(null);
  view.setDanger(0);
  busy = false;
  paused = false;
  streak = 0;
  $('pause').hidden = true;
  $('stamps').innerHTML = '';
  // 隠れていた画面を出し直すと、CSSの演出が最初から再生されてしまうので消しておく
  $('banner').className = 'banner';
  $('banner').textContent = '';
  $('score-pop').className = 'score-pop num';
  $('flash').className = 'flash';
  hideHint();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  showMessage(TEXT.handHint, 'soft');
  music.setState({ chain: 0 });
  music.setHeartbeat(false);
}

function startPractice(stage) {
  mode = 'practice';
  dojo = null;
  board = new Board({ stage, rng: createRng(randomSeed()), preferModel: prefer });
  stopLoop();
  enterPlay();
  playSong('practice');
}

function startDojo() {
  mode = 'dojo';
  dojo = new Dojo({ rng: createRng(randomSeed()), preferModel: prefer });
  board = dojo.board;
  enterPlay();
  updateDojoHud();
  playSong('dojo');
  startLoop();
}

function goHome() {
  stopLoop();
  stopSong();
  mode = null;
  board = null;
  dojo = null;
  paused = false;
  $('pause').hidden = true;
  audio.resume();
  renderBest();
  show('screen-title');
}

$('btn-home').addEventListener('click', () => {
  if (mode === 'dojo' && dojo && !dojo.over) {
    pause();
    return;
  }
  if (busy) return;
  goHome();
});

// ---------- 道場の時計（一時停止中は進まない） ----------
function startLoop() {
  stopLoop();
  lastTick = performance.now();
  loopTimer = setInterval(tickDojo, CONFIG.DOJO.TICK_MS);
}
function stopLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

function tickDojo() {
  const now = performance.now();
  const dt = Math.min(500, now - lastTick);
  lastTick = now;
  if (!dojo || paused) return;
  if (dojo.over) {
    if (!busy) doBurst();
    return;
  }
  const events = dojo.tick(dt);
  if (events.includes('chain_lost')) {
    audio.chainLost();
    showMessage(TEXT.chainLost, 'show', CONFIG.ANIM.NOTICE_MS);
    music.setState({ chain: 0, fever: !!dojo.fever, superFever: !!(dojo.fever && dojo.fever.super) });
  }
  if (events.includes('fever_end')) {
    setFeverLook(false, false);
    music.setState({ chain: dojo.vitals.chain });
  }
  updateDojoHud();
  if (events.includes('burst') && !busy) doBurst();
}

function updateDojoHud() {
  if (!dojo) return;
  const v = dojo.vitals;
  $('score').textContent = fmtInt(dojo.score);
  $('chain').textContent = String(v.chain);
  $('chain-fill').style.width = `${(v.chainLeft(dojo.clock) * 100).toFixed(1)}%`;
  $('danger-fill').style.height = `${v.meter}%`;
  $('danger-num').textContent = String(Math.round(v.meter));
  $('danger').classList.toggle('warn', v.meter >= CONFIG.DOJO.WARN_AT);
  $('fever-bar').firstElementChild.style.transform = `scaleX(${dojo.feverLeft()})`;
  setDangerLook(v.meter);
  view.setDanger(v.meter);
  music.setHeartbeat(v.meter >= CONFIG.DOJO.WARN_AT);
}

// 危険が高いほど、画面の縁がネイビーに暗くなり、脈打つ（10.1：赤は使わない）
function setDangerLook(m) {
  const vg = $('vignette');
  vg.style.opacity = String(Math.max(0, Math.min(1, (m - 40) / 60)));
  vg.classList.toggle('pulse', m >= CONFIG.DOJO.WARN_AT);
}

function setFeverLook(fever, superFever) {
  const scr = $('screen-play');
  scr.classList.toggle('fever', fever);
  scr.classList.toggle('super', superFever);
}

// ---------- 一時停止（別のアプリに移ったとき、ホームボタン） ----------
function pause() {
  if (paused || !dojo || dojo.over) return;
  paused = true;
  $('pause').hidden = false;
  audio.suspend();
}
function resume() {
  if (!paused) return;
  paused = false;
  $('pause').hidden = true;
  lastTick = performance.now();
  audio.resume();
}
$('btn-resume').addEventListener('click', resume);
$('btn-quit').addEventListener('click', () => {
  if (!dojo) return goHome();
  paused = false;
  $('pause').hidden = true;
  audio.resume();
  dojo.over = true;
  finishDojo(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'dojo' && dojo && !dojo.over) pause();
    else audio.suspend();
  } else if (!paused) {
    audio.resume();
    lastTick = performance.now();
  }
});

// ---------- 表示 ----------
function renderTargetLabel() {
  let t = TEXT.targetLabel;
  if (mode === 'dojo') t = TEXT.targetStage(board.stage);
  else if (settings.assist) t = `${TEXT.targetLabel} · ${TEXT.assistOn}`;
  $('target-label').textContent = t;
}

function renderAll() {
  $('stage-num').textContent = String(board.stage);
  $('just-count').textContent = String(board.justCount);
  renderTargetLabel();
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

function showBanner(text, big = false) {
  const b = $('banner');
  b.textContent = text;
  b.className = 'banner' + (big ? ' big' : '');
  void b.offsetWidth;
  b.classList.add('show');
}

function flash(blue = false) {
  const f = $('flash');
  f.className = 'flash' + (blue ? ' blue' : '');
  void f.offsetWidth;
  f.classList.add('go');
}

// 補助あり：シャドウのピストン・針・温度計が、場のカードを左から1枚ずつ試すように動く
function updatePreview() {
  if (mode !== 'practice' || !settings.assist || busy) { view.setShadow(null); return; }
  const r = board.preview();
  if (!r) {
    view.setShadow(null);
    if ($('message').classList.contains('preview')) hideMessage();
    return;
  }
  const seq = [num(board.state), ...r.steps.map(num)];
  view.setShadow(seq, (i) => {
    document.querySelectorAll('.slot .card').forEach((c, k) => c.classList.toggle('sim', k === i));
  });
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
  const long = l.bottom.length >= 6 ? ' long' : ''; // 「−123℃」のような長い表記は少し小さく
  return `${ICONS[card.type] || ''}<span class="label"><span class="top">${top}</span><span class="bottom${long}">${l.bottom}</span></span><span class="foot"></span>`;
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
        if (busy || paused) return;
        e.preventDefault();
        vibrate(CONFIG.VIBRATE_TAP_MS);
        audio.unplace();
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
    if (busy || paused) return;
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
    if (cancelled || busy || paused) return;
    let res = 'none';
    if (dragging) {
      const slot = slotAt(e.clientX, e.clientY);
      if (slot !== undefined) res = board.place(idx, slot);
    } else {
      res = board.place(idx);
    }
    if (res === 'ok') {
      const s = board.field.indexOf(idx);
      audio.place(s);
      if (!settings.assist || mode !== 'practice') hideMessage();
      renderField();
      renderHand();
      const c = document.querySelector(`.slot[data-slot="${s}"] .card`);
      if (c) c.classList.add('snap');
    } else if (res === 'temp_limit') {
      audio.deny();
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

// スタンプ（JUST! に SMART! SPEED! が2重・3重に重なる）
function stamp(text, cls) {
  const el = document.createElement('div');
  el.className = `stamp ${cls}`;
  el.textContent = text;
  $('stamps').appendChild(el);
  void el.offsetWidth;
  el.classList.add('show');
  return el;
}
function clearStamps() {
  const box = $('stamps');
  [...box.children].forEach((el) => el.classList.add('fade'));
  setTimeout(() => { [...box.children].forEach((el) => { if (el.classList.contains('fade')) el.remove(); }); }, 300);
}

// ---------- デュエル！ ----------
$('btn-duel').addEventListener('pointerdown', () => { if (!$('btn-duel').disabled) vibrate(CONFIG.VIBRATE_TAP_MS); });
$('btn-duel').addEventListener('click', async () => {
  if (busy || paused || !board.canDuel()) return;
  busy = true;
  const pressAt = dojo ? dojo.clock : 0;
  hideMessage();
  hideHint();
  view.setShadow(null);
  $('btn-duel').disabled = true;
  const result = board.duel();
  const A = CONFIG.ANIM;

  // 1) カードが左から1枚ずつボンベに吸い込まれ、そのたびにピストン・温度・針が変わる
  const cards = [...document.querySelectorAll('.slot .card')];
  let prevStep = Promise.resolve();
  for (let i = 0; i < cards.length; i++) {
    audio.suck(i);
    await flyCard(cards[i]);
    await prevStep;
    const st = result.steps[i];
    const before = i === 0 ? result.before : result.steps[i - 1];
    renderState(st);
    audio.needle(toNumber(st.P) >= toNumber(before.P));
    prevStep = view.animateTo(num(st), A.STEP_MS);
  }
  await prevStep;
  $('stamps').innerHTML = '';

  if (result.kind === 'just') await onJustShown(result, pressAt);
  else await onMissShown(result);

  busy = false;
  if (dojo && dojo.over) doBurst();
});

async function onJustShown(result, pressAt) {
  const A = CONFIG.ANIM;
  // 2) 針が目標でピタッと止まる → 3) JUST! → 4) 光の輪
  let info;
  if (dojo) {
    info = dojo.onJust(result, pressAt);
  } else {
    streak++;
    board.commitJust(result);
    info = { chain: streak, smart: false, speed: false, points: 0 };
  }
  stamp(TEXT.just, '');
  view.ring();
  audio.just(info.chain, info);
  vibrate(CONFIG.VIBRATE_JUST);
  flash(!settings.muted);
  if (info.smart) setTimeout(() => stamp(TEXT.smart, 's2'), A.STAMP_STACK_MS);
  if (info.speed) setTimeout(() => stamp(TEXT.speed, info.smart ? 's3' : 's2'), A.STAMP_STACK_MS * 2);

  if (dojo) {
    if (info.points) {
      const sp = $('score-pop');
      sp.textContent = `+${fmtInt(info.points)}`;
      replay(sp, 'show');
    }
    const sc = $('score');
    sc.textContent = fmtInt(dojo.score);
    replay(sc, 'bump');
    const ch = $('chain');
    ch.textContent = String(info.chain);
    replay(ch, 'bump');
    if (info.superStarted) {
      setFeverLook(true, true);
      showBanner(TEXT.superFever, true);
      fx.confetti(110);
      audio.feverStart(true);
    } else if (info.feverStarted) {
      setFeverLook(true, false);
      showBanner(TEXT.fever, true);
      fx.confetti(70);
      audio.feverStart(false);
    } else if (info.chain >= 2) {
      showBanner(TEXT.chainPop(info.chain));
    }
    if (info.fever && !info.feverStarted && !info.superStarted) fx.confetti(12);
    music.setState({ chain: info.chain, fever: info.fever, superFever: info.superFever });
    updateDojoHud();
  } else {
    $('just-count').textContent = String(board.justCount);
    replay($('just-count'), 'bump');
    if (streak >= 2) showBanner(TEXT.chainPop(streak));
    music.setState({ chain: streak });
  }
  await wait(A.STAMP_MS);

  // 5) 次の目標カード
  clearStamps();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  replay(document.querySelector('.target-card'), 'pop');
  if (board.ventilated) showMessage(TEXT.ventilated, 'show', A.NOTICE_MS);
  else if (info.stageUp) showMessage(TEXT.stageUp(board.stage), 'show', A.NOTICE_MS);
}

async function onMissShown(result) {
  const A = CONFIG.ANIM;
  // ハズレ：ボンベがよろけ、考え違いの一言を目標カードの下に出す。カードは手札へ、ボンベは元へ
  view.shake();
  stamp(TEXT.miss, 'miss');
  audio.miss();
  music.onMiss();
  if (result.mistake !== 'range') recordMistake(result.mistake, CONFIG.MISTAKE_HISTORY);
  showHint(TEXT.mistakes[result.mistake] || TEXT.mistakes.calc, A.MISS_MSG_MS);
  if (result.valid) showMessage(TEXT.missResult(formatP(result.after.P)), 'show', A.MISS_MSG_MS);
  if (dojo) {
    dojo.onMiss(result);
    music.setState({ chain: 0, fever: !!dojo.fever, superFever: !!(dojo.fever && dojo.fever.super) });
    updateDojoHud();
  } else {
    streak = 0;
    board.commitMiss();
    music.setState({ chain: 0 });
  }
  await wait(A.MISS_HOLD_MS);
  clearStamps();
  renderState(board.state);
  await view.animateTo(num(board.state), A.MISS_BACK_MS);
  renderField();
  renderHand();
}

// ---------- 引き直し ----------
$('btn-reroll').addEventListener('click', () => {
  if (busy || paused) return;
  vibrate(CONFIG.VIBRATE_TAP_MS);
  audio.reroll();
  if (dojo) {
    dojo.onReroll();
    updateDojoHud();
  } else {
    board.reroll();
  }
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  showMessage(board.ventilated ? TEXT.ventilated : TEXT.rerolled, 'show', CONFIG.ANIM.NOTICE_MS);
  if (dojo && dojo.over) doBurst();
});

// ---------- 破裂と結果 ----------
let bursting = false;
async function doBurst() {
  if (bursting || !dojo) return;
  bursting = true;
  busy = true;
  stopLoop();
  music.stop();
  audio.burst();
  view.setShadow(null);
  view.burst();
  flash(false);
  vibrate([90, 40, 140]);
  setFeverLook(false, false);
  showBanner(TEXT.resultTitle, true);
  await wait(CONFIG.ANIM.BURST_MS);
  bursting = false;
  finishDojo(true);
}

function finishDojo(burst) {
  stopLoop();
  stopSong();
  busy = false;
  const sum = dojo.summary();
  sum.burst = burst;
  const { newBest } = recordDojo(sum);
  lastSummary = sum;
  lastNewBest = newBest;
  setFeverLook(false, false);
  if (view) view.clearBurst();
  renderResult(sum, newBest);
  show('screen-result');
  // 得点を数え上げる
  const el = $('result-score');
  const t0 = performance.now();
  const dur = 900;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = fmtInt(sum.score * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  if (newBest && sum.score > 0) setTimeout(() => audio.fanfare(), 600);
}

function renderResult(sum, newBest) {
  $('result-title').textContent = sum.burst ? TEXT.resultTitle : TEXT.resultQuit;
  $('result-score').textContent = fmtInt(sum.score);
  const best = $('result-best');
  const rec = loadRecords();
  best.className = 'result-best' + (newBest && sum.score > 0 ? ' new' : '');
  best.textContent = newBest && sum.score > 0 ? TEXT.newBest : TEXT.best(fmtInt(rec.dojoBest));
  const stats = [
    [TEXT.resMaxChain, sum.maxChain],
    [TEXT.resJusts, sum.justs],
    [TEXT.resStage, sum.stage],
    [TEXT.resSmart, sum.smarts],
    [TEXT.resSpeed, sum.speeds],
    [TEXT.resTime, TEXT.timeFmt(sum.timeMs)],
  ];
  $('result-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  // 考え違いの集計：本人にだけ見せる（1.3-5）
  const rows = Object.entries(sum.mistakes).sort((a, b) => b[1] - a[1]);
  $('result-mistakes').innerHTML = rows.length
    ? rows.map(([id, n]) => `<div class="mistake-row"><b>${TEXT.mistakeNames[id] || id}<em>${TEXT.times(n)}</em></b><p>${TEXT.mistakes[id] || ''}</p></div>`).join('')
    : `<p class="mistake-none">${TEXT.noMistakes}</p>`;
}

pressable($('btn-retry'), () => startDojo());
pressable($('btn-result-home'), () => goHome());

// ---------- 起動 ----------
applyTexts();
show('screen-title');
window.__srdReady = true; // 読み込みに成功した印（index.html のお知らせを出さない）

// 動作確認用（URL に ?debug を付けたときだけ）
if (new URLSearchParams(location.search).has('debug')) {
  window.__srd = {
    get board() { return board; },
    get dojo() { return dojo; },
    get audio() { return audio; },
    get music() { return music; },
    startGame: startPractice,
    startDojo,
  };
}
