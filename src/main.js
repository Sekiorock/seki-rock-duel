// 全体の進行（画面の切り替え）と、盤面の表示・タッチ操作。
// 練習室・道場・タイムアタック・今日の5問・昇段試験は、同じプレイ画面を使う（run.kind で切り替える）。

import { CONFIG } from './config.js?v=0.4.0';
import { TEXT, formatP, formatV, formatT, setLang, getLang, LANGS } from './text.js?v=0.4.0';
import { toNumber } from './frac.js?v=0.4.0';
import { createRng, randomSeed } from './rng.js?v=0.4.0';
import { cardLines, isTempCard } from './cards.js?v=0.4.0';
import { trapModelsInHand } from './puzzle.js?v=0.4.0';
import {
  Dojo, PracticeRun, TimeAttack, DailyRun, ExamRun, dateKey,
  rankProgress, examAvailable, dojoExp, taExp, dailyExp, rollPack, earnedTitles, TITLES,
  addMastery, masteryStars, MASTERY_CARDS,
} from './solo.js?v=0.4.0';
import { BombeView, FxLayer } from './render.js?v=0.4.0';
import { AudioEngine } from './audio.js?v=0.4.0';
import { Music } from './music.js?v=0.4.0';
import { ARTS, ART_BY_ID, artURL } from './chars.js?v=0.4.0';
import {
  migrate, loadSettings, saveSettings, recordMistake, favoriteMistake,
  loadRecords, saveRecords, loadProfile, saveProfile, loadCollection, saveCollection,
  loadTitles, saveTitles, loadMastery, saveMastery,
} from './storage.js?v=0.4.0';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 対応していない端末 */ } };
const num = (s) => ({ P: toNumber(s.P), V: toNumber(s.V), T: toNumber(s.T) });
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

migrate(); // 古い版の記録を、新しい形に変換する（記録は消さない）
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
  renderTitleScreen();
}
$('version').textContent = CONFIG.VERSION;

function renderMuteButtons() {
  document.querySelectorAll('[data-mute-toggle]').forEach((b) => {
    b.innerHTML = settings.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    b.setAttribute('aria-label', settings.muted ? TEXT.unmute : TEXT.mute);
    b.setAttribute('aria-pressed', String(!!settings.muted));
  });
}

// 言語の切り替え（どの画面でも右上のボタン）
function toggleLang() {
  const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
  settings.lang = setLang(next);
  saveSettings(settings);
  applyTexts();
  if (run && board) {
    renderTargetLabel();
    updateHud();
    $('target-text').textContent = TEXT.targetText(formatP(board.target));
    if (!busy) {
      hideMessage();
      hideHint();
      renderAll();
    }
  }
  if (!$('screen-result').hidden && lastResult) renderResult(lastResult);
  if (!$('screen-records').hidden) renderRecords();
  if (!$('screen-collection').hidden) renderCollection();
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

let toastTimer = null;
function toast(text, ms = 2600) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- 画面の切り替え ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id === 'screen-title') { titleBombe.resize(); renderTitleScreen(); }
  if (id !== 'screen-play') setDangerLook(0);
}

// ---------- 絵柄の付け替え（カードの裏面・ボンベのラベル） ----------
let stickerImg = null;
function applySkins() {
  const col = loadCollection();
  if (col.bombe) {
    const img = new Image();
    img.src = artURL(col.bombe);
    stickerImg = img;
  } else stickerImg = null;
  titleBombe.setSticker(stickerImg);
  if (view) view.setSticker(stickerImg);
}

// ---------- タイトル画面 ----------
const titleBombe = new BombeView($('title-bombe'), { showGauge: false });

function renderTitleScreen() {
  const r = loadRecords();
  const prof = loadProfile();
  const col = loadCollection();
  $('dojo-best').textContent = r.dojoBest > 0 ? TEXT.best(fmtInt(r.dojoBest)) : '';
  $('rank-name').textContent = TEXT.ranks[prof.rank];
  $('rank-fill').style.width = `${rankProgress(prof).ratio * 100}%`;
  $('btn-exam-ready').hidden = !examAvailable(prof);
  // タイムアタックと今日の5問は、道場で1回遊ぶと解放（5.1）
  const unlocked = r.dojoPlays >= 1;
  $('btn-ta').classList.toggle('locked', !unlocked);
  $('btn-daily').classList.toggle('locked', !unlocked);
  $('btn-ta').querySelector('small').textContent = unlocked ? TEXT.taDesc : TEXT.locked;
  const today = r.daily[dateKey()];
  $('daily-sub').textContent = !unlocked ? TEXT.locked
    : today ? TEXT.dailyRecord(today.cards, TEXT.timeFmt(today.timeMs)) : TEXT.dailyDesc;
  $('pack-badge').hidden = !(col.pending > 0);
  $('pack-badge').textContent = String(col.pending);
  $('collection-sub').textContent = col.pending > 0 ? TEXT.packsWaiting(col.pending) : TEXT.collectionDesc;
}

