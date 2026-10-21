// 画面の文言はすべてここに集める。日本語（ja）と英語（en）。
// TEXT はいま選んでいる言語の文言。setLang() で中身が入れ替わる。

const JA = {
  title: 'セキオロックデュエル',
  titleEn: 'SEKIO ROCK DUEL',
  tagline: 'カードを組み合わせて、圧力をぴったり合わせろ！',
  practice: '練習室',
  practiceDesc: '段階を選んで、じっくり解く',
  back: 'もどる',
  langLabel: '言語を切り替える',

  assistOn: '補助あり',
  assistOff: '補助なし',
  assistHint: '補助あり：カードを置くと、半透明のシャドウ（ピストン・圧力計の針・温度計）が、左のカードから順に動いて結果を見せます',
  chooseStage: '段階を選ぶ',
  stageName: (n) => `段階${n}`,
  stageHint: {
    1: '体積カード 1枚',
    2: '体積カード 2枚',
    3: '温度カード登場 1枚',
    4: '体積＋温度 2枚',
    5: '℃カード登場 2枚',
    6: '全カード 3枚',
  },

  stageLabel: '段階',
  justLabel: 'ジャスト',
  home: 'ホームへ',
  targetLabel: '目標',
  targetText: (p) => `P を ${p} に`,
  duel: 'デュエル！',
  reroll: '引き直し',
  handHint: 'カードをタップ（またはドラッグ）して場に置こう',
  tempLimit: '温度カードは1回に1枚まで',
  preview: (p) => `予告：P → ${p}`,
  previewInvalid: '予告：途中で使えない値になる',

  just: 'JUST!',
  miss: 'ハズレ',
  missResult: (p) => `結果は ${p}。もう一度！`,
  ventilated: '換気！ ボンベを最初の状態に戻したよ',
  rerolled: '手札を入れ替えた',

  // 考え違いの一言（4.5）
  mistakes: {
    inverse_v: '体積が小さくなると、圧力は大きくなる（反比例）',
    celsius: '温度の比は、必ずKに直してから',
    inverse_t: '体積一定なら、圧力は温度に比例する',
    ignore_t: '体積と温度、両方の倍率を掛ける',
    calc: '倍率を1枚ずつ書き出して、順に掛けてみよう',
    range: '途中で体積が使えない値になった。順番を見直そう',
  },

  // ---- v0.3 道場 ----
  dojo: '道場',
  dojoDesc: '危険メーターに追われながら解き続ける',
  best: (n) => `自己ベスト ${n}`,
  scoreLabel: '得点',
  chainLabel: '連鎖',
  chainPop: (n) => `${n}連鎖！`,
  smart: 'SMART!',
  speed: 'SPEED!',
  fever: 'FEVER!',
  superFever: 'SUPER FEVER!!',
  stageUp: (n) => `段階${n}へ！`,
  targetStage: (n) => `目標 · 段階${n}`,
  dangerLabel: '危険',
  chainLost: '連鎖が切れた…（20秒以内に次のジャストを）',
  pauseTitle: '一時停止',
  resume: 'つづける',
  quit: 'やめて結果を見る',
  mute: '音を消す',
  unmute: '音を出す',
  resultTitle: '破裂！',
  resultQuit: 'おつかれさま',
  newBest: '自己ベスト更新！',
  resMaxChain: '最高連鎖',
  resJusts: 'ジャスト',
  resSmart: 'スマート',
  resSpeed: 'スピード',
  resStage: '到達した段階',
  resTime: '時間',
  resMistakes: '考え違いの記録（あなただけに表示）',
  noMistakes: '考え違いはありませんでした。すばらしい！',
  retry: 'もう一度',
  toHome: 'ホームへ',
  times: (n) => `${n}回`,
  timeFmt: (ms) => `${Math.floor(ms / 60000)}分${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}秒`,
  mistakeNames: {
    inverse_v: '比の逆転',
    celsius: 'セルシウスのまま',
    inverse_t: '温度の逆転',
    ignore_t: '温度の無視',
    calc: '計算ミス',
    range: '順番で範囲外',
  },

  unitP: '×10⁵ Pa',
  unitV: 'L',
  unitT: 'K',
  approx: '約',
};

