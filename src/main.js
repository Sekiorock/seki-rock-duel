// 全体の進行（画面の切り替え）と、盤面の表示・タッチ操作。
// 練習室・道場・タイムアタック・今日の5問・昇段試験は、同じプレイ画面を使う（run.kind で切り替える）。

import { CONFIG } from './config.js?v=1.0.0';
import { TEXT, formatP, formatV, formatT, formatMol, setLang, getLang, LANGS } from './text.js?v=1.0.0';
import { toNumber } from './frac.js?v=1.0.0';
import { createRng, randomSeed } from './rng.js?v=1.0.0';
import { cardLines, isTempCard, isMix, measure } from './cards.js?v=1.0.0';
import { trapModelsInHand } from './puzzle.js?v=1.0.0';
import {
  Dojo, PracticeRun, TimeAttack, DailyRun, ExamRun, StoryDuel, FinalRun, finalGrade, chapterOf, dateKey, makeKantei, makeZQuiz,
  rankProgress, examAvailable, dojoExp, taExp, dailyExp, rollPack, earnedTitles, TITLES,
  addMastery, masteryStars, MASTERY_CARDS,
} from './solo.js?v=1.0.0';
import { Calculator } from './calc.js?v=1.0.0';
import { connect, netReady, useMock } from './net.js?v=1.0.0';
import { Room, LiveRun, NAME_MAX } from './live.js?v=1.0.0';
import qrcode from './vendor/qrcode.js?v=1.0.0';
import { BattleRun } from './battle.js?v=1.0.0';
import { BombeView, FxLayer, drawZGraph } from './render.js?v=1.0.0';
import { AudioEngine } from './audio.js?v=1.0.0';
import { Music } from './music.js?v=1.0.0';
import { ARTS, ART_BY_ID, artURL, drawChar } from './chars.js?v=1.0.0';
import { STORY_TEXT } from './story_text.js?v=1.0.0';
import {
  migrate, loadSettings, saveSettings, recordMistake, favoriteMistake,
  loadRecords, saveRecords, loadProfile, saveProfile, loadCollection, saveCollection,
  loadTitles, saveTitles, loadMastery, saveMastery, loadStory, saveStory,
} from './storage.js?v=1.0.0';

const $ = (id) => document.getElementById(id);
let calc = null; // 電卓（v1.0。下の「電卓」で作る）
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 対応していない端末 */ } };
const num = (s) => {
  const o = { P: toNumber(s.P), V: toNumber(s.V), T: toNumber(s.T), N: s.N ? toNumber(s.N) : CONFIG.START_STATE.N };
  if (s.A) { o.A = toNumber(s.A); o.B = toNumber(s.B); } // 混合気体（v0.7〜）
  return o;
};
// 圧力計の目標の印は、全圧が目標のときだけ（分圧が目標のときは、分圧の帯に印を出す）
const gaugeTarget = () => (board.goal === 'P' ? toNumber(board.target) : null);
function setTargetText() {
  $('target-text').textContent = targetStr();
  $('target-text').classList.toggle('part', board.goal !== 'P'); // 分圧の目標は文が長いので少し小さく
}
// 目標カードの文
const targetStr = () => (board.goal === 'P'
  ? TEXT.targetText(formatP(board.target))
  : TEXT.targetPart(TEXT.gasShort[board.goal], formatP(board.target)));
// 章の名前（隠し章は「隠し章」）
const chName = (id) => (chapterOf(id) && chapterOf(id).hidden ? TEXT.hiddenChapter : TEXT.chapterN(id));
// 対戦の形（CPU戦とみんなで対戦）は、同じ画面の作りを使う
const battleLike = () => !!run && (run.kind === 'battle' || run.kind === 'live');
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
  document.querySelectorAll('[data-calc-toggle]').forEach((b) => b.setAttribute('aria-label', TEXT.calc));
  if (calc) calc.render();
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
    if (run.kind === 'story') { // 相手の名前も切り替える
      $('vs-name').textContent = TEXT.charNames[run.ch.char];
      $('vs-bar').classList.toggle('long-name', [...TEXT.charNames[run.ch.char]].length > 6);
    }
    renderTargetLabel();
    updateHud();
    setTargetText();
    if (!busy) {
      hideMessage();
      hideHint();
      renderAll();
    }
  }
  if (!$('screen-result').hidden && lastResult) renderResult(lastResult);
  if (!$('screen-records').hidden) renderRecords();
  if (!$('screen-battle').hidden) renderBattleSetup();
  if (battleLike() && !$('screen-play').hidden) { buildBattleUI(true); renderBattleLive(); }
  if (!$('screen-live').hidden) renderLiveForm();
  if (!$('screen-room').hidden && room) renderRoom(room.data);
  if (!$('screen-collection').hidden) renderCollection();
  if (!$('screen-story').hidden) renderStoryMap();
  if (!$('screen-select').hidden) renderSelect();
  if (!$('screen-talk').hidden && talk) { renderTalkTitle(); renderPanel(); }
  if (!$('screen-quiz').hidden && quiz) renderQuestion(true);
  if (!$('screen-pack').hidden) renderPackTags();
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
  // 電卓のボタンがない画面では、電卓の小窓を閉じる
  if (calc && calc.isOpen && !['screen-play', 'screen-quiz', 'screen-talk'].includes(id)) calc.close();
  if (id === 'screen-title') { titleBombe.resize(); renderTitleScreen(); }
  if (id !== 'screen-play') setDangerLook(0);
  if (fx && id !== 'screen-result' && id !== 'screen-play') fx.clear(); // 結果画面の紙吹雪を次の画面に持ち越さない
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
  // ボンベの顔（仲間にしたキャラクターだけ）
  const prof = loadProfile();
  const face = loadStory().friends.includes(prof.char) ? prof.char : null;
  titleBombe.setFace(face);
  if (view) view.setFace(face);
}

// キャラクターを canvas に描く（小さな絵に使う）
function paintChar(canvas, id, expr = 'normal') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = r.width || canvas.width;
  const h = r.height || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (id) drawChar(ctx, id, expr, w / 2, h / 2 + h * 0.04, h * 0.86, 0);
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
  // タイムアタックは道場で1回遊ぶと解放（5.1）。今日の5問は、道場1回 または ストーリー2章クリアで解放
  const unlocked = r.dojoPlays >= 1;
  const dailyOpen = dailyUnlocked();
  $('btn-ta').classList.toggle('locked', !unlocked);
  $('btn-daily').classList.toggle('locked', !dailyOpen);
  $('btn-ta').querySelector('small').textContent = unlocked ? TEXT.taDesc : TEXT.locked;
  const today = r.daily[dateKey()];
  $('daily-sub').textContent = !dailyOpen ? TEXT.locked
    : today ? TEXT.dailyRecord(today.cards, TEXT.timeFmt(today.timeMs)) : TEXT.dailyDesc;
  const st = loadStory();
  // 本編の章の数（隠し章は数えない）
  const mainChs = CONFIG.STORY.CHAPTERS.filter((c) => !c.hidden);
  const cleared = mainChs.filter((c) => st.cleared[c.id]).length;
  $('story-sub').textContent = cleared ? `${TEXT.chapterCleared} ${cleared}/${mainChs.length}` : TEXT.storyDesc;
  const bOpen = battleUnlocked();
  $('btn-battle').classList.toggle('locked', !bOpen);
  $('battle-sub').textContent = !bOpen ? TEXT.battleLocked
    : r.battlePlays ? TEXT.battleBest(r.battleWins, r.battleBestRank) : TEXT.battleDesc;
  $('pack-badge').hidden = !(col.pending > 0);
  $('pack-badge').textContent = String(col.pending);
  $('collection-sub').textContent = col.pending > 0 ? TEXT.packsWaiting(col.pending) : TEXT.collectionDesc;
}

pressable($('btn-dojo'), () => startRun('dojo'));
pressable($('btn-ta'), () => { if (loadRecords().dojoPlays >= 1) startRun('ta'); else toast(TEXT.locked); });
pressable($('btn-daily'), () => { if (dailyUnlocked()) startRun('daily'); else toast(TEXT.locked); });
pressable($('btn-story'), () => { renderStoryMap(); show('screen-story'); });
function dailyUnlocked() {
  return loadRecords().dojoPlays >= 1 || !!loadStory().cleared[2];
}
pressable($('btn-practice'), () => { renderSelect(); show('screen-select'); });
// 練習室の「分子量の鑑定」は、ストーリー5章をクリアすると開く
function renderSelect() {
  const st = loadStory();
  const open = !!st.cleared[5];
  $('btn-kantei').classList.toggle('locked', !open);
  $('kantei-sub').textContent = open ? TEXT.kanteiDesc : TEXT.kanteiLocked;
  // 実在気体の Z 判定は7章、℉カードの段階は隠し章をクリアすると出てくる（v0.8）
  const zOpen = !!st.cleared[7];
  $('btn-zlab').classList.toggle('locked', !zOpen);
  $('zlab-sub').textContent = zOpen ? TEXT.zLabDesc : TEXT.zLabLocked;
  const hb = document.querySelector(`#stage-grid [data-stage="${CONFIG.HIDDEN_STAGE}"]`);
  if (hb) hb.hidden = !st.cleared[8];
}
pressable($('btn-collection'), () => { renderCollection(); show('screen-collection'); });
pressable($('btn-records'), () => { renderRecords(); show('screen-records'); });
pressable($('rank-chip'), () => { renderRecords(); show('screen-records'); });
pressable($('btn-exam-ready'), () => { renderRecords(); show('screen-records'); });
document.querySelectorAll('[data-go-home]').forEach((b) => b.addEventListener('click', () => show('screen-title')));

// ---------- 電卓（v1.0） ----------
// 暗算が苦手な生徒のために、プレイ画面・確認問題・解説の右上に電卓のボタンを置く。小窓はドラッグで動かせる
calc = new Calculator($('calc'), {
  text: () => TEXT,
  onKey: () => { try { audio.click(); } catch (e) { /* 音が出ない端末 */ } },
  onChange: (open) => document.querySelectorAll('[data-calc-toggle]').forEach((x) => x.setAttribute('aria-pressed', String(open))),
});
document.querySelectorAll('[data-calc-toggle]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation();
  calc.toggle($('screen-play').hidden ? 'bottom' : 'top');
}));

