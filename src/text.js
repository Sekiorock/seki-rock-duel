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
  assistHint: '補助あり：カードを置くと、出したときの変化を点線で予告します',
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
  assistHint: 'Assist ON: when you place cards, a dotted line previews what will happen',
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
