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

  // ---- v0.4 ----
  ta: 'タイムアタック',
  taDesc: '60秒で何回ジャストできるか',
  daily: '今日の5問',
  dailyDesc: '全員が同じ5問',
  collection: '図鑑',
  collectionDesc: '集めた絵柄を眺める',
  records: '記録',
  recordsDesc: '段位・熟練度・称号',
  locked: 'まず道場で1回遊ぼう',
  packsWaiting: (n) => `未開封のパック ${n}`,
  examReady: '昇段試験に挑戦できます！',
  ranks: ['10級','9級','8級','7級','6級','5級','4級','3級','2級','1級','初段','二段','三段','四段','五段','六段','七段','八段','九段','十段'],
  rankLabel: '段位',
  expLabel: '経験値',
  expGain: (n) => `+${n}`,
  nextRank: (have, need) => `次の段位まで ${have} / ${need}`,
  rankMax: '最高の段位です',
  examTake: '昇段試験を受ける',
  examRule: (name, stage, n) => `段階${stage}の問題を${n}問連続でジャストすると、${name}に昇段。ハズレ1回で不合格（何度でも挑戦できます）`,
  examHud: '試験',
  examTitleHud: (name) => `昇段試験 · ${name}`,
  examPass: '合格！',
  examPassDetail: (name) => `${name}に昇段しました`,
  examFail: '不合格…',
  examFailDetail: (n, total) => `${n} / ${total} 問連続ジャスト。何度でも挑戦できます`,
  examRetry: 'もう一度受ける',
  taTimeLabel: '残り',
  taResultTitle: 'タイムアップ！',
  taCount: 'ジャスト回数',
  dailyHud: '問題',
  dailyCards: '合計枚数',
  dailyTime: '合計時間',
  dailyClear: '今日の5問 クリア！',
  dailyQuit: '今日の5問',
  dailyNoReroll: '今日の5問では引き直しはできません',
  dailyRecord: (cards, time) => `今日の記録：${cards}枚・${time}`,
  dailyNotYet: 'まだ挑戦していません',
  dailyBetter: '今日の記録を更新！',
  resExp: '獲得経験値',
  resMisses: 'ハズレ',
  openPack: 'パックを開ける',
  packTitle: 'カードパック',
  tapToOpen: 'カードをタップしてめくろう',
  openAll: 'まとめてめくる',
  packFree: 'ゲーム内の報酬だけで、お金は一切かかりません',
  packNext: 'つぎへ',
  rarity: { normal: 'ノーマル', rare: 'レア', kimo: 'キモレア' },
  newCard: 'NEW!',
  owned: (n, total) => `${n} / ${total} 種類`,
  unknownArt: '？？？',
  setBack: 'カードの裏面にする',
  setBombe: 'ボンベに貼る',
  removeBack: '裏面から外す',
  removeBombe: 'ボンベからはがす',
  inUse: '使用中',
  countCards: (n) => `${n}枚`,
  close: 'とじる',
  bestsTitle: '自己ベスト',
  bestDojo: '道場の得点',
  bestChain: '道場の最高連鎖',
  bestTA: 'タイムアタック',
  bestDaily: '今日の5問（今日）',
  masteryTitle: '熟練度マップ',
  masteryCards: 'カードの種類',
  masteryTraps: '考え違いの罠を見抜く',
  masteryNote: '星は正答率と平均時間から決まります（5回以上で表示）',
  masteryLine: (rate, sec, n) => `正答率 ${rate}%・平均 ${sec}秒・${n}回`,
  masteryNone: 'まだデータがありません',
  masteryMore: (n) => `あと${n}回で星を表示`,
  cardNames: { vmul: '体積カード', vset: '体積指定カード', tset_k: '温度カード（K）', tset_c: '温度カード（℃）' },
  titlesTitle: '称号',
  newTitle: (name) => `称号「${name}」を獲得！`,
  titleNames: {
    first_step: 'はじめの一歩', trap_seer: '罠見抜き', kelvin_user: 'ケルビン使い', minimalist: '最短の美学',
    lightning: '電光石火', chain_child: '連鎖の申し子', fever_regular: 'フィーバー常連', dojo_master: '道場の主',
    daily_three: '日々の積み重ね', collector: '図鑑コレクター', shodan: '初段', cooling_master: '冷却の達人',
  },
  titleConds: {
    first_step: '初めてジャストする', trap_seer: '段階5以上で、℃カードを含む問題を20回ジャスト',
    kelvin_user: '温度カードを100回正しく使う', minimalist: 'スマートを50回', lightning: 'スピードを50回',
    chain_child: '道場で15連鎖', fever_regular: 'フィーバーに10回入る', dojo_master: '道場で10,000点',
    daily_three: '今日の5問を3日クリア', collector: '絵柄を20種類集める', shodan: '初段に昇段する',
    cooling_master: '対戦で冷却ガスを1試合10回（対戦は v0.6 から）',
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

  // ---- v0.4 ----
  ta: 'Time Attack',
  taDesc: 'How many JUSTs in 60 seconds?',
  daily: 'Daily Five',
  dailyDesc: 'Same 5 problems for everyone',
  collection: 'Gallery',
  collectionDesc: 'Your collected card art',
  records: 'Records',
  recordsDesc: 'Rank, mastery, titles',
  locked: 'Play the Dojo once to unlock',
  packsWaiting: (n) => `Unopened packs: ${n}`,
  examReady: 'Promotion exam available!',
  ranks: ['10th kyu','9th kyu','8th kyu','7th kyu','6th kyu','5th kyu','4th kyu','3rd kyu','2nd kyu','1st kyu','1st dan','2nd dan','3rd dan','4th dan','5th dan','6th dan','7th dan','8th dan','9th dan','10th dan'],
  rankLabel: 'Rank',
  expLabel: 'EXP',
  expGain: (n) => `+${n}`,
  nextRank: (have, need) => `To next rank: ${have} / ${need}`,
  rankMax: 'Highest rank reached',
  examTake: 'Take the promotion exam',
  examRule: (name, stage, n) => `Get ${n} JUSTs in a row on Level ${stage} problems to reach ${name}. One miss and you fail (retry anytime)`,
  examHud: 'Exam',
  examTitleHud: (name) => `EXAM · ${name}`,
  examPass: 'PASSED!',
  examPassDetail: (name) => `Promoted to ${name}`,
  examFail: 'Not this time…',
  examFailDetail: (n, total) => `${n} / ${total} JUSTs in a row. Try again anytime`,
  examRetry: 'Retake exam',
  taTimeLabel: 'Left',
  taResultTitle: 'TIME UP!',
  taCount: 'JUSTs',
  dailyHud: 'Problem',
  dailyCards: 'Total cards',
  dailyTime: 'Total time',
  dailyClear: 'Daily Five cleared!',
  dailyQuit: 'Daily Five',
  dailyNoReroll: 'No redraws in the Daily Five',
  dailyRecord: (cards, time) => `Today: ${cards} cards · ${time}`,
  dailyNotYet: 'Not tried yet today',
  dailyBetter: "New best for today!",
  resExp: 'EXP gained',
  resMisses: 'Misses',
  openPack: 'Open a pack',
  packTitle: 'Card Pack',
  tapToOpen: 'Tap a card to flip it',
  openAll: 'Flip all',
  packFree: 'In-game rewards only — never costs money',
  packNext: 'Next',
  rarity: { normal: 'Normal', rare: 'Rare', kimo: 'Kimo-Rare' },
  newCard: 'NEW!',
  owned: (n, total) => `${n} / ${total} designs`,
  unknownArt: '???',
  setBack: 'Use as card back',
  setBombe: 'Stick on cylinder',
  removeBack: 'Remove from card back',
  removeBombe: 'Peel off cylinder',
  inUse: 'In use',
  countCards: (n) => `×${n}`,
  close: 'Close',
  bestsTitle: 'Personal bests',
  bestDojo: 'Dojo score',
  bestChain: 'Dojo max chain',
  bestTA: 'Time Attack',
  bestDaily: 'Daily Five (today)',
  masteryTitle: 'Mastery map',
  masteryCards: 'Card types',
  masteryTraps: 'Seeing through traps',
  masteryNote: 'Stars come from accuracy and average time (shown after 5 tries)',
  masteryLine: (rate, sec, n) => `${rate}% correct · avg ${sec} s · ${n} tries`,
  masteryNone: 'No data yet',
  masteryMore: (n) => `${n} more to rate`,
  cardNames: { vmul: 'Volume card', vset: 'Set-volume card', tset_k: 'Temp card (K)', tset_c: 'Temp card (°C)' },
  titlesTitle: 'Titles',
  newTitle: (name) => `Title earned: “${name}”`,
  titleNames: {
    first_step: 'First Step', trap_seer: 'Trap Seer', kelvin_user: 'Kelvin User', minimalist: 'Minimalist',
    lightning: 'Lightning', chain_child: 'Child of Chains', fever_regular: 'Fever Regular', dojo_master: 'Dojo Master',
    daily_three: 'Day by Day', collector: 'Collector', shodan: 'Shodan', cooling_master: 'Cooling Master',
  },
  titleConds: {
    first_step: 'Get your first JUST', trap_seer: '20 JUSTs on Level 5+ problems with °C cards',
    kelvin_user: 'Use temperature cards correctly 100 times', minimalist: '50 Smarts', lightning: '50 Speeds',
    chain_child: '15 chain in the Dojo', fever_regular: 'Enter Fever 10 times', dojo_master: '10,000 points in the Dojo',
    daily_three: 'Clear the Daily Five on 3 days', collector: 'Collect 20 designs', shodan: 'Reach 1st dan',
    cooling_master: 'Send cooling gas 10 times in one battle (battles from v0.6)',
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