// ---------- 友だちにすすめる：QRコード（v0.9） ----------
// QR の画像（assets/qr.svg）は公開先の URL（CONFIG.SHARE_URL）を表している
pressable($('btn-qr'), () => {
  $('qr-url').textContent = CONFIG.SHARE_URL;
  $('qr-overlay').hidden = false;
  audio.click();
});
$('btn-qr-close').addEventListener('click', () => { $('qr-overlay').hidden = true; });
$('qr-overlay').addEventListener('click', (e) => { if (e.target === $('qr-overlay')) $('qr-overlay').hidden = true; });
$('btn-qr-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(CONFIG.SHARE_URL);
    toast(TEXT.qrCopied);
  } catch (e) {
    toast(TEXT.qrCopyFail); // コピーできない端末では、URLを長押しで選んでもらう
  }
});

// ---------- 練習室：段階の選択 ----------
function renderAssist() {
  $('btn-assist-on').setAttribute('aria-checked', String(settings.assist));
  $('btn-assist-off').setAttribute('aria-checked', String(!settings.assist));
}
$('btn-assist-on').addEventListener('click', () => { settings.assist = true; saveSettings(settings); renderAssist(); });
$('btn-assist-off').addEventListener('click', () => { settings.assist = false; saveSettings(settings); renderAssist(); });
renderAssist();
$('btn-select-back').addEventListener('click', () => show('screen-title'));

for (const n of [...CONFIG.AVAILABLE_STAGES, CONFIG.HIDDEN_STAGE]) {
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
let oppExpr = 'normal';
let oppExprTimer = null;
function setOppExpr(expr, ms = 1400) {
  if (!run || run.kind !== 'story') return;
  oppExpr = expr;
  paintChar($('vs-face'), run.ch.char, expr);
  clearTimeout(oppExprTimer);
  if (ms) oppExprTimer = setTimeout(() => { if (run && run.kind === 'story') paintChar($('vs-face'), run.ch.char, 'normal'); }, ms);
}

const prefer = () => favoriteMistake(CONFIG.MISTAKE_MODELS);
const SONG_OF = { practice: 'practice', dojo: 'dojo', ta: 'battle', daily: 'practice', exam: 'battle', story: 'battle', final: 'battle', battle: 'battle' };

function startRun(kind, opts = {}) {
  const rng = createRng(randomSeed());
  if (kind === 'dojo') run = new Dojo({ rng, preferModel: prefer });
  else if (kind === 'ta') run = new TimeAttack({ rng, preferModel: prefer });
  else if (kind === 'daily') run = new DailyRun({ key: dateKey() });
  else if (kind === 'exam') run = new ExamRun({ rank: loadProfile().rank, rng });
  else if (kind === 'final') run = new FinalRun({ rng });
  else if (kind === 'live') run = new LiveRun({ room, seed: room.data.seed });
  else if (kind === 'battle') {
    const o = battleOpt();
    run = new BattleRun({ opponents: o.opp, level: o.level, cards: o.cards, rng, me: { char: loadProfile().char } });
  }
  else if (kind === 'story') run = new StoryDuel({ chapter: opts.chapter, rng, losses: loadStory().losses[opts.chapter] || 0 });
  else run = new PracticeRun({ stage: opts.stage || 1, rng, preferModel: prefer });
  board = run.board;
  enterPlay();
  playSong(SONG_OF[kind]);
  if (kind === 'battle') return battleCountdown();
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
  applySkins();
  view.setExpr('normal');
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
  view.set(num(board.state), gaugeTarget());
  targetWall = performance.now();
  showMessage(run.kind === 'exam' ? TEXT.examRule(TEXT.ranks[run.targetRank], run.stage, CONFIG.RANK.EXAM_JUSTS)
    : run.kind === 'story' ? TEXT.duelRule(run.need) : run.kind === 'final' ? TEXT.finalRule
      : run.kind === 'battle' ? TEXT.battleRule : run.kind === 'live' ? TEXT.liveRule : TEXT.handHint, 'soft');
  scr.classList.remove('cooling');
  scr.classList.toggle('live', run.kind === 'live');
  if (run.kind === 'live') scr.dataset.mode = 'battle'; // 画面の作りは CPU 戦と同じ
  if (battleLike()) buildBattleUI();
  // ストーリー：相手の顔と進み具合
  $('vs-bar').hidden = run.kind !== 'story';
  if (run.kind === 'story') {
    $('vs-name').textContent = TEXT.charNames[run.ch.char];
    $('vs-bar').classList.toggle('long-name', [...TEXT.charNames[run.ch.char]].length > 6);
    oppExpr = 'normal';
    requestAnimationFrame(() => paintChar($('vs-face'), run.ch.char, 'normal'));
  }
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
  if (!run || (paused && run.kind !== 'live')) return; // みんなで対戦は止められない（ほかの人は進んでいる）
  if (run.over) {
    if (!busy) endOfRun();
    return;
  }
  const events = run.tick(dt);
  if (battleLike()) { onBattleEvents(run.drain()); renderBattleLive(); }
  if (events.includes('chain_lost') && run.kind === 'dojo') {
    audio.chainLost();
    showMessage(TEXT.chainLost, 'show', CONFIG.ANIM.NOTICE_MS);
    music.setState({ chain: 0, fever: !!run.fever, superFever: !!(run.fever && run.fever.super) });
  }
  if (events.includes('fever_end')) {
    setFeverLook(false, false);
    music.setState({ chain: run.vitals.chain });
  }
  if (run.kind === 'story') {
    const name = TEXT.charNames[run.ch.char];
    if (events.includes('bot_just')) {
      setOppExpr('smug');
      audio.deny();
      replay($('vs-opp-n'), 'bump');
      if (!busy) showMessage(TEXT.oppJust(name), 'show', 1500);
    }
    if (events.includes('bot_miss')) {
      setOppExpr('sweat');
      if (!busy) showMessage(TEXT.oppMiss(name), 'show', 1500);
    }
    if (run.trickDue && !busy) useTrick();
  }
  updateHud();
  if (run.over && !busy) endOfRun();
}

// モードが終わったとき（破裂、時間切れ、5問クリア、試験の合否）
function endOfRun() {
  if (!run) return;
  if (run.kind === 'dojo' || (run.kind === 'story' && run.vitals.isBurst())) doBurst();
  else finishRun(true);
}

// ストーリーの相手の技（おじゃまカード・目標の書き換え）
function useTrick() {
  const r = run.applyTrick();
  if (!r) return;
  setOppExpr('smug');
  audio.feverStart(false);
  renderAll();
  view.set(num(board.state), gaugeTarget());
  if (r.type === 'swap_target') { replay(document.querySelector('.target-card'), 'pop'); targetWall = performance.now(); }
  const msg = TEXT.trickMsg[r.type](TEXT.charNames[run.ch.char]);
  showBanner(msg);
  const note = r.type === 'frost' ? TEXT.frostHint
    : r.type === 'real_gas' ? TEXT.zCardHint
    : r.type === 'leak' ? (r.dir === 'in' ? TEXT.leakIn : TEXT.leakOut)
      : r.type === 'mix_in' ? TEXT.mixInNote(TEXT.gasShort[r.gas]) : msg;
  showMessage(note, 'show', CONFIG.ANIM.NOTICE_MS);
  if (r.type === 'leak' || r.type === 'mix_in') { replay(document.querySelector('.target-card'), 'pop'); targetWall = performance.now(); }
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
  } else if (k === 'story') {
    const v = run.vitals;
    $('hud-a-label').textContent = TEXT.stageLabel;
    $('hud-a').textContent = String(board.stage);
    $('hud-b-label').textContent = TEXT.chainLabel;
    $('hud-b').textContent = String(v.chain);
    $('danger-fill').style.height = `${v.meter}%`;
    $('danger-num').textContent = String(Math.round(v.meter));
    $('danger').classList.toggle('warn', v.meter >= CONFIG.DOJO.WARN_AT);
    setDangerLook(v.meter);
    view.setDanger(v.meter);
    music.setHeartbeat(v.meter >= CONFIG.DOJO.WARN_AT);
    $('vs-opp').style.width = `${(run.bot.justs / run.need) * 100}%`;
    $('vs-me').style.width = `${(run.justs / run.need) * 100}%`;
    $('vs-opp-n').textContent = String(run.bot.justs);
    $('vs-me-n').textContent = String(run.justs);
  } else if (k === 'battle' || k === 'live') {
    const me = run.me;
    $('hud-a-label').textContent = TEXT.aliveLabel;
    $('hud-a').textContent = `${run.aliveCount}/${run.total}`;
    $('hud-b-label').textContent = TEXT.valveLabel;
    $('hud-b').textContent = String(me.valves);
    const m = me.alive ? me.meter : 0;
    $('danger-fill').style.height = `${m}%`;
    $('danger-num').textContent = String(Math.round(m));
    $('danger').classList.toggle('warn', m >= CONFIG.DOJO.WARN_AT);
    setDangerLook(m);
    view.setDanger(m);
    music.setHeartbeat(me.alive && m >= CONFIG.DOJO.WARN_AT);
  } else if (k === 'final') {
    $('hud-a-label').textContent = TEXT.finalHud;
    $('hud-a').textContent = `${Math.min(run.index + 1, run.total)}/${run.total}`;
    $('hud-b-label').textContent = TEXT.finalPoints;
    $('hud-b').textContent = String(run.points);
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
  if (run.kind === 'live' && run.me.alive) { run.me.alive = false; run.room.updateMe({ alive: false, meter: 100 }); } // 抜けたら破裂扱い
  run.over = true;
  finishRun(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (run && run.kind !== 'practice' && run.kind !== 'live' && !run.over) pause();
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
  else if (k === 'story') t = `${chName(run.ch.id)} · ${TEXT.targetStage(board.stage)}`;
  else if (k === 'battle' || k === 'live') t = `${k === 'live' ? TEXT.live : TEXT.battle} · ${TEXT.targetStage(board.stage)}`;
  else if (k === 'final') t = TEXT.finalStage(board.stage, Math.min(run.index + 1, run.total), run.total);
  else if (settings.assist) t = `${TEXT.targetLabel} · ${TEXT.assistOn}`;
  $('target-label').textContent = t;
}

function renderAll() {
  $('stage-num').textContent = String(board.stage);
  $('just-count').textContent = String(board.justCount);
  renderTargetLabel();
  setTargetText();
  renderState(board.state);
  renderField();
  renderHand();
}

function renderState(s) {
  // 物質量カードがある段階（7）だけ、物質量 n = pV/(RT) も表示する
  const mixed = isMix(s);
  const showN = board && board.stage === 7 && !mixed;
  $('state-text').innerHTML =
    `<span><i>P</i>${formatP(s.P)}</span><span><i>V</i>${formatV(s.V)}</span><span><i>T</i>${formatT(s.T)}</span>`
    + (showN ? `<span><i>n</i>${formatMol(s)}</span>` : '')
    + (mixed ? mixBarHTML(s) : '');
  $('state-text').classList.toggle('with-n', !!showN);
  $('state-text').classList.toggle('with-mix', mixed);
}

// 分圧の帯（v0.7〜）：帯の長さは全圧、区切りは物質量の比（= 分圧の比）。全圧 = 分圧の和が見える
// 分圧が目標のときは、その気体を左に置き、目標の位置に印をつける
function mixBarHTML(s) {
  const P = toNumber(s.P);
  const N = toNumber(s.A) + toNumber(s.B);
  const pa = P * toNumber(s.A) / N;
  const pb = P * toNumber(s.B) / N;
  const goal = board ? board.goal : 'P';
  const tgt = board ? toNumber(board.target) : 0;
  const scale = [30, 60, 90].find((x) => x >= Math.max(P, tgt) * 1.05) || 90;
  const seg = (g, v) => `<i class="seg ${g.toLowerCase()}" style="width:${(v / scale * 100).toFixed(2)}%"></i>`;
  const order = goal === 'B' ? [['B', pb], ['A', pa]] : [['A', pa], ['B', pb]];
  const mark = `<em class="goal-mark" style="left:${(tgt / scale * 100).toFixed(2)}%"></em>`;
  const pf = (v) => formatP(fracOf(v));
  const leg = (g, v, amt) => `<span class="lg ${g.toLowerCase()}${goal === g ? ' is-goal' : ''}"><b>${TEXT.gasShort[g]}</b>${TEXT.partLabel}${pf(v)}<small>${TEXT.amountLabel}${fmtAmt(amt)}</small></span>`;
  return `<div class="mixbar"><div class="mix-track${goal === 'P' ? ' goal-total' : ''}">${order.map(([g, v]) => seg(g, v)).join('')}${board ? mark : ''}</div>`
    + `<div class="mix-legend">${leg('A', pa, s.A)}${leg('B', pb, s.B)}</div></div>`;
}
const fmtAmt = (x) => { const v = toNumber(x); return Number.isInteger(v) ? String(v) : v.toFixed(1); };
// 表示用：数を分数に直す（分母は小さいものだけ）
function fracOf(v) {
  for (let d = 1; d <= 60; d++) { const n = Math.round(v * d); if (Math.abs(n / d - v) < 1e-9) return { n, d }; }
  return { n: Math.round(v * 100), d: 100 };
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
  // 長い文（相手の技など）は、小さめの文字で折り返す
  b.className = 'banner' + (big ? ' big' : '') + ([...text].length > 12 ? ' long' : '');
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
  const pv = board.goal === 'P' ? TEXT.preview(formatP(r.state.P)) : TEXT.previewPart(TEXT.gasShort[board.goal], formatP(measure(r.state, board.goal)));
  showMessage(r.valid ? pv : TEXT.previewInvalid, 'preview');
}

// ---------- カードの見た目 ----------
const ICONS = {
  // 体積カード：ピストン
  vmul: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="14" height="11" rx="2" fill="none" stroke="#121212" stroke-width="2"/><rect x="4.5" y="9" width="11" height="3" fill="#FE2C55"/><path d="M10 9V2M6 2h8" stroke="#121212" stroke-width="2" stroke-linecap="round"/></svg>',
  // 体積指定カード：ピストンと目印
  vset: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="7" width="14" height="11" rx="2" fill="none" stroke="#121212" stroke-width="2"/><rect x="4.5" y="9" width="11" height="3" fill="#FE2C55"/><path d="M10 9V3" stroke="#121212" stroke-width="2" stroke-linecap="round"/><path d="M1 10.5h2M17 10.5h2" stroke="#FE2C55" stroke-width="2"/></svg>',
  // 温度カード（K）：温度計
  tset_k: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#fff" stroke="#121212" stroke-width="2"/><circle cx="10" cy="15" r="2.2" fill="#FE2C55"/><path d="M10 13V7" stroke="#FE2C55" stroke-width="2"/><path d="M13 5h2M13 8h2M13 11h2" stroke="#121212" stroke-width="1.5"/></svg>',
  // 物質量カード：粒の集まり
  nmul: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="7" r="3" fill="#FE2C55" stroke="#121212" stroke-width="1.5"/><circle cx="13" cy="6" r="3" fill="#D4FAF8" stroke="#121212" stroke-width="1.5"/><circle cx="9" cy="13" r="3" fill="#FE2C55" stroke="#121212" stroke-width="1.5"/><circle cx="15.5" cy="13.5" r="2.5" fill="#fff" stroke="#121212" stroke-width="1.5"/></svg>',
  // 温度カード（℉）：目盛りが2列ある温度計
  tset_f: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#fff" stroke="#121212" stroke-width="2"/><circle cx="10" cy="15" r="2.2" fill="#FE2C55"/><path d="M10 13V7" stroke="#FE2C55" stroke-width="2"/><path d="M13 4h2M13 7h2M13 10h2M3 5h2M3 9h2" stroke="#121212" stroke-width="1.5"/></svg>',
  // 混ぜるカード：別の気体の粒が入ってくる
  add: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6v11h14V6" fill="none" stroke="#121212" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="13" r="2.2" fill="#121212"/><circle cx="13" cy="12.5" r="2.2" fill="#fff" stroke="#FE2C55" stroke-width="1.8"/><path d="M10 1.5v6M7.5 5l2.5 2.5L12.5 5" fill="none" stroke="#FE2C55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 温度カード（℃）：目盛りが途中でずれた温度計（セルシウスの罠の目印）
  tset_c: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#fff" stroke="#121212" stroke-width="2"/><circle cx="10" cy="15" r="2.2" fill="#FE2C55"/><path d="M10 13V7" stroke="#FE2C55" stroke-width="2"/><path d="M13 4h2M13 7h2M14 9.5h3M14 12h3" stroke="#121212" stroke-width="1.5"/></svg>',
};

function cardHTML(card) {
  const l = cardLines(card);
  const top = l.top.replace(/^([VT])/, '<span class="v">$1</span>');
  const long = l.bottom.length >= 6 ? ' long' : ''; // 「−123℃」のような長い表記は少し小さく
  return `${ICONS[card.type] || ''}<span class="label"><span class="top">${top}</span><span class="bottom${long}">${l.bottom}</span></span><span class="foot"></span>`;
}

function makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card' + (isTempCard(card) ? ' temp' : '') + (card.type === 'frost' ? ' frost-card' + (card.skin === 'z' ? ' z-card' : '') : '')
    + (card.type === 'add' ? ` mix-card gas-${card.gas.toLowerCase()}` : '');
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
    } else if (res === 'frost') {
      audio.deny();
      showMessage(board.hand[idx] && board.hand[idx].skin === 'z' ? TEXT.zCardHint : TEXT.frostHint, 'show', CONFIG.ANIM.NOTICE_MS);
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
    traps: trapModelsInHand(board.state, board.hand, board.target, board.goal),
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
  else if (run && run.kind === 'story' && run.trickDue) useTrick();
});

