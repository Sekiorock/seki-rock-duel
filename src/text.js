// 画面の文言はすべてここに集める（将来の英語版に備える）。

export const TEXT = {
  title: 'セキオロックデュエル',
  titleEn: 'SEKIO ROCK DUEL',
  tagline: 'カードを組み合わせて、圧力をぴったり合わせろ！',
  practice: '練習室',
  practiceDesc: '段階を選んで、じっくり解く',
  back: 'もどる',

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
  missInvalid: '途中で体積が使えない値になった。順番を見直そう',
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

  // 表示用の単位
  unitP: '×10⁵ Pa',
  unitV: 'L',
  unitT: 'K',
  approx: '約',
};

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
