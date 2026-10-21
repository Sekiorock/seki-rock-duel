// 調整用の数値はすべてここに集める（仕様書 0章-7）。
// この値は「初期値」。遊んでみて、ここだけを書き換えて調整する。

export const CONFIG = {
  // タイトル画面の下に出す版番号（13.3 の付け方に従う）
  VERSION: 'v0.5.0',

  // ---- ボンベの状態（4.1） ----
  // 圧力 P は 0.1×10⁵ Pa を 1 とする整数、体積 V は 0.5 L を 1 とする整数、温度 T は K の整数
  START_STATE: { P: 10, V: 12, T: 300 },     // 1.0×10⁵ Pa, 6.0 L, 300 K
  P_MIN: 5,                                   // 0.5×10⁵ Pa
  P_MAX: 90,                                  // 9.0×10⁵ Pa
  VOLUME_UNITS: [2, 3, 4, 6, 8, 9, 12, 18, 24], // 1.0, 1.5, 2.0, 3.0, 4.0, 4.5, 6.0, 9.0, 12 L
  TEMPS_K: [150, 200, 300, 400, 450, 600],
  KELVIN_OFFSET: 273,                         // 0℃ = 273 K

  // ---- カード（4.2） ----
  VMUL_FACTORS: [[2, 1], [3, 1], [1, 2], [1, 3], [3, 2], [2, 3]], // 体積カードの倍率 [分子, 分母]
  TEMP_TYPES: ['tset_k', 'tset_c'],   // 温度カード（1回のデュエルに1枚まで）
  MAX_TEMP_CARDS: 1,
  HAND_SIZE: 5,      // 手札の枚数
  FIELD_SIZE: 3,     // 場の枠の数（1回に出せる最大枚数）

  // ---- 難易度の段階（4.3） ----
  // patterns：正解の組み合わせの型と出やすさ（並び順は毎回ランダム）
  // decoys：おとりカードの種類と出やすさ
  // trapMin：考え違いで目標に届いてしまう出し方を、手札に最低いくつ作るか（おとりの量）
  STAGES: {
    1: { minCards: 1, patterns: [[['vmul'], 1]], decoys: [['vmul', 1]], trapMin: 0 },
    2: { minCards: 2, patterns: [[['vmul', 'vmul'], 1]], decoys: [['vmul', 1]], trapMin: 0 },
    3: {
      minCards: 1,
      patterns: [[['tset_k'], 3], [['vmul'], 2]],
      decoys: [['vmul', 2], ['tset_k', 2]],
      trapMin: 1,
    },
    4: {
      minCards: 2,
      patterns: [[['vmul', 'tset_k'], 1]],
      decoys: [['vmul', 2], ['tset_k', 2]],
      trapMin: 1,
    },
    5: {
      minCards: 2,
      patterns: [[['vmul', 'tset_c'], 3], [['vmul', 'tset_k'], 1]],
      decoys: [['vmul', 2], ['tset_k', 1], ['tset_c', 2]],
      trapMin: 2,
    },
    6: {
      minCards: 3,
      patterns: [
        [['vset', 'vmul', 'tset_c'], 2],
        [['vset', 'vmul', 'tset_k'], 1],
        [['vmul', 'vmul', 'tset_c'], 2],
        [['vmul', 'vmul', 'tset_k'], 1],
      ],
      decoys: [['vmul', 2], ['vset', 1], ['tset_k', 1], ['tset_c', 2]],
      trapMin: 2,
    },
  },
  AVAILABLE_STAGES: [1, 2, 3, 4, 5, 6],

  // ---- 問題の生成（4.4） ----
  MAX_ATTEMPTS: 200,  // この回数作り直してもだめなら「換気」して開始状態から作る
  COMBO_TRIES: 60,    // 正解の組み合わせを1つ作るときの試行回数

  // ---- 考え違い（4.5）。上にあるものを優先して推定する ----
  MISTAKE_MODELS: ['inverse_v', 'celsius', 'inverse_t', 'ignore_t'],
  MISTAKE_HISTORY: 20, // 直近何回のハズレを覚えておくか

  // ---- 演出の時間（ミリ秒、5.3） ----
  ANIM: {
    CARD_FLY_MS: 200,      // カード1枚がボンベに吸い込まれる時間
    STEP_MS: 240,          // 1枚ぶんの変化（ピストン・温度・針）にかける時間
    STAMP_MS: 380,         // JUST! スタンプ
    STAMP_STACK_MS: 90,    // スマート・スピードのスタンプが重なる間隔
    RING_MS: 600,          // 光の輪が広がる時間
    MISS_HOLD_MS: 800,     // ハズレで止まってから元に戻り始めるまで
    MISS_BACK_MS: 450,     // ハズレで元の状態に戻る時間
    MISS_MSG_MS: 2000,     // 考え違いの一言を出しておく時間
    NOTICE_MS: 2200,       // 「換気」などのお知らせを出しておく時間
    BANNER_MS: 1300,       // 「FEVER!」などの大きな文字
    BURST_MS: 1600,        // 破裂してから結果画面に進むまで
  },

  // ---- 補助ありのシャドウ（練習室） ----
  // 場に置いたカードを左から1枚ずつ試すように、半透明のピストン・針・温度計が動く
  SHADOW: {
    STEP_MS: 650,          // 1枚ぶんの変化にかける時間
    GAP_MS: 250,           // 次のカードに進むまでの間
    HOLD_MS: 1300,         // 最後の状態で止まっている時間
    RESET_MS: 350,         // 最初の状態に戻ってから、また始めるまで
    ALPHA: 0.5,            // 半透明の濃さ
  },

  // ---- 道場（5.2、3.4） ----
  DOJO: {
    START_STAGE: 1,
    JUSTS_PER_STAGE: 5,        // ジャスト5回ごとに段階が上がる
    METER_MAX: 100,            // 100 で破裂
    METER_JUST: -10,           // ジャスト
    METER_SMART: -5,           // スマート（さらに）
    METER_SPEED: -5,           // スピード（さらに）
    METER_MISS: 15,            // ハズレ
    METER_REROLL: 8,           // 引き直し
    // 自然上昇：+1 になるまでの時間（ミリ秒）。段階が上がるほど速い
    RISE_MS_BY_STAGE: { 1: 2200, 2: 1800, 3: 1500, 4: 1250, 5: 1000, 6: 850 },
    LATE_START_MS: 150000,     // 2分半を過ぎたら
    LATE_FACTOR_PER_MIN: 0.7,  // 1分ごとに、上昇の間隔を 0.7 倍にする（決着を促す）
    CHAIN_TIMEOUT_MS: 20000,   // 前のジャストから20秒で連鎖が切れる
    SPEED_MS: 10000,           // 目標が出てから10秒以内でスピード
    FEVER_EVERY: 5,            // 5連鎖ごとにフィーバー
    FEVER_MS: 20000,           // フィーバーの長さ
    FEVER_EXTEND_MS: 3000,     // フィーバー中のジャスト1回ごとの延長
    SUPER_EXTRA_CHAIN: 5,      // フィーバーが始まってから、さらに5連鎖で超フィーバー
    WARN_AT: 75,               // ここから鼓動の音、画面の縁の脈動、ボンベの震え
    TICK_MS: 100,              // 進行の計算の間隔
  },

  // ---- 得点（3.5） ----
  SCORE: {
    JUST: 100,
    SMART: 50,
    SPEED: 50,
    CHAIN_STEP: 0.1,           // 連鎖1につき +10%
    CHAIN_MAX_BONUS: 2.0,      // 最大 +200%
    FEVER_MULT: 2,
    SUPER_MULT: 3,
  },

  // ---- 段位（5.4）：10級〜1級、初段〜十段の全20段階 ----
  RANK: {
    COUNT: 20,
    EXP_BASE: 150,             // 次の段位までに必要な経験値 = EXP_BASE + EXP_STEP × 今の段位の番号
    EXP_STEP: 50,
    EXAM_JUSTS: 10,            // 昇段試験：10問連続ジャスト（ハズレ1回で不合格）
    // 昇段試験の問題の段階（受ける段位の番号 1〜19 ごと）
    EXAM_STAGE: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  },

  // ---- 経験値 ----
  EXP: {
    DOJO_PER_JUST: 10,
    DOJO_PER_CHAIN: 5,         // 最高連鎖 × 5
    DOJO_SCORE_DIV: 100,       // 得点 ÷ 100
    TA_PER_JUST: 8,
    DAILY_CLEAR: 50,
  },

  // ---- カードパック（5.4） ----
  PACK: {
    CARDS: 3,
    RARITY: { normal: 75, rare: 20, kimo: 5 },   // 出る割合（%）
    MIN_JUSTS: 1,              // 道場でこの回数以上ジャストすると、1パックもらえる
  },

  // ---- タイムアタック（5.1） ----
  TA: { TIME_MS: 60000, START_STAGE: 1, JUSTS_PER_STAGE: 5 },

  // ---- 今日の5問（5.1） ----
  DAILY: {
    COUNT: 5,
    STAGES: [2, 3, 4, 5, 6],   // 1問目〜5問目の段階
    TZ_OFFSET_MIN: 540,        // 日本時間（UTC+9）で日付を決める
  },

  // ---- 熟練度マップ：星の数 ----
  MASTERY: {
    MIN_TRIES: 5,              // これより少ないときは「—」
    STAR_RATES: [0.5, 0.65, 0.8, 0.9], // 正答率がこれ以上で星 2, 3, 4, 5
    SLOW_MS: 20000,            // 平均時間がこれより長いと星を1つ減らす
  },

  // ---- CPUの強さ（5.6） ----
  BOT: {
    LEVELS: {
      novice: { SOLVE_MS: [10000, 16000], ACCURACY: 0.7 },   // 見習い
      regular: { SOLVE_MS: [6000, 11000], ACCURACY: 0.85 },  // 一人前
      master: { SOLVE_MS: [3000, 7000], ACCURACY: 0.95 },    // 達人
    },
    // 問題の段階ごとに、解く時間に掛ける倍率（段階1〜6）
    // 仕様は「1段階ごとに10%長く」だが、人は2枚・3枚の問題で大きく時間がかかるので、それに合わせた
    STAGE_FACTOR: [1, 1.35, 1.3, 1.75, 2.1, 2.7],
  },

  // ---- ストーリー（5.5）。v0.5 は1〜4章。5章以降は v0.6〜v0.8 で追加する ----
  STORY: {
    CHAPTERS: [
      // level・speed：相手の強さ。学びながら勝てるよう、見習いから始めて章ごとに少しずつ速くする
      { id: 1, char: 'boyle', stages: [1, 2], need: 5, level: 'novice', speed: 0.95, trick: null },
      { id: 2, char: 'charles', stages: [3], need: 5, level: 'novice', speed: 0.9, trick: 'swap_target', trickMs: 26000 },
      { id: 3, char: 'kelvin', stages: [4], need: 5, level: 'regular', speed: 1.3, trick: 'frost', trickMs: 22000 },
      { id: 4, char: 'celsius', stages: [5], need: 7, level: 'regular', speed: 1.2, trick: 'to_celsius', trickMs: 18000 },
    ],
    // これから追加する章（単元全体の地図として、章の一覧に表示する）
    FUTURE: [
      { id: 5, char: null, ver: 'v0.6', pages: '44-45' },
      { id: 6, char: 'dalton', ver: 'v0.7', pages: '46-49' },
      { id: 7, char: 'vdw', ver: 'v0.8', pages: '50-53' },
      { id: 8, char: 'fahrenheit', ver: 'v0.8', pages: '' },
    ],
    STAGE_EVERY: 3,            // ジャスト3回ごとに、その章の次の段階へ
    RISE_SLOW: 1.6,            // 危険メーターの自然上昇を、道場よりゆっくりにする倍率
    LOSS_EASE: 0.25,           // 負けるたびに、相手の解く時間を25%ずつ長くする（最大4回分）
    LOSS_EASE_MAX: 4,
  },

  // ---- 音（9章） ----
  AUDIO: {
    MASTER: 0.32,              // 全体の音量（教室で何台も鳴るので控えめ）
    MUSIC: 0.55,               // 曲の音量
    SFX: 0.9,                  // 効果音の音量
    LOOKAHEAD_MS: 25,          // 25 ms ごとに
    SCHEDULE_AHEAD_S: 0.1,     // 0.1 秒先までの音を予約する
    PUMP_DEPTH: 0.55,          // バスドラムの瞬間に他の楽器を下げる量
    PUMP_RECOVER_S: 0.15,      // 戻るまでの時間
    MISS_MUFFLE_S: 0.5,        // ハズレで曲がこもる時間
    CHAIN_LAYERS: [0, 2, 4],   // この連鎖数で、和音・アルペジオが加わる
  },

  // ---- ボンベの中の気体の粒（見た目だけ。計算には使わない） ----
  GAS: {
    PARTICLES: 36,         // 粒の数（気体の量は一定）
    SPEED_AT_300K: 95,     // 300 K のときの速さ（px/秒）。速さは √T に比例させる
    RADIUS: 3.2,
    HIT_FLASH_MS: 180,     // 壁に当たったときの光が消えるまで
  },

  // ---- 圧力計の目盛り ----
  GAUGE_MAX: 90,   // 9.0×10⁵ Pa まで

  // ---- タッチ操作（10.4） ----
  DRAG_THRESHOLD_PX: 8,   // これ以上指が動いたら「ドラッグ」とみなす
  VIBRATE_TAP_MS: 10,
  VIBRATE_JUST: [18, 40, 18],
};