async function onJustShown(result, pressAt, snap) {
  const A = CONFIG.ANIM;
  const kind = run.kind;
  // 2) 針が目標でピタッと止まる → 3) JUST! → 4) 光の輪
  const info = run.onJust(result, pressAt);
  recordDuel(result, snap, info);
  stamp(TEXT.just, '');
  view.ring();
  view.setExpr('smug', 1300);
  if (kind === 'story') setOppExpr('sweat');
  audio.just(info.chain, info);
  vibrate(CONFIG.VIBRATE_JUST);
  flash(!settings.muted);
  if (info.smart && kind !== 'daily' && kind !== 'final') setTimeout(() => stamp(TEXT.smart, 's2'), A.STAMP_STACK_MS);
  if (info.speed) setTimeout(() => stamp(TEXT.speed, info.smart ? 's3' : 's2'), A.STAMP_STACK_MS * 2);

  if (kind === 'battle' || kind === 'live') afterBattleJust(info);
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
      fx.cheer(loadStory().friends); // 仲間のキャラクターが応援に飛び込む
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
    if (info.chain >= 2 && kind !== 'daily' && kind !== 'exam' && kind !== 'final' && kind !== 'battle') showBanner(TEXT.chainPop(info.chain));
    music.setState({ chain: info.chain });
    if (kind === 'practice') replay($('just-count'), 'bump');
    if (kind === 'ta') replay($('hud-b'), 'bump');
    if (kind === 'exam' || kind === 'daily' || kind === 'final') replay($('hud-a'), 'bump');
  }
  updateHud();
  await wait(A.STAMP_MS);
  if (run.over) return; // 5問クリア・試験合格：結果画面へ

  // 5) 次の目標カード
  clearStamps();
  renderAll();
  view.set(num(board.state), gaugeTarget());
  targetWall = performance.now();
  replay(document.querySelector('.target-card'), 'pop');
  if (board.ventilated) showMessage(isMix(board.state) ? TEXT.refilled : TEXT.ventilated, 'show', A.NOTICE_MS);
  else if (info.stageUp) showMessage(TEXT.stageUp(board.stage), 'show', A.NOTICE_MS);
}