pressable($('btn-dojo'), () => startRun('dojo'));
pressable($('btn-ta'), () => { if (loadRecords().dojoPlays >= 1) startRun('ta'); else toast(TEXT.locked); });
pressable($('btn-daily'), () => { if (loadRecords().dojoPlays >= 1) startRun('daily'); else toast(TEXT.locked); });
pressable($('btn-practice'), () => show('screen-select'));
pressable($('btn-collection'), () => { renderCollection(); show('screen-collection'); });
pressable($('btn-records'), () => { renderRecords(); show('screen-records'); });
pressable($('rank-chip'), () => { renderRecords(); show('screen-records'); });
pressable($('btn-exam-ready'), () => { renderRecords(); show('screen-records'); });
document.querySelectorAll('[data-go-home]').forEach((b) => b.addEventListener('click', () => show('screen-title')));

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
  pressable(b, () => startRun('practice', { stage: n }));
  $('stage-grid').appendChild(b);
}

// ---------- プレイ画面 ----------
let run = null;       // いま遊んでいるモード（solo.js の Dojo / PracticeRun / TimeAttack / DailyRun / ExamRun）
let board = null;
let view = null;
let fx = null;
let busy = false;     // 演出中は操作を受け付けない
let paused = false;
let msgTimer = null;
let hintTimer = null;
let loopTimer = null;
let lastTick = 0;
let lastResult = null;
let targetWall = 0;   // 今の目標が出た時刻（熟練度の平均時間に使う）
let seenCards = new Set();

const prefer = () => favoriteMistake(CONFIG.MISTAKE_MODELS);
const SONG_OF = { practice: 'practice', dojo: 'dojo', ta: 'battle', daily: 'practice', exam: 'battle' };

function startRun(kind, opts = {}) {
  const rng = createRng(randomSeed());
  if (kind === 'dojo') run = new Dojo({ rng, preferModel: prefer });
  else if (kind === 'ta') run = new TimeAttack({ rng, preferModel: prefer });
  else if (kind === 'daily') run = new DailyRun({ key: dateKey() });
  else if (kind === 'exam') run = new ExamRun({ rank: loadProfile().rank, rng });
  else run = new PracticeRun({ stage: opts.stage || 1, rng, preferModel: prefer });
  board = run.board;
  enterPlay();
  playSong(SONG_OF[kind]);
  startLoop();
}

function enterPlay() {
  show('screen-play');
  const scr = $('screen-play');
  scr.dataset.mode = run.kind;
  scr.classList.remove('fever', 'super');
  if (!view) view = new BombeView($('bombe'));
  else view.resize();
  if (!fx) fx = new FxLayer($('fx'));
  view.setSticker(stickerImg);
  view.clearBurst();
  view.setShadow(null);
  view.setDanger(0);
  busy = false;
  paused = false;
  seenCards = new Set();
  $('pause').hidden = true;
  $('stamps').innerHTML = '';
  // 隠れていた画面を出し直すと、CSSの演出が最初から再生されてしまうので消しておく
  $('banner').className = 'banner';
  $('banner').textContent = '';
  $('score-pop').className = 'score-pop num';
  $('flash').className = 'flash';
  $('fever-bar').firstElementChild.style.transform = 'scaleX(1)';
  hideHint();
  renderAll();
  updateHud();
  view.set(num(board.state), toNumber(board.target));
  targetWall = performance.now();
  showMessage(run.kind === 'exam' ? TEXT.examRule(TEXT.ranks[run.targetRank], run.stage, CONFIG.RANK.EXAM_JUSTS) : TEXT.handHint, 'soft');
  music.setState({ chain: 0 });
  music.setHeartbeat(false);
}

function goHome() {
  stopLoop();
  stopSong();
  run = null;
  board = null;
  paused = false;
  $('pause').hidden = true;
  audio.resume();
  show('screen-title');
}

$('btn-home').addEventListener('click', () => {
  if (run && run.kind !== 'practice' && !run.over) {
    pause();
    return;
  }
  if (busy) return;
  goHome();
});

// ---------- 時計（一時停止中は進まない） ----------
function startLoop() {
  stopLoop();
  lastTick = performance.now();
  loopTimer = setInterval(tick, CONFIG.DOJO.TICK_MS);
}
function stopLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

function tick() {
  const now = performance.now();
  const dt = Math.min(500, now - lastTick);
  lastTick = now;
  if (!run || paused) return;
  if (run.over) {
    if (!busy) endOfRun();
    return;
  }
  const events = run.tick(dt);
  if (events.includes('chain_lost') && run.kind === 'dojo') {
    audio.chainLost();
    showMessage(TEXT.chainLost, 'show', CONFIG.ANIM.NOTICE_MS);
    music.setState({ chain: 0, fever: !!run.fever, superFever: !!(run.fever && run.fever.super) });
  }
  if (events.includes('fever_end')) {
    setFeverLook(false, false);
    music.setState({ chain: run.vitals.chain });
  }
  updateHud();
  if (run.over && !busy) endOfRun();
}