const EN = {
  title: 'SEKIO ROCK DUEL',
  titleEn: 'セキオロックデュエル',
  tagline: 'Combine cards to hit the target pressure exactly!',
  practice: 'Practice Room',
  practiceDesc: 'Pick a level and take your time',
  back: 'Back',
  langLabel: 'Switch language',

  assistOn: 'Assist ON',
  assistOff: 'Assist OFF',
  assistHint: 'Assist ON: placed cards are acted out by a see-through shadow piston, gauge needle and thermometer, card by card from the left',
  chooseStage: 'Choose a level',
  stageName: (n) => `Level ${n}`,
  stageHint: {
    1: 'Volume card ×1',
    2: 'Volume cards ×2',
    3: 'Temperature cards ×1',
    4: 'Volume + temp ×2',
    5: '°C cards appear ×2',
    6: 'All cards ×3',
  },

  stageLabel: 'Lv',
  justLabel: 'Just',
  home: 'Home',
  targetLabel: 'TARGET',
  targetText: (p) => `Make P = ${p}`,
  duel: 'DUEL!',
  reroll: 'Redraw',
  handHint: 'Tap (or drag) a card to place it',
  tempLimit: 'Only one temperature card per duel',
  preview: (p) => `Preview: P → ${p}`,
  previewInvalid: 'Preview: goes out of range on the way',

  just: 'JUST!',
  miss: 'MISS',
  missResult: (p) => `Result: ${p}. Try again!`,
  ventilated: 'Vented! The cylinder is back to its starting state',
  rerolled: 'New hand dealt',

  mistakes: {
    inverse_v: 'Smaller volume means higher pressure (inverse proportion)',
    celsius: 'Always convert to K before taking temperature ratios',
    inverse_t: 'At constant volume, pressure is proportional to temperature',
    ignore_t: 'Multiply by both the volume ratio and the temperature ratio',
    calc: 'Write each ratio down, card by card, and multiply in order',
    range: 'The volume went out of range on the way. Check the order',
  },

  // ---- v0.3 Dojo ----
  dojo: 'Dojo',
  dojoDesc: 'Keep solving before the danger meter maxes out',
  best: (n) => `Best ${n}`,
  scoreLabel: 'Score',
  chainLabel: 'Chain',
  chainPop: (n) => `${n} CHAIN!`,
  smart: 'SMART!',
  speed: 'SPEED!',
  fever: 'FEVER!',
  superFever: 'SUPER FEVER!!',
  stageUp: (n) => `Level ${n}!`,
  targetStage: (n) => `TARGET · Lv ${n}`,
  dangerLabel: 'DANGER',
  chainLost: 'Chain lost… (next JUST within 20 s)',
  pauseTitle: 'Paused',
  resume: 'Resume',
  quit: 'Quit and see results',
  mute: 'Mute',
  unmute: 'Sound on',
  resultTitle: 'BURST!',
  resultQuit: 'Good work',
  newBest: 'New personal best!',
  resMaxChain: 'Max chain',
  resJusts: 'Justs',
  resSmart: 'Smart',
  resSpeed: 'Speed',
  resStage: 'Level reached',
  resTime: 'Time',
  resMistakes: 'Your misconceptions (only you can see this)',
  noMistakes: 'No misconceptions. Excellent!',
  retry: 'Play again',
  toHome: 'Home',
  times: (n) => `×${n}`,
  timeFmt: (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`,
  mistakeNames: {
    inverse_v: 'Inverted volume ratio',
    celsius: 'Left in °C',
    inverse_t: 'Inverted temperature ratio',
    ignore_t: 'Ignored temperature',
    calc: 'Arithmetic slip',
    range: 'Out of range (order)',
  },

  unitP: '×10⁵ Pa',
  unitV: 'L',
  unitT: 'K',
  approx: '≈',
};

const TEXTS = { ja: JA, en: EN };
export const LANGS = ['ja', 'en'];

export const TEXT = { ...JA };
let current = 'ja';

export function setLang(lang) {
  current = TEXTS[lang] ? lang : 'ja';
  for (const k of Object.keys(TEXT)) delete TEXT[k];
  Object.assign(TEXT, TEXTS[current]);
  return current;
}

export const getLang = () => current;

// 端末の言語から最初の言語を決める（日本語以外なら英語）
export function defaultLang() {
  try {
    const l = (navigator.language || 'ja').toLowerCase();
    return l.startsWith('ja') ? 'ja' : 'en';
  } catch (e) {
    return 'ja';
  }
}

// ---- 数値の表示 ----
// P は 0.1×10⁵ Pa を 1 とする分数、V は 0.5 L を 1 とする分数、T は K の分数

export function formatP(P) {
  const v = P.n / (P.d * 10);
  if (P.d === 1) return `${v.toFixed(1)}${TEXT.unitP}`;
  return `${TEXT.approx}${trimNum(v.toFixed(2))}${TEXT.unitP}`;
}

export function formatV(V) {
  const v = V.n / (V.d * 2);
  if (V.d === 1) return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${TEXT.unitV}`;
  return `${TEXT.approx}${trimNum(v.toFixed(2))} ${TEXT.unitV}`;
}

export function formatT(T) {
  const v = T.n / T.d;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${TEXT.unitT}`;
}

function trimNum(s) {
  return s.replace(/\.?0+$/, '');
}