async function onMissShown(result, snap) {
  const A = CONFIG.ANIM;
  // ハズレ：ボンベがよろけ、考え違いの一言を目標カードの下に出す。カードは手札へ、ボンベは元へ
  view.shake();
  view.setExpr('sweat', 1600);
  if (run.kind === 'story') setOppExpr('smug');
  stamp(TEXT.miss, 'miss');
  audio.miss();
  music.onMiss();
  if (result.mistake !== 'range') recordMistake(result.mistake, CONFIG.MISTAKE_HISTORY);
  recordDuel(result, snap, null);
  showHint(TEXT.mistakes[result.mistake] || TEXT.mistakes.calc, A.MISS_MSG_MS);
  if (result.valid) showMessage(TEXT.missResult(board.goal === 'P' ? formatP(result.after.P) : `${TEXT.gasShort[board.goal]} ${formatP(result.measured)}`), 'show', A.MISS_MSG_MS);
  run.onMiss(result);
  if (run.kind === 'dojo') music.setState({ chain: 0, fever: !!run.fever, superFever: !!(run.fever && run.fever.super) });
  else music.setState({ chain: 0 });
  updateHud();
  await wait(A.MISS_HOLD_MS);
  if (run.over && (run.kind === 'exam' || run.kind === 'story')) return; // 試験はハズレ1回で不合格、ストーリーは破裂で負け
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
    showMessage(run.kind === 'final' ? TEXT.finalNoReroll : TEXT.dailyNoReroll, 'show', CONFIG.ANIM.NOTICE_MS);
    return;
  }
  vibrate(CONFIG.VIBRATE_TAP_MS);
  audio.reroll();
  run.onReroll();
  updateHud();
  renderAll();
  view.set(num(board.state), gaugeTarget());
  showMessage(board.ventilated ? (isMix(board.state) ? TEXT.refilled : TEXT.ventilated) : TEXT.rerolled, 'show', CONFIG.ANIM.NOTICE_MS);
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
  // みんなで対戦：順位・経験値・パック（試合後に1つ）
  if (kind === 'live') {
    const B = CONFIG.BATTLE;
    if (natural) {
      rec.livePlays = (rec.livePlays || 0) + 1;
      if (sum.won) rec.liveWins = (rec.liveWins || 0) + 1;
      res.exp = sum.justs * B.EXP_PER_JUST + (sum.total - sum.rank) * B.EXP_PER_RANK + (sum.won ? B.EXP_WIN : 0);
      col.pending += 1;
      res.packEarned = true;
    } else res.battleQuit = true;
  }
  // ひとり対戦：順位・優勝・経験値・パック（試合後に1つ）
  if (kind === 'battle') {
    const B = CONFIG.BATTLE;
    if (natural) {
      rec.battlePlays += 1;
      if (sum.won) rec.battleWins += 1;
      rec.battleBestRank = rec.battleBestRank ? Math.min(rec.battleBestRank, sum.rank) : sum.rank;
      rec.totals.coolGasMaxInMatch = Math.max(rec.totals.coolGasMaxInMatch || 0, sum.coolSent);
      res.exp = sum.justs * B.EXP_PER_JUST + (sum.total - sum.rank) * B.EXP_PER_RANK + (sum.won ? B.EXP_WIN : 0);
      col.pending += 1;
      res.packEarned = true;
    } else res.battleQuit = true;
  }
  // 総まとめ試験：デュエル10問が終わったら、確認問題10問へ。点数はそのあとでまとめる
  if (kind === 'final') {
    saveRecords(rec);
    lastResult = res;
    setFeverLook(false, false);
    if (!sum.cleared) { res.finalQuit = true; showResultScreen(res); return; }
    toast(TEXT.finalQuizIntro);
    startQuiz(null, (q) => finishFinal(res, q), { final: true });
    return;
  }
  // ストーリー：勝てば章クリア・仲間・ごほうびのパック、負ければ次は相手がゆっくりに
  let story = null;
  if (kind === 'story') {
    story = loadStory();
    const id = sum.chapter;
    if (sum.won) {
      res.firstClear = !story.cleared[id];
      story.cleared[id] = true;
      const char = chapterOf(id).char;
      if (!story.friends.includes(char)) { story.friends.push(char); res.friendNew = char; }
      if (res.firstClear) { col.pending += 1; res.packEarned = true; }
    } else if (natural) {
      story.losses[id] = (story.losses[id] || 0) + 1;
    }
    saveStory(story);
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
  if (kind === 'story' && sum.won) {
    // 勝利 → 章の終わりの会話 → 確認問題（説明してみよう） → 結果
    const ct = storyText().chapters[sum.chapter];
    playTalk(sum.chapter, 'outro', () => startQuiz(sum.chapter, () => showResultScreen(res)));
    return;
  }
  showResultScreen(res);
}

// 総まとめ試験の点数をまとめて、記録して、結果画面へ
function finishFinal(res, q) {
  const F = CONFIG.STORY.FINAL;
  res.duelPts = res.sum.points;
  res.quizPts = q.points;
  res.score = res.duelPts + res.quizPts;
  res.grade = finalGrade(res.score);
  const st = loadStory();
  const old = st.final;
  res.hiddenOpened = !old;          // 初めて受けると隠し章が開く
  res.newBest = !!old && res.score > old.best;
  st.final = { best: Math.max(old ? old.best : 0, res.score), grade: finalGrade(Math.max(old ? old.best : 0, res.score)), plays: (old ? old.plays : 0) + 1 };
  saveStory(st);
  const rec = loadRecords();
  rec.finalBest = Math.max(rec.finalBest || 0, res.score);
  saveRecords(rec);
  if (res.hiddenOpened) { const col = loadCollection(); col.pending += 1; saveCollection(col); res.packEarned = true; }
  res.titles = checkTitles();
  res.maxPts = F.STAGES.length * F.DUEL_FIRST + F.QUIZ * F.QUIZ_FIRST;
  showResultScreen(res);
}

function showResultScreen(res) {
  const { kind, sum } = res;
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
  if (kind === 'final' && !res.finalQuit) res.bigValue = res.score;
  const finalGood = (kind === 'final' && !res.finalQuit && (res.grade === 'S' || res.grade === 'A'))
    || ((kind === 'battle' || kind === 'live') && !res.battleQuit && sum.rank <= 3);
  const celebrate = res.newBest || res.examPassed || (kind === 'daily' && sum.cleared) || (kind === 'story' && sum.won) || finalGood;
  if (celebrate && audio.ready) setTimeout(() => audio.fanfare(), 600);
  if (res.examPassed || (kind === 'story' && sum.won) || finalGood) {
    setTimeout(() => fx.confetti(90, ['#FFFFFF', '#25F4EE', '#FE2C55']), 300);
    setTimeout(() => fx.cheer(loadStory().friends), 500); // 仲間が次々と飛び込む
  }
  if (res.friendNew) requestAnimationFrame(() => paintChar($('friend-canvas'), res.friendNew, 'smug'));
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
  } else if (kind === 'story') {
    const ct = storyText().chapters[sum.chapter];
    title = sum.won ? TEXT.storyWin : TEXT.storyLose;
    label = `${chName(sum.chapter)}  ${TEXT.you} − ${TEXT.charNames[chapterOf(sum.chapter).char]}`;
    big = `${sum.justs} − ${sum.botJusts}`;
    const q = loadStory().quiz[sum.chapter];
    if (sum.won) bestLine = q ? TEXT.quizFirstTry(q.first, q.total) : '';
    else bestLine = `「${ct.lose.text}」 ${sum.burst ? TEXT.storyBurst : TEXT.storyLoseNote}`;
    stats = [[TEXT.resTime, TEXT.timeFmt(sum.timeMs)], [TEXT.resMaxChain, sum.maxChain], [TEXT.resMisses, sum.misses]];
  } else if (kind === 'battle' || kind === 'live') {
    title = res.battleQuit ? TEXT.battleQuit : sum.won ? TEXT.battleWin : TEXT.battleResult;
    label = TEXT.battleRankLabel(sum.total);
    big = TEXT.battleRankBig(sum.rank);
    const rate = sum.justs + sum.misses ? Math.round((sum.justs / (sum.justs + sum.misses)) * 100) : 0;
    bestLine = kind === 'live' ? (room ? `${TEXT.live} · ${TEXT.liveRoomNo} ${room.code}` : TEXT.live) : `${TEXT.levels[sum.level]} · ${TEXT.battleOppN(sum.opponents)}`;
    stats = [[TEXT.resJustRate, `${rate}%`], [TEXT.resMaxChain, sum.maxChain], [TEXT.resValves, sum.valves],
      [TEXT.resCool, sum.coolSent], [TEXT.resJusts, sum.justs], [TEXT.resTime, TEXT.timeFmt(sum.timeMs)]];
  } else if (kind === 'final') {
    title = res.finalQuit ? TEXT.finalQuit : TEXT.finalResult;
    label = TEXT.finalScoreLabel;
    big = res.finalQuit ? `${sum.solved}/${CONFIG.STORY.FINAL.STAGES.length}` : String(res.score);
    if (!res.finalQuit) res.bigValue = res.score;
    const st = loadStory();
    bestLine = res.finalQuit ? '' : `${TEXT.finalGradeLine(res.grade)}　${res.hiddenOpened ? TEXT.finalHiddenOpen : res.newBest ? TEXT.newBest : st.final ? TEXT.finalBestLine(st.final.best) : ''}`;
    stats = res.finalQuit ? [[TEXT.resTime, TEXT.timeFmt(sum.timeMs)]]
      : [[TEXT.finalDuel, `${res.duelPts}/50`], [TEXT.finalQuiz, `${res.quizPts}/50`], [TEXT.resTime, TEXT.timeFmt(sum.timeMs)]];
  }
  // ひとり対戦：全員に見せる記録（優勝者・最長連鎖・最多バルブ・冷却MVP）
  const rb = $('result-battle');
  rb.hidden = !((kind === 'battle' || kind === 'live') && !res.battleQuit);
  if (!rb.hidden && kind === 'live') {
    // みんなで対戦：全員の順位
    rb.innerHTML = `<p class="section-label">${TEXT.liveRanking}</p>`
      + sum.ranking.map((r) => `<div${r.id === 0 ? ' class="me"' : ''}><span>${TEXT.battleRankBig(r.rank)}</span><b>${esc(pnameOf(sum.players[r.id]))}</b></div>`).join('');
  } else if (!rb.hidden) {
    const nm = (id) => esc(pnameOf(sum.players[id]));
    const row = (k, id, v) => `<div><span>${k}</span><b>${id === null || id === undefined ? '—' : nm(id)}</b>${v !== undefined ? `<em>${v}</em>` : ''}</div>`;
    rb.innerHTML = `<p class="section-label">${TEXT.battleAll}</p>`
      + row(TEXT.battleWinner, sum.winner)
      + row(TEXT.battleLongest, sum.chainTop.n ? sum.chainTop.id : null, sum.chainTop.n || '')
      + row(TEXT.battleMostValves, sum.valveTop.n ? sum.valveTop.id : null, sum.valveTop.n || '')
      + row(TEXT.battleCoolMvp, sum.coolTop.n ? sum.coolTop.id : null, sum.coolTop.n || '');
  }
  $('result-title').textContent = title;
  document.querySelector('#screen-result .result-label').textContent = label;
  $('result-score').textContent = big;
  $('result-score').classList.toggle('word', kind === 'exam' && sum.passed);
  const best = $('result-best');
  best.className = 'result-best' + (res.newBest || res.examPassed || (kind === 'story' && sum.won) || (kind === 'final' && !res.finalQuit) ? ' new' : '');
  best.textContent = bestLine;
  $('result-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('result-stats').style.gridTemplateColumns = stats.length < 3 ? `repeat(${stats.length}, 1fr)` : '';

  // 経験値と段位
  const showExp = kind !== 'exam' && kind !== 'story' && kind !== 'final' && !res.battleQuit;
  $('result-exp').hidden = !showExp;
  if (showExp) {
    $('result-exp-gain').textContent = TEXT.expGain(res.exp);
    $('result-rank').textContent = TEXT.ranks[prof.rank];
    const fill = $('result-rank-fill');
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = `${rankProgress(prof).ratio * 100}%`; });
    $('result-rank-note').textContent = examAvailable(prof) ? TEXT.examReady : '';
  }
  // 仲間になった
  $('result-friend').hidden = !res.friendNew;
  if (res.friendNew) {
    $('friend-text').textContent = TEXT.friendJoin(TEXT.charNames[res.friendNew]);
    $('btn-use-face').textContent = TEXT.useAsFace;
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
  packBtn.hidden = !(col.pending > 0 && (kind === 'dojo' || kind === 'story' || kind === 'final' || kind === 'battle' || kind === 'live'));
  packBtn.textContent = col.pending > 1 ? `${TEXT.openPack}（${col.pending}）` : TEXT.openPack;
  const retry = $('btn-retry');
  retry.hidden = kind === 'exam' && sum.passed;
  retry.textContent = kind === 'exam' ? TEXT.examRetry
    : kind === 'story' ? (sum.won ? TEXT.toStory : TEXT.storyRetry)
      : kind === 'final' ? TEXT.finalRetry : kind === 'battle' ? TEXT.battleAgain : kind === 'live' ? TEXT.liveBackRoom : TEXT.retry;
  retry.className = packBtn.hidden ? 'duel-btn' : 'sub-btn';
}