// モードが終わったとき（破裂、時間切れ、5問クリア、試験の合否）
function endOfRun() {
  if (!run) return;
  if (run.kind === 'dojo') doBurst();
  else finishRun(true);
}

function updateHud() {
  if (!run) return;
  const k = run.kind;
  if (k === 'dojo') {
    const v = run.vitals;
    $('score').textContent = fmtInt(run.score);
    $('chain').textContent = String(v.chain);
    $('chain-fill').style.width = `${(v.chainLeft(run.clock) * 100).toFixed(1)}%`;
    $('danger-fill').style.height = `${v.meter}%`;
    $('danger-num').textContent = String(Math.round(v.meter));
    $('danger').classList.toggle('warn', v.meter >= CONFIG.DOJO.WARN_AT);
    $('fever-bar').firstElementChild.style.transform = `scaleX(${run.feverLeft()})`;
    setDangerLook(v.meter);
    view.setDanger(v.meter);
    music.setHeartbeat(v.meter >= CONFIG.DOJO.WARN_AT);
  } else if (k === 'ta') {
    $('hud-a-label').textContent = TEXT.taTimeLabel;
    $('hud-a').textContent = `${Math.ceil(run.timeLeft() / 1000)}`;
    $('hud-b-label').textContent = TEXT.justLabel;
    $('hud-b').textContent = String(run.justs);
    $('fever-bar').firstElementChild.style.transform = `scaleX(${run.timeLeft() / CONFIG.TA.TIME_MS})`;
  } else if (k === 'daily') {
    $('hud-a-label').textContent = TEXT.dailyHud;
    $('hud-a').textContent = `${Math.min(run.index + 1, CONFIG.DAILY.COUNT)}/${CONFIG.DAILY.COUNT}`;
    $('hud-b-label').textContent = TEXT.dailyTime;
    $('hud-b').textContent = TEXT.timeFmt(run.clock);
  } else if (k === 'exam') {
    $('hud-a-label').textContent = TEXT.examHud;
    $('hud-a').textContent = `${run.count}/${CONFIG.RANK.EXAM_JUSTS}`;
    $('hud-b-label').textContent = TEXT.rankLabel;
    $('hud-b').textContent = TEXT.ranks[run.targetRank];
  } else {
    $('stage-num').textContent = String(board.stage);
    $('just-count').textContent = String(board.justCount);
  }
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
  if (paused || !run || run.over || run.kind === 'practice') return;
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
  if (!run) return goHome();
  paused = false;
  $('pause').hidden = true;
  audio.resume();
  run.over = true;
  finishRun(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (run && run.kind !== 'practice' && !run.over) pause();
    else audio.suspend();
  } else if (!paused) {
    audio.resume();
    lastTick = performance.now();
  }
});

