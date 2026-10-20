// 画面の文言はすべてここに集める（将来の英語版に備える）。

export const TEXT = {
  title: 'セキオロックデュエル',
  titleEn: 'SEKIO ROCK DUEL',
  tagline: 'カードを組み合わせて、圧力をぴったり合わせろ！',
  playStage: (n) => `段階${n}で遊ぶ`,
  stageHint: {
    1: '体積カード1枚で合わせる',
    2: '体積カード2枚で合わせる',
  },
  tapToStart: 'ボタンを押してスタート',

  stageLabel: '段階',
  justLabel: 'ジャスト',
  home: 'ホームへ',
  targetLabel: '目標',
  targetText: (p) => `P を ${p} に`,
  duel: 'デュエル！',
  reroll: '引き直し',
  fieldEmpty: 'ここに置く',
  handHint: 'カードをタップ（またはドラッグ）して場に置こう',

  just: 'JUST!',
  miss: 'ハズレ',
  missResult: (p) => `結果は ${p}。もう一度！`,
  missInvalid: '途中で体積が使えない値になった。順番を見直そう',
  ventilated: '換気！ ボンベを最初の状態に戻したよ',
  rerolled: '手札を入れ替えた',

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