pressable($('btn-retry'), () => {
  if (!lastResult) return;
  if (lastResult.kind === 'live') { backToRoom(); return; }
  if (lastResult.kind === 'story') {
    if (lastResult.sum.won) { stopSong(); renderStoryMap(); show('screen-story'); }
    else startRun('story', { chapter: lastResult.sum.chapter });
    return;
  }
  startRun(lastResult.kind);
});
pressable($('btn-use-face'), () => {
  if (!lastResult || !lastResult.friendNew) return;
  const prof = loadProfile();
  prof.char = lastResult.friendNew;
  saveProfile(prof);
  applySkins();
  toast(TEXT.friendNote);
});
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

// 言語を切り替えたとき、パックのカードの名前とレア度を入れ替える
function renderPackTags() {
  [...$('pack-cards').children].forEach((el, i) => {
    const pc = packCards[i];
    if (!pc) return;
    const art = ART_BY_ID[pc.id];
    const tag = el.querySelector('.tag');
    if (tag) tag.textContent = art[getLang()] || art.ja;
    const pop = el.querySelector('.rarity-pop');
    if (pop) pop.textContent = TEXT.rarity[art.rarity];
    const nw = el.querySelector('.new');
    if (nw) nw.textContent = TEXT.newCard;
  });
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
  if (rarity === 'kimo') fx.confetti(50, ['#FFFFFF', '#D4FAF8']);
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


// =========================================================
// ストーリー（5.5）：章の一覧 → 会話と解説 → デュエル → 会話 → 確認問題 → 結果
// =========================================================
const storyText = () => STORY_TEXT[getLang()] || STORY_TEXT.ja;

function chapterOpen(id, st) {
  const c = chapterOf(id);
  if (c && c.hidden) return !!st.cleared[id - 1] && !!st.final; // 隠し章は総まとめ試験を受けると開く
  return id === 1 || !!st.cleared[id - 1];
}

function renderStoryMap() {
  const st = loadStory();
  const prof = loadProfile();
  const T = storyText();
  // ボンベの顔
  const fp = $('face-picker');
  if (st.friends.length) {
    fp.innerHTML = `<span class="fp-label">${TEXT.faceTitle}</span>`
      + `<button class="face-opt${!prof.char ? ' on' : ''}" type="button" data-face="">${TEXT.faceNone}</button>`
      + st.friends.map((id) => `<button class="face-opt${prof.char === id ? ' on' : ''}" type="button" data-face="${id}" aria-label="${esc(TEXT.charNames[id])}"><canvas></canvas></button>`).join('');
    fp.hidden = false;
    fp.querySelectorAll('[data-face]').forEach((b) => {
      const id = b.dataset.face;
      if (id) requestAnimationFrame(() => paintChar(b.querySelector('canvas'), id, 'normal'));
      b.addEventListener('click', () => {
        const p = loadProfile();
        p.char = id || null;
        saveProfile(p);
        applySkins();
        audio.click();
        renderStoryMap();
      });
    });
  } else {
    fp.innerHTML = '';
    fp.hidden = true;
  }
  // 章（今ある章 ＋ これから追加する章 ＝ 単元全体の地図）
  const rows = [];
  CONFIG.STORY.CHAPTERS.forEach((c) => {
    const t = T.chapters[c.id];
    const open = chapterOpen(c.id, st);
    // 隠し章：7章をクリアするまでは見せない。総まとめ試験を受けるまでは「？？？」
    if (c.hidden && !st.cleared[c.id - 1]) return;
    if (c.hidden && !open) {
      rows.push(`<button class="chapter locked hidden-ch" type="button" data-ch="${c.id}" aria-disabled="true">
      <canvas data-char=""></canvas>
      <span><span class="ch-no">${TEXT.hiddenChapter}</span><b>${TEXT.hiddenTeaser}</b><small>${TEXT.hiddenTeaserTopic}</small>
      </span></button>`);
      return;
    }
    const done = !!st.cleared[c.id];
    const q = st.quiz[c.id];
    const tags = [
      done ? `<span class="tag done">${TEXT.chapterCleared}</span>` : open ? `<span class="tag new">${TEXT.chapterNew}</span>` : '',
      q ? `<span class="tag">${TEXT.quizScore(q.first, q.total)}</span>` : '',
    ].join('');
    rows.push(`<button class="chapter${open ? '' : ' locked'}${c.hidden ? ' hidden-ch' : ''}" type="button" data-ch="${c.id}" ${open ? '' : 'aria-disabled="true"'}>
      <canvas data-char="${c.char}"></canvas>
      <span><span class="ch-no">${chName(c.id)}</span><b>${esc(t.title)}</b><small>${esc(t.topic)}</small>
      <span class="ch-tags">${open ? tags : `<span class="tag">${TEXT.chapterLocked}</span>`}</span></span></button>`);
    // 7章のあとに総まとめ試験
    if (c.id === 7) {
      const fOpen = !!st.cleared[7];
      const f = st.final;
      rows.push(`<button class="chapter final-ch${fOpen ? '' : ' locked'}" type="button" data-final="1" ${fOpen ? '' : 'aria-disabled="true"'}>
      <span class="final-mark" aria-hidden="true">100</span>
      <span><span class="ch-no">${TEXT.finalNo}</span><b>${TEXT.final}</b><small>${TEXT.finalDesc}</small>
      <span class="ch-tags">${fOpen ? (f ? `<span class="tag done">${TEXT.finalBestTag(f.best, f.grade)}</span>` : `<span class="tag new">${TEXT.chapterNew}</span>`) : `<span class="tag">${TEXT.finalLocked}</span>`}</span></span></button>`);
    }
  });
  const future = CONFIG.STORY.FUTURE.map((f) => {
    const t = T.future[f.id];
    const no = f.id === 8 ? TEXT.hiddenChapter : TEXT.chapterN(f.id);
    return `<div class="chapter future"><canvas data-char="${f.char || ''}"></canvas>
      <span><span class="ch-no">${no}</span><b>${esc(t.title)}</b><small>${esc(t.topic)}</small>
      <span class="ch-tags"><span class="tag">${TEXT.chapterComing(f.ver)}</span></span></span></div>`;
  });
  $('chapter-list').innerHTML = rows.join('') + future.join('');
  requestAnimationFrame(() => {
    $('chapter-list').querySelectorAll('canvas').forEach((cv) => {
      const id = cv.dataset.char;
      if (id) paintChar(cv, id, 'normal');
    });
  });
  $('chapter-list').querySelectorAll('[data-ch]').forEach((b) => {
    pressable(b, () => {
      const id = Number(b.dataset.ch);
      if (!chapterOpen(id, loadStory())) { toast(id === CONFIG.STORY.CHAPTERS.find((c) => c.hidden).id ? TEXT.hiddenTeaserTopic : TEXT.chapterLocked); return; }
      startChapter(id);
    });
  });
  $('chapter-list').querySelectorAll('[data-final]').forEach((b) => {
    pressable(b, () => {
      if (!loadStory().cleared[7]) { toast(TEXT.finalLocked); return; }
      startRun('final');
    });
  });
}

function startChapter(id) {
  const ct = storyText().chapters[id];
  playSong('practice');
  playTalk(id, 'intro', () => {
    const st = loadStory();
    st.seen[id] = true;
    saveStory(st);
    stopSong();
    startRun('story', { chapter: id });
  });
}

// ---------- 会話と解説 ----------
let talk = null;
let lessonView = null;
let demoTimer = null;
let graphRaf = 0;

// part：'intro'（章の前）か 'outro'（章の後）。文言は表示のたびに今の言語で取り出す
function playTalk(chapterId, part, onDone) {
  talk = { chapterId, part, i: 0, onDone };
  show('screen-talk');
  renderTalkTitle();
  renderPanel();
}
function renderTalkTitle() {
  $('talk-chapter').textContent = `${chName(talk.chapterId)}　${storyText().chapters[talk.chapterId].title}`;
}
const talkPanels = () => storyText().chapters[talk.chapterId][talk.part];

function fmtDemo(st) {
  const t = Math.round(st.T);
  const base = `P ${(st.P / 10).toFixed(1)}×10⁵ Pa　V ${(st.V / 2).toFixed(1)} L　T ${t} K`;
  // 混合気体の解説（6章）では、分圧の内訳を出す（全圧 = N₂ の分圧 + O₂ の分圧）
  if (st.A !== undefined) {
    const N = st.A + st.B;
    const f = (x) => (x / 10).toFixed(1);
    return `P ${f(st.P)}×10⁵ Pa = N₂ ${f(st.P * st.A / N)} + O₂ ${f(st.P * st.B / N)}　V ${(st.V / 2).toFixed(1)} L`;
  }
  // 物質量が変わる解説（5章〜）では n も出す。n = pV/(RT)
  if (st.N !== undefined) {
    const n = (st.P * 1e4 * (st.V / 2)) / (CONFIG.GAS_R * st.T);
    return `${base}　n ${n.toPrecision(2)} mol`;
  }
  return `${base}（${t - 273}℃）`;
}

function renderPanel() {
  clearInterval(demoTimer);
  const p = talkPanels()[talk.i];
  const lesson = $('lesson');
  const bubble = $('bubble');
  if (p.lesson) {
    lesson.hidden = false;
    $('talk-char').style.visibility = 'hidden';
    bubble.hidden = true;
    $('lesson-ref').textContent = p.ref ? TEXT.lessonRef(p.ref) : '';
    $('lesson-title').textContent = p.lesson;
    $('lesson-text').textContent = p.text;
    lesson.classList.toggle('nodemo', !p.demo && !p.graph);
    lesson.classList.toggle('graph', !!p.graph);
    cancelAnimationFrame(graphRaf);
    if (p.graph) {
      // Z の模式図：線が左から右へのびる
      const t0 = performance.now();
      const stepG = (now) => {
        const k = Math.min(1, (now - t0) / 1200);
        drawZGraph($('lesson-graph'), p.graph, TEXT.zGraph, k);
        if (k < 1) graphRaf = requestAnimationFrame(stepG);
      };
      graphRaf = requestAnimationFrame(stepG);
    }
    let tapHint = lesson.querySelector('.bubble-next');
    if (!tapHint) {
      tapHint = document.createElement('span');
      tapHint.className = 'bubble-next';
      lesson.appendChild(tapHint);
    }
    tapHint.textContent = TEXT.tapNext;
    if (p.demo) {
      if (!lessonView) lessonView = new BombeView($('lesson-bombe'));
      lessonView.resize();
      lessonView.setFace(null);
      lessonView.set(p.demo[0], null);
      $('lesson-state').textContent = fmtDemo(p.demo[0]);
      // ボンベの動き：1段ずつ動かし、最後まで行ったら最初に戻して繰り返す
      let k = 0;
      demoTimer = setInterval(() => {
        k = (k + 1) % (p.demo.length + 1);
        if (k === p.demo.length) { lessonView.set(p.demo[0], null); $('lesson-state').textContent = fmtDemo(p.demo[0]); return; }
        lessonView.animateTo(p.demo[k], 900);
        $('lesson-state').textContent = fmtDemo(p.demo[k]);
      }, 1700);
    }
  } else {
    lesson.hidden = true;
    bubble.hidden = false;
    const cv = $('talk-char');
    cv.style.visibility = 'visible';
    paintChar(cv, p.who, p.face || 'normal');
    $('bubble-name').textContent = TEXT.charNames[p.who] || '';
    $('bubble-text').textContent = p.text;
    replay(bubble, 'snap');
  }
}

function nextPanel() {
  if (!talk) return;
  audio.click();
  talk.i++;
  if (talk.i >= talkPanels().length) return endTalk();
  renderPanel();
}
function endTalk() {
  clearInterval(demoTimer);
  const done = talk && talk.onDone;
  talk = null;
  if (done) done();
}
$('talk-stage').addEventListener('click', nextPanel);
$('bubble').addEventListener('click', nextPanel);
$('btn-skip').addEventListener('click', (e) => { e.stopPropagation(); endTalk(); });

// ---------- 確認問題（説明してみよう）と、分子量の鑑定 ----------
// 問題は { fixed: 番号 }（story_text.js の問題）か { kantei: データ }（自動で作る鑑定）。
// 文言は表示のたびに今の言語で組み立てるので、途中で言語を切り替えても続きから解ける。
let quiz = null;

function startQuiz(chapterId, onDone, opts = {}) {
  const rng = createRng(randomSeed());
  let items;
  if (opts.final) {
    // 総まとめ試験：1〜7章から1問ずつ ＋ 分子量の鑑定 ＋ Z判定 ＋ もう1問（どこかの章から）
    const chs = CONFIG.STORY.CHAPTERS.filter((c) => !c.hidden).map((c) => c.id);
    const pick = (id, avoid = -1) => {
      const n = storyText().chapters[id].quiz.length;
      let i = rng.int(n);
      if (i === avoid && n > 1) i = (i + 1) % n;
      return { fixed: i, ch: id };
    };
    items = chs.map((id) => pick(id));
    items.push({ kantei: makeKantei(rng) }, { zq: makeZQuiz(rng) });
    const extra = rng.pick(chs);
    items.push(pick(extra, items.find((x) => x.ch === extra).fixed));
    items = items.slice(0, CONFIG.STORY.FINAL.QUIZ);
  } else {
    const ch = storyText().chapters[chapterId];
    items = ch.quiz.map((_, i) => ({ fixed: i }));
    for (let k = 0; k < (ch.kantei || 0); k++) items.push({ kantei: makeKantei(rng) });
    for (let k = 0; k < (ch.zq || 0); k++) items.push({ zq: makeZQuiz(rng) });
  }
  quiz = { mode: opts.final ? 'final' : 'story', chapterId, items, i: 0, first: 0, points: 0, onDone };
  $('btn-quiz-back').hidden = true;
  show('screen-quiz');
  playSong('practice');
  beginQuestion();
}

// 練習室の「分子量の鑑定」「Z判定」：終わりなく出題する
const labItem = (mode) => (mode === 'zlab' ? { zq: makeZQuiz(createRng(randomSeed())) } : { kantei: makeKantei(createRng(randomSeed())) });
function startKantei(mode = 'kantei') {
  quiz = { mode, items: [labItem(mode)], i: 0, first: 0, onDone: null };
  $('btn-quiz-back').hidden = false;
  show('screen-quiz');
  playSong('practice');
  beginQuestion();
}
pressable($('btn-kantei'), () => { if (loadStory().cleared[5]) startKantei(); else toast(TEXT.kanteiLocked); });
pressable($('btn-zlab'), () => { if (loadStory().cleared[7]) startKantei('zlab'); else toast(TEXT.zLabLocked); });
$('btn-quiz-back').addEventListener('click', () => { quiz = null; stopSong(); renderSelect(); show('screen-select'); });

function itemView(item) {
  if (item.kantei) {
    const d = item.kantei;
    return {
      q: TEXT.kanteiQ(d.m, d.t, d.p, d.V),
      choices: d.choices.map((id) => TEXT.gases[id]),
      answer: 0,
      explain: TEXT.kanteiExplain(d.m, d.t, d.T, d.p, d.V, d.M, TEXT.gases[d.gas]),
      ref: 'p.45 (12)式',
    };
  }
  if (item.zq) {
    const d = item.zq;
    const sci = (p) => { const e = Math.floor(Math.log10(p)); return `${(p / 10 ** e).toFixed(1)}×10${String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('')}`; };
    if (d.kind === 'cond') {
      return { q: TEXT.zCondQ(TEXT.zGases[d.gas]), choices: d.choices.map(([T, p]) => TEXT.zCondChoice(T, sci(p))), answer: 0, explain: TEXT.zCondExplain, ref: 'p.51〜52' };
    }
    return { q: TEXT.zGasQ, choices: d.choices.map((g) => TEXT.zGases[g]), answer: 0, explain: TEXT.zGasExplain(TEXT.zGases[d.choices[0]]), ref: 'p.52 図9' };
  }
  return storyText().chapters[item.ch || quiz.chapterId].quiz[item.fixed];
}

function beginQuestion() {
  const it = itemView(quiz.items[quiz.i]);
  // 選択肢の並びは問題ごとにシャッフルし、言語を切り替えても同じ並びのままにする
  quiz.order = createRng(randomSeed()).shuffle(it.choices.map((_, k) => k));
  quiz.wrongs = [];
  quiz.solved = false;
  renderQuestion();
  $('screen-quiz').scrollTop = 0;
}

function renderQuestion() {
  const it = itemView(quiz.items[quiz.i]);
  const total = quiz.items.length;
  const item = quiz.items[quiz.i];
  $('quiz-count').textContent = quiz.mode === 'kantei' ? TEXT.kanteiCount(quiz.i + 1) : quiz.mode === 'zlab' ? TEXT.zLabCount(quiz.i + 1) : `${quiz.i + 1} / ${total}`;
  document.querySelector('#screen-quiz .quiz-head b').textContent = quiz.mode === 'final' ? TEXT.final
    : item.kantei ? TEXT.kantei : item.zq ? TEXT.zLab : TEXT.quizTitle;
  $('quiz-ref').textContent = it.ref ? TEXT.lessonRef(it.ref) : '';
  $('quiz-q').textContent = it.q;
  const box = $('quiz-choices');
  box.innerHTML = '';
  quiz.order.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-choice';
    b.textContent = it.choices[k];
    if (quiz.solved) { b.disabled = true; if (k === it.answer) b.classList.add('right'); }
    if (quiz.wrongs.includes(k)) { b.disabled = true; b.classList.add('wrong'); }
    b.addEventListener('click', () => answer(k));
    box.appendChild(b);
  });
  const fb = $('quiz-feedback');
  if (quiz.solved) {
    $('quiz-verdict').textContent = TEXT.quizCorrect;
    $('quiz-explain').textContent = it.explain;
    fb.hidden = false;
  } else if (quiz.wrongs.length) {
    $('quiz-verdict').textContent = TEXT.quizWrong;
    $('quiz-explain').textContent = quiz.wrongs.length >= 2 ? it.explain : ''; // 2回まちがえたら解説を見せる
    fb.hidden = false;
  } else {
    fb.hidden = true;
  }
  const lab = quiz.mode === 'kantei' || quiz.mode === 'zlab';
  const last = !lab && quiz.i === total - 1;
  $('btn-quiz-next').textContent = quiz.mode === 'kantei' ? TEXT.kanteiNext : quiz.mode === 'zlab' ? TEXT.zLabNext : last ? TEXT.quizDone : TEXT.quizNext;
  $('btn-quiz-next').hidden = !quiz.solved;
}