// ---------- 表示 ----------
function renderTargetLabel() {
  let t = TEXT.targetLabel;
  const k = run ? run.kind : 'practice';
  if (k === 'dojo' || k === 'ta' || k === 'daily') t = TEXT.targetStage(board.stage);
  else if (k === 'exam') t = TEXT.examTitleHud(TEXT.ranks[run.targetRank]);
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
  if (!run || run.kind !== 'practice' || !settings.assist || busy) { view.setShadow(null); return; }
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
  const backURL = artURL(loadCollection().back);
  board.hand.forEach((card, idx) => {
    const pos = document.createElement('div');
    pos.className = 'hand-pos';
    if (!card || board.isOnField(idx)) {
      pos.classList.add('used');
    } else {
      const el = makeCard(card);
      // 新しく配られたカードは、裏面（集めた絵柄を付けられる）から表にめくれる
      if (!seenCards.has(card.uid)) {
        seenCards.add(card.uid);
        const back = document.createElement('span');
        back.className = 'back';
        if (backURL) back.style.backgroundImage = `url(${backURL})`;
        el.appendChild(back);
        back.addEventListener('animationend', () => back.remove());
      }
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
      if (!settings.assist || run.kind !== 'practice') hideMessage();
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

// ---------- 熟練度・累計・称号の記録 ----------
function recordDuel(result, snap, info) {
  const ok = result.kind === 'just';
  // 熟練度マップ：カードの種類ごと、罠の考え違いごと
  const m = loadMastery();
  addMastery(m, { types: result.cards.map((c) => c.type), traps: snap.traps, ok, ms: snap.ms });
  saveMastery(m);
  if (!ok) return;
  // 累計（称号の条件に使う）
  const r = loadRecords();
  const t = r.totals;
  t.justs++;
  if (info && info.smart) t.smarts++;
  if (info && info.speed) t.speeds++;
  t.tempJusts += result.cards.filter(isTempCard).length;
  if (snap.stage >= 5 && snap.hadCelsius) t.celsiusHighJusts++;
  saveRecords(r);
  checkTitles();
}

// 新しく条件を満たした称号を記録し、お知らせする
function checkTitles() {
  const have = loadTitles();
  const now = earnedTitles({ records: loadRecords(), profile: loadProfile(), collection: loadCollection() });
  const fresh = now.filter((id) => !have[id]);
  if (!fresh.length) return [];
  fresh.forEach((id) => { have[id] = Date.now(); });
  saveTitles(have);
  toast(TEXT.newTitle(TEXT.titleNames[fresh[0]]));
  return fresh;
}

// ---------- デュエル！ ----------
$('btn-duel').addEventListener('pointerdown', () => { if (!$('btn-duel').disabled) vibrate(CONFIG.VIBRATE_TAP_MS); });
$('btn-duel').addEventListener('click', async () => {
  if (busy || paused || !run || run.over || !board.canDuel()) return;
  busy = true;
  const pressAt = run.clock;
  const snap = {
    traps: trapModelsInHand(board.state, board.hand, board.target),
    hadCelsius: board.hand.some((c) => c && c.type === 'tset_c'),
    stage: board.stage,
    ms: performance.now() - targetWall,
  };
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

  if (result.kind === 'just') await onJustShown(result, pressAt, snap);
  else await onMissShown(result, snap);

  busy = false;
  if (run && run.over) endOfRun();
});

async function onJustShown(result, pressAt, snap) {
  const A = CONFIG.ANIM;
  const kind = run.kind;
  // 2) 針が目標でピタッと止まる → 3) JUST! → 4) 光の輪
  const info = run.onJust(result, pressAt);
  recordDuel(result, snap, info);
  stamp(TEXT.just, '');
  view.ring();
  audio.just(info.chain, info);
  vibrate(CONFIG.VIBRATE_JUST);
  flash(!settings.muted);
  if (info.smart && kind !== 'daily') setTimeout(() => stamp(TEXT.smart, 's2'), A.STAMP_STACK_MS);
  if (info.speed) setTimeout(() => stamp(TEXT.speed, info.smart ? 's3' : 's2'), A.STAMP_STACK_MS * 2);

  if (kind === 'dojo') {
    if (info.points) {
      const sp = $('score-pop');
      sp.textContent = `+${fmtInt(info.points)}`;
      replay(sp, 'show');
    }
    const sc = $('score');
    sc.textContent = fmtInt(run.score);
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
  } else {
    if (info.chain >= 2 && kind !== 'daily' && kind !== 'exam') showBanner(TEXT.chainPop(info.chain));
    music.setState({ chain: info.chain });
    if (kind === 'practice') replay($('just-count'), 'bump');
    if (kind === 'ta') replay($('hud-b'), 'bump');
    if (kind === 'exam' || kind === 'daily') replay($('hud-a'), 'bump');
  }
  updateHud();
  await wait(A.STAMP_MS);
  if (run.over) return; // 5問クリア・試験合格：結果画面へ

  // 5) 次の目標カード
  clearStamps();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  targetWall = performance.now();
  replay(document.querySelector('.target-card'), 'pop');
  if (board.ventilated) showMessage(TEXT.ventilated, 'show', A.NOTICE_MS);
  else if (info.stageUp) showMessage(TEXT.stageUp(board.stage), 'show', A.NOTICE_MS);
}

async function onMissShown(result, snap) {
  const A = CONFIG.ANIM;
  // ハズレ：ボンベがよろけ、考え違いの一言を目標カードの下に出す。カードは手札へ、ボンベは元へ
  view.shake();
  stamp(TEXT.miss, 'miss');
  audio.miss();
  music.onMiss();
  if (result.mistake !== 'range') recordMistake(result.mistake, CONFIG.MISTAKE_HISTORY);
  recordDuel(result, snap, null);
  showHint(TEXT.mistakes[result.mistake] || TEXT.mistakes.calc, A.MISS_MSG_MS);
  if (result.valid) showMessage(TEXT.missResult(formatP(result.after.P)), 'show', A.MISS_MSG_MS);
  run.onMiss(result);
  if (run.kind === 'dojo') music.setState({ chain: 0, fever: !!run.fever, superFever: !!(run.fever && run.fever.super) });
  else music.setState({ chain: 0 });
  updateHud();
  await wait(A.MISS_HOLD_MS);
  if (run.over && run.kind === 'exam') return; // 試験はハズレ1回で不合格
  clearStamps();
  renderState(board.state);
  await view.animateTo(num(board.state), A.MISS_BACK_MS);
  renderField();
  renderHand();
}

// ---------- 引き直し ----------
$('btn-reroll').addEventListener('click', () => {
  if (busy || paused || !run || run.over) return;
  if (!run.canReroll) {
    audio.deny();
    showMessage(TEXT.dailyNoReroll, 'show', CONFIG.ANIM.NOTICE_MS);
    return;
  }
  vibrate(CONFIG.VIBRATE_TAP_MS);
  audio.reroll();
  run.onReroll();
  updateHud();
  renderAll();
  view.set(num(board.state), toNumber(board.target));
  showMessage(board.ventilated ? TEXT.ventilated : TEXT.rerolled, 'show', CONFIG.ANIM.NOTICE_MS);
  if (run.over) endOfRun();
});

// ---------- 破裂（道場） ----------
let bursting = false;
async function doBurst() {
  if (bursting || !run) return;
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
  finishRun(true);
}

// ---------- モードの終わり：記録・経験値・パック・称号 → 結果画面 ----------
function finishRun(natural) {
  if (!run) return;
  stopLoop();
  stopSong();
  busy = false;
  const kind = run.kind;
  if (kind === 'practice') return goHome();
  const sum = run.summary();
  const rec = loadRecords();
  const prof = loadProfile();
  const col = loadCollection();
  const res = { kind, sum, natural, exp: 0, newBest: false, rankBefore: prof.rank, examPassed: false, packEarned: false };

  if (kind === 'dojo') {
    res.newBest = sum.score > rec.dojoBest && sum.score > 0;
    rec.dojoBest = Math.max(rec.dojoBest, sum.score);
    rec.dojoMaxChain = Math.max(rec.dojoMaxChain, sum.maxChain);
    rec.dojoPlays += 1;
    rec.totals.fevers += sum.fevers || 0;
    res.exp = dojoExp(sum);
    // 道場を1回終えるごとに1パック（ジャストが1回以上のとき）
    if (sum.justs >= CONFIG.PACK.MIN_JUSTS) { col.pending += 1; res.packEarned = true; }
  } else if (kind === 'ta') {
    res.newBest = sum.justs > rec.taBest && sum.justs > 0;
    rec.taBest = Math.max(rec.taBest, sum.justs);
    rec.taPlays += 1;
    res.exp = taExp(sum);
  } else if (kind === 'daily') {
    if (sum.cleared) {
      const old = rec.daily[sum.key];
      const better = !old || sum.cards < old.cards || (sum.cards === old.cards && sum.timeMs < old.timeMs);
      if (!old) rec.totals.dailyDays += 1;
      if (better) rec.daily[sum.key] = { cards: sum.cards, timeMs: Math.round(sum.timeMs), misses: sum.misses };
      res.newBest = better && !!old;
      res.exp = old ? 0 : dailyExp(sum); // 経験値は、その日の初めてのクリアだけ
    }
  } else if (kind === 'exam') {
    if (sum.passed) {
      prof.rank = Math.min(CONFIG.RANK.COUNT - 1, prof.rank + 1);
      res.examPassed = true;
    }
  }
  prof.exp += res.exp;
  res.rankAfter = prof.rank;
  saveRecords(rec);
  saveProfile(prof);
  saveCollection(col);
  res.titles = checkTitles();
  lastResult = res;
  setFeverLook(false, false);
  if (view) view.clearBurst();
  renderResult(res);
  show('screen-result');
  // 数字を数え上げる
  const el = $('result-score');
  const target = res.bigValue;
  if (typeof target === 'number') {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      el.textContent = fmtInt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if ((res.newBest || res.examPassed || (kind === 'daily' && sum.cleared)) && audio.ready) setTimeout(() => audio.fanfare(), 600);
  if (res.examPassed) setTimeout(() => fx.confetti(90, ['#FFFFFF', '#DCE7FD', '#2F6FED']), 300);
}

function renderResult(res) {
  const { kind, sum } = res;
  const prof = loadProfile();
  const rec = loadRecords();
  let title = '';
  let label = TEXT.scoreLabel;
  let big = '';
  let bestLine = '';
  let stats = [];
  res.bigValue = null;

  if (kind === 'dojo') {
    title = res.natural ? TEXT.resultTitle : TEXT.resultQuit;
    big = fmtInt(sum.score);
    res.bigValue = sum.score;
    bestLine = res.newBest ? TEXT.newBest : TEXT.best(fmtInt(rec.dojoBest));
    stats = [
      [TEXT.resMaxChain, sum.maxChain], [TEXT.resJusts, sum.justs], [TEXT.resStage, sum.stage],
      [TEXT.resSmart, sum.smarts], [TEXT.resSpeed, sum.speeds], [TEXT.resTime, TEXT.timeFmt(sum.timeMs)],
    ];
  } else if (kind === 'ta') {
    title = res.natural ? TEXT.taResultTitle : TEXT.resultQuit;
    label = TEXT.taCount;
    big = String(sum.justs);
    res.bigValue = sum.justs;
    bestLine = res.newBest ? TEXT.newBest : TEXT.best(rec.taBest);
    stats = [
      [TEXT.resMaxChain, sum.maxChain], [TEXT.resStage, sum.stage], [TEXT.resMisses, sum.misses],
      [TEXT.resSmart, sum.smarts], [TEXT.resSpeed, sum.speeds], [TEXT.resTime, TEXT.timeFmt(sum.timeMs)],
    ];
  } else if (kind === 'daily') {
    title = sum.cleared ? TEXT.dailyClear : TEXT.dailyQuit;
    label = TEXT.dailyCards;
    big = sum.cleared ? String(sum.cards) : `${sum.solved}/${CONFIG.DAILY.COUNT}`;
    const today = rec.daily[sum.key];
    bestLine = res.newBest ? TEXT.dailyBetter : today ? TEXT.dailyRecord(today.cards, TEXT.timeFmt(today.timeMs)) : TEXT.dailyNotYet;
    stats = [
      [TEXT.dailyTime, TEXT.timeFmt(sum.timeMs)], [TEXT.resMisses, sum.misses], [TEXT.dailyHud, `${sum.solved}/${CONFIG.DAILY.COUNT}`],
    ];
  } else if (kind === 'exam') {
    const name = TEXT.ranks[sum.targetRank];
    title = sum.passed ? TEXT.examPass : TEXT.examFail;
    label = TEXT.rankLabel;
    big = sum.passed ? name : `${sum.count}/${CONFIG.RANK.EXAM_JUSTS}`;
    bestLine = sum.passed ? TEXT.examPassDetail(name) : TEXT.examFailDetail(sum.count, CONFIG.RANK.EXAM_JUSTS);
    stats = [[TEXT.resTime, TEXT.timeFmt(sum.timeMs)]];
  }
  $('result-title').textContent = title;
  document.querySelector('#screen-result .result-label').textContent = label;
  $('result-score').textContent = big;
  $('result-score').classList.toggle('word', kind === 'exam' && sum.passed);
  const best = $('result-best');
  best.className = 'result-best' + (res.newBest || res.examPassed ? ' new' : '');
  best.textContent = bestLine;
  $('result-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('result-stats').style.gridTemplateColumns = stats.length < 3 ? `repeat(${stats.length}, 1fr)` : '';

  // 経験値と段位
  const showExp = kind !== 'exam';
  $('result-exp').hidden = !showExp;
  if (showExp) {
    $('result-exp-gain').textContent = TEXT.expGain(res.exp);
    $('result-rank').textContent = TEXT.ranks[prof.rank];
    const fill = $('result-rank-fill');
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = `${rankProgress(prof).ratio * 100}%`; });
    $('result-rank-note').textContent = examAvailable(prof) ? TEXT.examReady : '';
  }
  // 新しい称号
  $('result-titles').innerHTML = (res.titles || []).map((id) => `<div>${esc(TEXT.newTitle(TEXT.titleNames[id]))}</div>`).join('');

  // 考え違いの集計：本人にだけ見せる（1.3-5）
  const rows = Object.entries(sum.mistakes || {}).sort((a, b) => b[1] - a[1]);
  $('result-mistakes').innerHTML = rows.length
    ? rows.map(([id, n]) => `<div class="mistake-row"><b>${TEXT.mistakeNames[id] || id}<em>${TEXT.times(n)}</em></b><p>${TEXT.mistakes[id] || ''}</p></div>`).join('')
    : `<p class="mistake-none">${TEXT.noMistakes}</p>`;

  // ボタン
  const col = loadCollection();
  const packBtn = $('btn-open-pack');
  packBtn.hidden = !(col.pending > 0 && kind === 'dojo');
  packBtn.textContent = col.pending > 1 ? `${TEXT.openPack}（${col.pending}）` : TEXT.openPack;
  const retry = $('btn-retry');
  retry.hidden = kind === 'exam' && sum.passed;
  retry.textContent = kind === 'exam' ? TEXT.examRetry : TEXT.retry;
  retry.className = packBtn.hidden ? 'duel-btn' : 'sub-btn';
}

pressable($('btn-retry'), () => { if (lastResult) startRun(lastResult.kind); });
pressable($('btn-result-home'), () => goHome());
pressable($('btn-open-pack'), () => openPack('result'));

// ---------- カードパック ----------
let packReturn = 'result';
let packCards = [];
function openPack(from) {
  const col = loadCollection();
  if (col.pending <= 0) return;
  packReturn = from;
  col.pending -= 1;
  const ids = rollPack(createRng(randomSeed()));
  const fresh = ids.map((id) => !col.owned[id]);
  ids.forEach((id) => { col.owned[id] = (col.owned[id] || 0) + 1; });
  saveCollection(col);
  const rec = loadRecords();
  rec.totals.packs += 1;
  saveRecords(rec);
  packCards = ids.map((id, i) => ({ id, fresh: fresh[i], open: false }));
  stopSong();
  show('screen-pack');
  audio.packTear();
  const box = $('pack-cards');
  const backURL = artURL(col.back);
  box.innerHTML = '';
  packCards.forEach((pc, i) => {
    const art = ART_BY_ID[pc.id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pcard ${art.rarity}`;
    b.innerHTML = `<span class="rarity-pop">${esc(TEXT.rarity[art.rarity])}</span><span class="inner">`
      + `<span class="face back" style="${backURL ? `background-image:url(${backURL})` : ''}"></span>`
      + `<span class="face front" style="background-image:url(${artURL(pc.id)})">${pc.fresh ? `<span class="new">${TEXT.newCard}</span>` : ''}`
      + `<span class="tag">${esc(art[getLang()] || art.ja)}</span></span></span>`;
    b.addEventListener('click', () => flipPackCard(i));
    box.appendChild(b);
  });
  $('btn-pack-all').hidden = false;
  $('btn-pack-next').hidden = true;
  checkTitles();
}

function flipPackCard(i) {
  const pc = packCards[i];
  if (!pc || pc.open) return;
  pc.open = true;
  const el = $('pack-cards').children[i];
  el.classList.add('flipped');
  const rarity = ART_BY_ID[pc.id].rarity;
  audio.packFlip(rarity);
  vibrate(rarity === 'kimo' ? [30, 40, 60] : rarity === 'rare' ? [20, 30, 20] : 10);
  if (rarity === 'kimo') fx.confetti(50, ['#FFFFFF', '#DCE7FD']);
  if (packCards.every((p) => p.open)) {
    $('btn-pack-all').hidden = true;
    $('btn-pack-next').hidden = false;
    const col = loadCollection();
    $('btn-pack-next').textContent = col.pending > 0 ? `${TEXT.openPack}（${col.pending}）` : TEXT.packNext;
  }
}

$('btn-pack-all').addEventListener('click', () => {
  packCards.forEach((p, i) => setTimeout(() => flipPackCard(i), i * 260));
});
pressable($('btn-pack-next'), () => {
  if (loadCollection().pending > 0) return openPack(packReturn);
  if (packReturn === 'collection') { renderCollection(); show('screen-collection'); }
  else if (lastResult) { renderResult(lastResult); show('screen-result'); }
  else show('screen-title');
});

// ---------- 図鑑 ----------
let detailId = null;
function renderCollection() {
  const col = loadCollection();
  const ownedCount = ARTS.filter((a) => col.owned[a.id]).length;
  $('collection-count').textContent = TEXT.owned(ownedCount, ARTS.length);
  const op = $('btn-open-pending');
  op.hidden = !(col.pending > 0);
  op.textContent = `${TEXT.openPack}（${col.pending}）`;
  $('collection-grid').innerHTML = ARTS.map((a) => {
    const n = col.owned[a.id] || 0;
    if (!n) return `<button class="art-item unknown" type="button" disabled><span class="art-thumb">?</span><span class="art-name">${TEXT.unknownArt}</span></button>`;
    const use = col.back === a.id || col.bombe === a.id ? `<span class="art-use">${TEXT.inUse}</span>` : '';
    return `<button class="art-item ${a.rarity}" type="button" data-art="${a.id}"><span class="art-thumb" style="background-image:url(${artURL(a.id)})">${use}<span class="art-count">${TEXT.countCards(n)}</span></span><span class="art-name">${esc(a[getLang()] || a.ja)}</span></button>`;
  }).join('');
  $('collection-grid').querySelectorAll('[data-art]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.art)));
}
pressable($('btn-open-pending'), () => openPack('collection'));

function openDetail(id) {
  detailId = id;
  renderDetail();
  $('art-detail').hidden = false;
}
function renderDetail() {
  const a = ART_BY_ID[detailId];
  const col = loadCollection();
  $('art-big').style.backgroundImage = `url(${artURL(a.id)})`;
  $('art-name').textContent = a[getLang()] || a.ja;
  $('art-meta').innerHTML = `<span class="art-rarity ${a.rarity}">${TEXT.rarity[a.rarity]}</span> ${TEXT.countCards(col.owned[a.id] || 0)}`;
  const isBack = col.back === a.id;
  const isBombe = col.bombe === a.id;
  $('btn-set-back').textContent = isBack ? TEXT.removeBack : TEXT.setBack;
  $('btn-set-back').classList.toggle('on', isBack);
  $('btn-set-bombe').textContent = isBombe ? TEXT.removeBombe : TEXT.setBombe;
  $('btn-set-bombe').classList.toggle('on', isBombe);
}
$('btn-set-back').addEventListener('click', () => {
  const col = loadCollection();
  col.back = col.back === detailId ? null : detailId;
  saveCollection(col);
  audio.click();
  renderDetail();
  renderCollection();
});
$('btn-set-bombe').addEventListener('click', () => {
  const col = loadCollection();
  col.bombe = col.bombe === detailId ? null : detailId;
  saveCollection(col);
  audio.click();
  applySkins();
  renderDetail();
  renderCollection();
});
$('btn-art-close').addEventListener('click', () => { $('art-detail').hidden = true; });

// ---------- 記録：段位、自己ベスト、熟練度マップ、称号 ----------
function starsHTML(n, e) {
  if (!n) {
    const left = CONFIG.MASTERY.MIN_TRIES - (e ? e.n : 0);
    return `<span class="stars none">${e && e.n ? TEXT.masteryMore(left) : TEXT.masteryNone}</span>`;
  }
  return `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}
function masteryRow(name, e) {
  const st = masteryStars(e);
  const line = e && e.n ? TEXT.masteryLine(Math.round((e.ok / e.n) * 100), (e.ms / e.n / 1000).toFixed(1), e.n) : '';
  return `<div class="m-row"><div class="m-name"><b>${esc(name)}</b><small>${line}</small></div>${starsHTML(st, e)}</div>`;
}

function renderRecords() {
  const prof = loadProfile();
  const rec = loadRecords();
  const m = loadMastery();
  const have = loadTitles();
  const pr = rankProgress(prof);
  const canExam = examAvailable(prof);
  const nextName = TEXT.ranks[Math.min(prof.rank + 1, CONFIG.RANK.COUNT - 1)];
  const examStage = CONFIG.RANK.EXAM_STAGE[Math.min(prof.rank, CONFIG.RANK.EXAM_STAGE.length - 1)];
  const today = rec.daily[dateKey()];
  $('records-body').innerHTML = `
    <div class="box rank-box">
      <h3>${TEXT.rankLabel}</h3>
      <div class="rank-big"><b>${TEXT.ranks[prof.rank]}</b><span>${TEXT.expLabel} ${fmtInt(prof.exp)}</span></div>
      <i class="rank-bar"><i style="width:${pr.ratio * 100}%"></i></i>
      <p class="note">${pr.max ? TEXT.rankMax : TEXT.nextRank(fmtInt(pr.have), fmtInt(pr.need))}</p>
      ${canExam ? `<p class="rank-rule">${esc(TEXT.examRule(nextName, examStage, CONFIG.RANK.EXAM_JUSTS))}</p><button id="btn-exam" class="duel-btn" type="button">${TEXT.examTake}</button>` : ''}
    </div>
    <div class="box">
      <h3>${TEXT.bestsTitle}</h3>
      <div class="bests">
        <div><span>${TEXT.bestDojo}</span><b>${fmtInt(rec.dojoBest)}</b></div>
        <div><span>${TEXT.bestChain}</span><b>${rec.dojoMaxChain}</b></div>
        <div><span>${TEXT.bestTA}</span><b>${rec.taBest}</b></div>
        <div><span>${TEXT.bestDaily}</span><b>${today ? `${today.cards} · ${TEXT.timeFmt(today.timeMs)}` : '—'}</b></div>
      </div>
    </div>
    <div class="box">
      <h3>${TEXT.masteryTitle}</h3>
      <p class="note" style="margin:0 0 4px">${TEXT.masteryCards}</p>
      ${MASTERY_CARDS.map((t) => masteryRow(TEXT.cardNames[t], m.cards[t])).join('')}
      <p class="note" style="margin:10px 0 4px">${TEXT.masteryTraps}</p>
      ${CONFIG.MISTAKE_MODELS.map((t) => masteryRow(TEXT.mistakeNames[t], m.traps[t])).join('')}
      <p class="note">${TEXT.masteryNote}</p>
    </div>
    <div class="box">
      <h3>${TEXT.titlesTitle}（${Object.keys(have).filter((id) => TEXT.titleNames[id]).length}/${TITLES.length}）</h3>
      <div class="titles-list">
        ${TITLES.map((t) => `<div class="title-chip${have[t.id] ? ' on' : ''}"><b>${esc(TEXT.titleNames[t.id])}</b><small>${esc(TEXT.titleConds[t.id])}</small></div>`).join('')}
      </div>
    </div>`;
  const eb = $('btn-exam');
  if (eb) pressable(eb, () => startRun('exam'));
}

// ---------- 起動 ----------
applySkins();
applyTexts();
show('screen-title');
window.__srdReady = true; // 読み込みに成功した印（index.html のお知らせを出さない）

// 動作確認用（URL に ?debug を付けたときだけ）
if (new URLSearchParams(location.search).has('debug')) {
  window.__srd = {
    get board() { return board; },
    get run() { return run; },
    get dojo() { return run && run.kind === 'dojo' ? run : null; },
    get audio() { return audio; },
    get music() { return music; },
    startGame: (n) => startRun('practice', { stage: n }),
    startDojo: () => startRun('dojo'),
    startRun,
  };
}