function answer(k) {
  if (!quiz || quiz.solved) return;
  const it = itemView(quiz.items[quiz.i]);
  if (k === it.answer) {
    if (!quiz.wrongs.length) quiz.first++;
    quiz.points += quiz.wrongs.length ? CONFIG.STORY.FINAL.QUIZ_LATER : CONFIG.STORY.FINAL.QUIZ_FIRST; // 総まとめ試験の点数
    quiz.solved = true;
    audio.just(quiz.i + 1);
    vibrate(CONFIG.VIBRATE_JUST);
  } else {
    quiz.wrongs.push(k);
    audio.miss();
  }
  renderQuestion();
}

pressable($('btn-quiz-next'), () => {
  if (!quiz) return;
  if (quiz.mode === 'kantei' || quiz.mode === 'zlab') {
    quiz.items.push(labItem(quiz.mode));
    quiz.i++;
    return beginQuestion();
  }
  quiz.i++;
  if (quiz.i < quiz.items.length) return beginQuestion();
  if (quiz.mode === 'final') {
    const q = quiz;
    quiz = null;
    stopSong();
    return q.onDone(q);
  }
  const st = loadStory();
  const old = st.quiz[quiz.chapterId];
  if (!old || quiz.first > old.first) st.quiz[quiz.chapterId] = { first: quiz.first, total: quiz.items.length };
  saveStory(st);
  const done = quiz.onDone;
  quiz = null;
  stopSong();
  if (done) done();
});

// ====================================================================
// ひとり対戦（CPU戦。v0.9）
// ====================================================================
const BATTLE_MODES = ['random', 'counter', 'finish', 'valve'];
const battleOpt = () => {
  const o = { opp: 11, level: 'regular', cards: 'basic', ...(settings.battle || {}) };
  if (!CONFIG.BATTLE.OPPONENTS.includes(o.opp)) o.opp = 11;
  return o;
};
function battleUnlocked() {
  return !!loadStory().cleared[CONFIG.BATTLE.UNLOCK_CHAPTER];
}
pressable($('btn-battle'), () => {
  if (!battleUnlocked()) { toast(TEXT.battleLocked); return; }
  renderBattleSetup();
  show('screen-battle');
});

// 選択ボタンの列（CPUの数・強さ・カード）
function segButtons(el, items, cur, onPick) {
  el.innerHTML = '';
  items.forEach(([val, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(val === cur));
    b.textContent = label;
    b.addEventListener('click', () => { audio.click(); onPick(val); });
    el.appendChild(b);
  });
}
function renderBattleSetup() {
  const o = battleOpt();
  const save = (patch) => { settings.battle = { ...o, ...patch }; saveSettings(settings); renderBattleSetup(); };
  segButtons($('opt-opp'), CONFIG.BATTLE.OPPONENTS.map((n) => [n, TEXT.battleOppN(n)]), o.opp, (v) => save({ opp: v }));
  segButtons($('opt-level'), ['novice', 'regular', 'master'].map((k) => [k, TEXT.levels[k]]), o.level, (v) => save({ level: v }));
  segButtons($('opt-cards'), ['basic', 'all'].map((k) => [k, TEXT.cardSets[k]]), o.cards, (v) => save({ cards: v }));
  $('battle-rules').innerHTML = `<ul>${TEXT.battleRules.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const r = loadRecords();
  $('battle-best').textContent = r.battlePlays ? TEXT.battleBest(r.battleWins, r.battleBestRank) : '';
}
pressable($('btn-battle-start'), () => startRun('battle'));

// 名前：自分は「あなた」、CPU は「シャルル2号」のように
const pnameOf = (p) => (p.me ? TEXT.you : p.name ? p.name : TEXT.botName(TEXT.charNames[p.char], p.num));
const pname = (id) => pnameOf(run.players[id]);

// 開始前の3秒のカウントダウン（全員同時に始まる）
async function battleCountdown() {
  busy = true;
  for (const n of ['3', '2', '1']) {
    showBanner(n, true);
    audio.click();
    await wait(CONFIG.BATTLE.COUNTDOWN_MS / 3);
    if (!run || run.kind !== 'battle') return;
  }
  showBanner(TEXT.duel, true);
  busy = false;
  run.me.targetAt = 0;
  startLoop();
  battleFxLoop();
}

// 左右の縁に相手を並べる（6.9：8人以下は顔＋名前＋メーター、20人以下は顔＋メーター、それより多いと細い棒だけ）
function buildBattleUI(keepMode = false) {
  const others = run.players.filter((p) => !p.me);
  const n = others.length;
  const dens = n <= 8 ? 'full' : n <= 20 ? 'face' : 'bar';
  const half = Math.ceil(n / 2);
  const cols = [$('opp-left'), $('opp-right')];
  cols.forEach((c, k) => {
    c.className = `opp-col ${k ? 'right' : 'left'} ${dens}`;
    c.innerHTML = '';
    others.slice(k ? half : 0, k ? n : half).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opp';
      b.dataset.id = String(p.id);
      b.setAttribute('aria-label', pnameOf(p));
      b.innerHTML = (dens === 'bar' ? '' : '<canvas></canvas>')
        + (dens === 'full' ? `<span class="nm">${esc(pnameOf(p))}</span>` : '')
        + '<i class="m"><i></i></i><em class="vb"></em>';
      b.addEventListener('click', () => {
        if (!battleLike() || run.me.alive) return;
        if (run.setCoolTarget(p.id)) { audio.click(); renderBattleLive(); }
      });
      c.appendChild(b);
      if (dens !== 'bar') {
        const cv = b.querySelector('canvas');
        requestAnimationFrame(() => paintChar(cv, p.char, p.alive ? 'normal' : 'ascend'));
        b._expr = p.alive ? 'normal' : 'ascend';
      }
    });
  });
  // 攻撃先の4つのボタン
  const tb = $('target-bar');
  tb.innerHTML = '';
  BATTLE_MODES.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.mode = m;
    b.textContent = TEXT.modes[m];
    b.addEventListener('click', () => { if (!battleLike()) return; run.setMode(m); audio.click(); renderBattleLive(); });
    tb.appendChild(b);
  });
  if (!keepMode) { $('pending').innerHTML = ''; fxShots = []; }
  $('screen-play').classList.toggle('cooling', !run.me.alive);
  $('cool-bar').hidden = run.me.alive;
}

// 毎回の表示の更新（危険メーター・着弾待ち・狙われ・攻撃先・冷却係）
function renderBattleLive() {
  if (!battleLike()) return;
  const me = run.me;
  const myTargets = me.alive ? run.targetsOf(me) : [];
  const attackers = me.alive ? run.attackersOf(0) : [];
  const coolTo = me.alive ? null : run.coolTargetOf(me);
  document.querySelectorAll('.opp').forEach((el) => {
    const p = run.players[Number(el.dataset.id)];
    const fill = el.querySelector('.m i');
    if (fill) fill.style.setProperty('--m', `${p.alive ? p.meter : 0}%`);
    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('aiming', attackers.includes(p.id));
    el.classList.toggle('mine', myTargets.includes(p.id));
    el.classList.toggle('cool', coolTo === p.id);
    el.classList.toggle('warn', p.alive && p.meter >= CONFIG.DOJO.WARN_AT);
    el.querySelector('.vb').textContent = p.valves ? String(p.valves) : '';
    const cv = el.querySelector('canvas');
    const ex = p.alive ? 'normal' : 'ascend';
    if (cv && el._expr !== ex) { el._expr = ex; paintChar(cv, p.char, ex); }
  });
  // 着弾待ち：炎のアイコン。数字は熱波の量、下の線は着弾までの残り
  const B = CONFIG.BATTLE;
  $('pending').innerHTML = me.pending.map((h) => {
    const left = Math.max(0, Math.min(1, (h.at - run.clock) / B.LAND_MS));
    return `<span class="flame"><svg viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-3-1-5 0-7z" fill="#121212"/></svg><b>${h.amt}</b><i style="width:${(left * 100).toFixed(0)}%"></i></span>`;
  }).join('');
  const aim = $('aimed');
  aim.hidden = !attackers.length;
  aim.textContent = TEXT.aimed(attackers.length);
  document.querySelectorAll('#target-bar button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === me.mode)));
  $('target-bar').classList.toggle('off', !me.alive);
  if (!me.alive) $('cool-text').textContent = run.kind === 'live' ? TEXT.liveWaiting : coolTo !== null ? TEXT.coolNow(pname(coolTo)) : '';
  $('btn-ff').hidden = run.kind === 'live';
}

// 起きたことの演出
function onBattleEvents(evs) {
  for (const e of evs) {
    if (e.type === 'heat') {
      if (e.from !== 0) e.sent.forEach(([to]) => { if (to === 0) shoot(e.from, 0); });
    } else if (e.type === 'land') {
      if (e.to === 0) {
        view.shake();
        vibrate(40);
        if (e.jam && e.jamInfo) {
          audio.deny();
          showMessage(e.jamInfo.type === 'to_celsius' ? TEXT.jamCelsius : TEXT.jamFrost, 'show', CONFIG.ANIM.NOTICE_MS);
          if (!busy) { renderHand(); renderField(); }
        }
      } else flashOpp(e.to);
    } else if (e.type === 'burst') {
      if (e.id === 0) {
        // 自分の破裂：冷却係になる
        view.burst();
        view.setExpr('ascend', 2500);
        audio.burst();
        showBanner(TEXT.youBurst);
        $('screen-play').classList.add('cooling');
        $('cool-bar').hidden = false;
        music.setHeartbeat(false);
        setTimeout(() => { if (battleLike()) { view.clearBurst(); view.setExpr('normal'); } }, 1600);
        showMessage(TEXT.coolPick, 'show', CONFIG.ANIM.NOTICE_MS * 2);
      } else {
        flashOpp(e.id);
        if (e.by === 0) { showMessage(TEXT.koBy(pname(e.id)), 'show', CONFIG.ANIM.NOTICE_MS); audio.feverStart(false); }
      }
    } else if (e.type === 'final') {
      showBanner(TEXT.finalTwo, true);
      if (!run.me.alive && run.me.cheerFor !== null) showMessage(TEXT.cheerFor(pname(run.me.cheerFor)), 'show', CONFIG.ANIM.NOTICE_MS * 2);
    } else if (e.type === 'cool') {
      if (e.to === 0) { showMessage(TEXT.coolSent(TEXT.you), 'show', 1200); }
    } else if (e.type === 'cool_full') {
      if (e.from === 0) showMessage(TEXT.coolFull(pname(e.to)), 'show', CONFIG.ANIM.NOTICE_MS);
    } else if (e.type === 'phase') {
      showMessage(TEXT.phaseUp(e.stages.join('〜')), 'show', CONFIG.ANIM.NOTICE_MS);
    }
  }
}

// 自分のジャストのあと：熱波・相殺・冷却ガスの一言と、飛んでいく熱波
function afterBattleJust(info) {
  if (info.cooling) {
    if (info.cooled !== null && info.cooled !== undefined) { showMessage(TEXT.coolSent(pname(info.cooled)), 'show', 1500); shoot(0, info.cooled, true); }
  } else {
    const parts = [];
    if (info.offset) parts.push(TEXT.heatOffset(info.offset));
    (info.sent || []).forEach(([id, amt]) => { parts.push(TEXT.heatSent(amt, pname(id))); shoot(0, id); });
    if (parts.length) showMessage(parts.join('　'), 'show', 1800);
  }
  renderBattleLive();
}

function flashOpp(id) {
  const el = document.querySelector(`.opp[data-id="${id}"]`);
  if (el) replay(el, 'hit');
}

// ---- 線と、飛んでいく熱波（画面全体の透明なキャンバス） ----
let fxShots = [];
let fxRunning = false;
function oppPoint(id) {
  if (id === 0) {
    const r = $('bombe').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
  }
  const el = document.querySelector(`.opp[data-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function shoot(from, to, cool = false) {
  fxShots.push({ from, to, t0: performance.now(), cool });
}
function battleFxLoop() {
  if (fxRunning) return;
  fxRunning = true;
  const cv = $('battle-fx');
  const step = (now) => {
    if (!run || run.kind !== 'battle' || $('screen-play').hidden) { fxRunning = false; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 自分を狙っている相手との細い線
    if (run.me.alive) {
      const me = oppPoint(0);
      ctx.strokeStyle = 'rgba(18, 18, 18, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      for (const id of run.attackersOf(0)) {
        const p = oppPoint(id);
        if (!p) continue;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(me.x, me.y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // 飛んでいく熱波（ネイビーの玉）と冷却ガス（白地に青の輪）
    fxShots = fxShots.filter((sh) => now - sh.t0 < 650);
    for (const sh of fxShots) {
      const a = oppPoint(sh.from);
      const b = oppPoint(sh.to);
      if (!a || !b) continue;
      const k = Math.min(1, (now - sh.t0) / 650);
      const e = 1 - Math.pow(1 - k, 2);
      const x = a.x + (b.x - a.x) * e;
      const y = a.y + (b.y - a.y) * e - Math.sin(Math.PI * k) * 40;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = sh.cool ? '#25F4EE' : '#121212';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = sh.cool ? '#121212' : '#FE2C55';
      ctx.stroke();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 自分が破裂したあと：残りを早送りして結果へ
pressable($('btn-ff'), () => {
  if (!run || run.kind !== 'battle' || run.me.alive || busy) return;
  run.fastForward();
  finishRun(true);
});

// ====================================================================
// みんなで対戦（ライブ対戦。v1.0：部屋・待合室・同時スタート・ほかの参加者の表示）
// ====================================================================
let net = null;
let room = null;
let startTimer = null;
let startScheduled = 0;

pressable($('btn-live'), () => openLive());
$('btn-live-back').addEventListener('click', () => show('screen-title'));

async function openLive(code = '') {
  show('screen-live');
  renderLiveForm();
  if (code) $('live-code').value = code;
  if (!netReady()) { setLiveStatus(TEXT.liveNotReady, 'off'); return; }
  if (net) { setLiveStatus(TEXT.liveConnected, 'ok'); return; }
  setLiveStatus(TEXT.liveConnecting, 'wait');
  try {
    net = await connect();
    setLiveStatus(TEXT.liveConnected, 'ok');
  } catch (e) {
    setLiveStatus(TEXT.liveError, 'off');
  }
}

function setLiveStatus(text, kind) {
  const el = $('live-status');
  el.textContent = text;
  el.className = `live-status ${kind}`;
  el.dataset.kind = kind;
  const ready = kind === 'ok';
  $('btn-room-create').disabled = !ready;
  $('btn-room-join').disabled = !ready;
}

// ニックネームとキャラクター（仲間にしたキャラクターから選ぶ。まだいなければボイル）
function renderLiveForm() {
  const inp = $('live-name');
  if (document.activeElement !== inp) inp.value = settings.liveName || '';
  inp.placeholder = TEXT.liveName;
  const st = loadStory();
  const chars = st.friends.length ? st.friends : ['boyle'];
  if (!chars.includes(settings.liveChar)) settings.liveChar = chars[0];
  const box = $('live-chars');
  box.innerHTML = '';
  chars.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'face-opt' + (settings.liveChar === id ? ' on' : '');
    b.setAttribute('aria-label', TEXT.charNames[id]);
    b.innerHTML = '<canvas></canvas>';
    b.addEventListener('click', () => { settings.liveChar = id; saveSettings(settings); audio.click(); renderLiveForm(); });
    box.appendChild(b);
    requestAnimationFrame(() => paintChar(b.querySelector('canvas'), id, 'normal'));
  });
  const st2 = $('live-status').dataset.kind;
  if (st2) setLiveStatus(st2 === 'ok' ? TEXT.liveConnected : st2 === 'wait' ? TEXT.liveConnecting : netReady() ? TEXT.liveError : TEXT.liveNotReady, st2);
}
$('live-name').addEventListener('input', () => {
  settings.liveName = [...$('live-name').value].slice(0, NAME_MAX).join('');
  saveSettings(settings);
});

function liveMe() {
  const name = [...($('live-name').value || '').trim()].slice(0, NAME_MAX).join('');
  if (!name) { toast(TEXT.liveErrName); $('live-name').focus(); return null; }
  settings.liveName = name;
  saveSettings(settings);
  return { name, char: settings.liveChar };
}

pressable($('btn-room-create'), async () => {
  if (!net) return;
  const me = liveMe();
  if (!me) return;
  try { enterRoom(await Room.create(net, me)); } catch (e) { toast(TEXT.liveError); }
});
pressable($('btn-room-join'), async () => {
  if (!net) return;
  const me = liveMe();
  if (!me) return;
  const code = ($('live-code').value || '').replace(/\D/g, '');
  if (code.length !== 4) { toast(TEXT.liveErrCode); return; }
  try {
    enterRoom(await Room.join(net, code, me));
  } catch (e) {
    const m = String(e && e.message);
    toast(m === 'none' ? TEXT.liveErrNone : m === 'started' ? TEXT.liveErrStarted : m === 'full' ? TEXT.liveErrFull : TEXT.liveError);
  }
});

// 部屋の URL（QR コード用）。?room=1234 で開くと、番号が入った状態で始まる
function roomURL(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (useMock()) u.searchParams.set('mock', '');
  return u.toString().replace('mock=', 'mock');
}

function enterRoom(r) {
  room = r;
  startScheduled = 0;
  room.onChange = (d) => renderRoom(d);
  show('screen-room');
  $('room-code').textContent = room.code;
  const url = roomURL(room.code);
  $('room-url').textContent = url;
  try {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    $('room-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { $('room-qr').innerHTML = ''; }
  renderRoom(room.data);
}

function renderRoom(d) {
  if (!room) return;
  if (!d) {
    // 一度見えていた部屋が消えた（全員が抜けたなど）
    if (room.seen && !$('screen-room').hidden) { toast(TEXT.liveGone); leaveRoom(); }
    return;
  }
  room.seen = true;
  const ps = room.players();
  $('room-count').textContent = TEXT.liveCount(ps.length);
  const box = $('room-players');
  box.innerHTML = ps.map((p) => `<div class="room-p${p.uid === room.uid ? ' me' : ''}" data-uid="${esc(p.uid)}"><canvas></canvas><b>${esc(p.name || '?')}</b>`
    + `${p.uid === d.host ? `<em>${TEXT.liveHostTag}</em>` : ''}${p.uid === room.uid ? `<i>${TEXT.liveYouTag}</i>` : ''}</div>`).join('');
  box.querySelectorAll('.room-p').forEach((el, i) => requestAnimationFrame(() => paintChar(el.querySelector('canvas'), ps[i].char || 'boyle', 'normal')));
  const host = room.isHost;
  $('btn-room-start').hidden = !host;
  $('btn-room-start').disabled = ps.length < 2 || d.state !== 'lobby';
  $('room-msg').textContent = host ? (ps.length < 2 ? TEXT.liveNeed2 : '') : TEXT.liveWaitHost;
  // スタートの合図：全員が startAt にそろって始める（7.3）
  if (d.state === 'countdown' && d.startAt && startScheduled !== d.startAt && (!run || run.kind !== 'live')) scheduleStart(d.startAt);
}

function scheduleStart(startAt) {
  startScheduled = startAt;
  clearInterval(startTimer);
  const cd = $('room-countdown');
  cd.hidden = false;
  const step = () => {
    const left = startAt - net.serverNow();
    if (left <= 0) {
      clearInterval(startTimer);
      cd.hidden = true;
      if (!room || $('screen-room').hidden) return;
      if (room.isHost) room.setState('playing');
      startRun('live');
      showBanner(TEXT.duel, true);
      return;
    }
    const n = String(Math.ceil(left / 1000));
    if (cd.textContent !== n) { cd.textContent = n; audio.click(); }
  };
  step();
  startTimer = setInterval(step, 50);
}

pressable($('btn-room-start'), async () => { if (room) { audio.click(); await room.start(); } });
$('btn-room-leave').addEventListener('click', () => leaveRoom());

async function leaveRoom() {
  clearInterval(startTimer);
  $('room-countdown').hidden = true;
  const r = room;
  room = null;
  if (r) await r.leave();
  show('screen-live');
  renderLiveForm();
}

// 結果画面から待合室へ。部屋を作った人が待合室の状態に戻し、各自が自分の値を元に戻す
async function backToRoom() {
  if (!room) { openLive(); return; }
  await room.resetMe();
  await room.backToLobby();
  startScheduled = 0;
  show('screen-room');
  renderRoom(room.data);
}

// ---------- 起動 ----------
applySkins();
applyTexts();
show('screen-title');
window.__srdReady = true; // 読み込みに成功した印（index.html のお知らせを出さない）
// 部屋の QR コードから開いたとき（?room=1234）は、みんなで対戦の画面に番号を入れて開く
try {
  const rc = new URLSearchParams(location.search).get('room');
  if (rc && /^\d{4}$/.test(rc)) openLive(rc);
} catch (e) { /* なし */ }

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
    startChapter,
    startKantei,
    get talk() { return talk; },
    get room() { return room; },
    get net() { return net; },
    get quiz() { return quiz; },
  };
}
