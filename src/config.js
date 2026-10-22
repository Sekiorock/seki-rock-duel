// 調整用の数値はすべてここに集める（仕様書 0章-7）。
// この値は「初期値」。遊んでみて、ここだけを書き換えて調整する。

export const CONFIG = {
  // タイトル画面の下に出す版番号（13.3 の付け方に従う）
  VERSION: 'v0.9.0',

  // 「友だちにすすめる」の QR コードが指す URL（QR の画像 assets/qr.svg と同じ）
  SHARE_URL: 'https://sekiorock.github.io/seki-rock-duel/',

  // ---- ボンベの状態（4.1） ----
  // 圧力 P は 0.1×10⁵ Pa を 1 とする整数、体積 V は 0.5 L を 1 とする整数、温度 T は K の整数
  START_STATE: { P: 10, V: 12, T: 300, N: 6 }, // 1.0×10⁵ Pa, 6.0 L, 300 K、物質量は 6（相対の値）
  P_MIN: 5,                                   // 0.5×10⁵ Pa
  P_MAX: 90,                                  // 9.0×10⁵ Pa
  VOLUME_UNITS: [2, 3, 4, 6, 8, 9, 12, 18, 24], // 1.0, 1.5, 2.0, 3.0, 4.0, 4.5, 6.0, 9.0, 12 L
  TEMPS_K: [150, 200, 300, 400, 450, 600],
  KELVIN_OFFSET: 273,                         // 0℃ = 273 K
  MOL_UNITS: [2, 3, 4, 6, 8, 9, 12, 18],      // 物質量の取りうる値（開始時 6 に対して 1/3〜3 倍）
  NMUL_FACTORS: [[2, 1], [3, 1], [1, 2], [1, 3], [3, 2], [2, 3]], // 物質量カードの倍率
  GAS_R: 8.3e3,                               // 気体定数 R [Pa·L/(mol·K)]（教科書の問題と同じ有効数字2桁）

  // ---- 混合気体（v0.7〜） ----
  // ボンベに2種類の気体 A（窒素 N₂）と B（酸素 O₂）を入れる。A・B は物質量（相対の値）で、N = A + B
  // 開始は空気と同じ N₂:O₂ = 4:1。全圧 1.0×10⁵ Pa → 分圧 N₂ 0.8×10⁵ Pa、O₂ 0.2×10⁵ Pa
  MIX: {
    START: { P: 10, V: 12, T: 300, A: 4, B: 1 },
    UNITS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // A・B それぞれの取りうる値
    ADD_K: [1, 2, 3, 4],                            // 混ぜるカードで入れる量
    PART_MIN: 2,                                    // 分圧の目標の下限（0.2×10⁵ Pa）
    REFILL_AT: 12,                                  // 物質量の和がこれを超えたら、換気して空気に戻す（混ぜると増える一方なので）
  },

  // ---- カード（4.2） ----
  VMUL_FACTORS: [[2, 1], [3, 1], [1, 2], [1, 3], [3, 2], [2, 3]], // 体積カードの倍率 [分子, 分母]
  TEMP_TYPES: ['tset_k', 'tset_c', 'tset_f'],   // 温度カード（1回のデュエルに1枚まで）。tset_f は隠し章の℉カード
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
    // v0.6：物質量カード（pV = nRT）
    7: {
      minCards: 2,
      patterns: [
        [['nmul', 'vmul'], 2],
        [['nmul', 'tset_k'], 2],
        [['nmul', 'tset_c'], 1],
      ],
      decoys: [['nmul', 2], ['vmul', 2], ['tset_k', 1], ['tset_c', 1]],
      trapMin: 2,
    },
    // v0.7：混合気体。goals は目標の種類と出やすさ（P：全圧、A：N₂の分圧、B：O₂の分圧）
    8: {
      minCards: 1,
      mix: true,
      goals: [['P', 1], ['A', 1], ['B', 2]],
      patterns: [[['add'], 3], [['vmul'], 1]],
      decoys: [['add', 3], ['vmul', 1]],
      trapMin: 1,
    },
    9: {
      minCards: 2,
      mix: true,
      goals: [['P', 1], ['A', 1], ['B', 1]],
      patterns: [[['add', 'vmul'], 3], [['add', 'add'], 2], [['add', 'tset_k'], 2]],
      decoys: [['add', 3], ['vmul', 2], ['tset_k', 1]],
      trapMin: 2,
    },
    // v0.8：隠し章の℉カード（教科書の範囲外のおまけ）。練習室では隠し章をクリアすると出てくる
    10: {
      minCards: 2,
      patterns: [[['vmul', 'tset_f'], 3], [['vmul', 'tset_k'], 1]],
      decoys: [['vmul', 2], ['tset_f', 2], ['tset_c', 1]],
      trapMin: 2,
    },
  },
  AVAILABLE_STAGES: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  HIDDEN_STAGE: 10,
  MAX_DOJO_STAGE: 9,          // 道場・タイムアタックで上がっていく段階の上限（v0.8 から物質量カード・混合気体まで）

  // ---- 問題の生成（4.4） ----
  MAX_ATTEMPTS: 200,  // この回数作り直してもだめなら「換気」して開始状態から作る
  COMBO_TRIES: 60,    // 正解の組み合わせを1つ作るときの試行回数

  // ---- 考え違い（4.5）。上にあるものを優先して推定する ----
  MISTAKE_MODELS: ['inverse_v', 'celsius', 'inverse_t', 'ignore_t', 'inverse_n', 'partial_total', 'fixed_total', 'fahrenheit'],
  // partial_total：分圧を全圧と取り違える　fixed_total：気体を混ぜても全圧は変わらないと考える（v0.7）
  // fahrenheit：℉の数を℃だと思って 273 を足す（v0.8、隠し章）
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
    RISE_MS_BY_STAGE: { 1: 2200, 2: 1800, 3: 1500, 4: 1250, 5: 1000, 6: 850, 7: 1100, 8: 1100, 9: 900, 10: 1000 },
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
    EXAM_STAGE: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 8, 9, 9, 9], // v0.8：高い段位は物質量・混合気体も
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
    STAGE_FACTOR: [1, 1.35, 1.3, 1.75, 2.1, 2.7, 1.9, 1.5, 1.9, 2.3],
  },

  // ---- ストーリー（5.5）。v0.5 は1〜4章。5章以降は v0.6〜v0.8 で追加する ----
  STORY: {
    CHAPTERS: [
      // level・speed：相手の強さ。学びながら勝てるよう、見習いから始めて章ごとに少しずつ速くする
      { id: 1, char: 'boyle', stages: [1, 2], need: 5, level: 'novice', speed: 0.95, trick: null },
      { id: 2, char: 'charles', stages: [3], need: 5, level: 'novice', speed: 0.9, trick: 'swap_target', trickMs: 26000 },
      { id: 3, char: 'kelvin', stages: [4], need: 5, level: 'regular', speed: 1.3, trick: 'frost', trickMs: 22000 },
      { id: 4, char: 'celsius', stages: [5], need: 7, level: 'regular', speed: 1.2, trick: 'to_celsius', trickMs: 18000 },
      { id: 5, char: 'avogadro', stages: [7], need: 5, level: 'regular', speed: 1.2, trick: 'leak', trickMs: 24000 },
      { id: 6, char: 'dalton', stages: [8, 9], need: 6, level: 'regular', speed: 1.15, trick: 'mix_in', trickMs: 22000 },
      // 7章は総復習（理想気体のカードすべて）。相手の技は「Z≠1カード」（実在気体のずれ）
      { id: 7, char: 'vdw', stages: [6, 7], need: 6, level: 'regular', speed: 1.4, trick: 'real_gas', trickMs: 22000, riseSlow: 2.6 }, // 3枚の問題があるので、危険メーターをゆっくりに
      // 隠し章：総まとめ試験を受けると開く（教科書の範囲外のおまけ）
      { id: 8, char: 'fahrenheit', stages: [10], need: 5, level: 'regular', speed: 1.35, trick: 'to_fahrenheit', trickMs: 20000, hidden: true },
    ],
    // これから追加する章（単元全体の地図として、章の一覧に表示する）
    FUTURE: [],
    // 総まとめ試験（v0.8）：7章をクリアすると受けられる。デュエル10問 ＋ 確認問題10問 = 100点
    FINAL: {
      STAGES: [2, 3, 4, 5, 6, 6, 7, 7, 8, 9], // デュエルの問題の段階（この順に出す）
      QUIZ: 10,              // 確認問題の数（1〜7章から1問ずつ ＋ 分子量の鑑定 ＋ Z判定 ＋ もう1問）
      DUEL_FIRST: 5,         // デュエル：1回目でジャスト
      DUEL_LATER: 3,         // デュエル：ハズレのあとでジャスト
      QUIZ_FIRST: 5,         // 確認問題：1回目で正解
      QUIZ_LATER: 2,         // 確認問題：まちがえたあとで正解
      GRADES: [[90, 'S'], [75, 'A'], [60, 'B'], [0, 'C']],
    },
    STAGE_EVERY: 3,            // ジャスト3回ごとに、その章の次の段階へ
    RISE_SLOW: 1.6,            // 危険メーターの自然上昇を、道場よりゆっくりにする倍率
    LOSS_EASE: 0.25,           // 負けるたびに、相手の解く時間を25%ずつ長くする（最大4回分）
    LOSS_EASE_MAX: 4,
  },

  // ---- ひとり対戦（CPU戦、6章のルール。v0.9） ----
  BATTLE: {
    OPPONENTS: [11, 39],          // CPU の数（自分を入れて12人・40人）
    COUNTDOWN_MS: 3000,
    // 強さの混ぜ方（5.6）：選んだ強さを中心に、1つ下と1つ上を混ぜる（下：中：上）
    MIX: { 11: [3, 5, 3], 39: [11, 17, 11] },
    // 熱波（6.2）
    HEAT_JUST: 1,
    HEAT_CHAIN: [[2, 1], [4, 2], [7, 3]], // [この連鎖目から, 足す熱波]
    HEAT_SMART: 1,
    HEAT_SPEED: 1,
    VALVE_STEP: 0.25,             // バルブ1つにつき ×(1 + 0.25)
    VALVE_MAX_MULT: 2,
    // 着弾待ちと相殺（6.3）
    LAND_MS: 5000,                // 届いてから着弾までの時間
    METER_PER_HEAT: 5,            // 熱波1につき危険メーター +5
    JAM_AT: 3,                    // 一度にこれ以上着弾すると、手札1枚がおじゃまカードに
    BOT_JAM_MS: 2500,             // CPU がおじゃまを受けたときに遅れる時間
    // 攻撃先（6.5）
    RANDOM_REPICK_MS: 2000,
    FINISH_MIN: 20,               // 「トドメ」は、最も高い人の危険メーターがこれ未満ならランダムにする
    // 冷却係（6.7）
    COOL_METER: -8,
    COOL_LIMIT: 3,                // 1人が受け取れる冷却ガスは
    COOL_WINDOW_MS: 10000,        // 10秒間に3回まで
    // 試合の流れ（6.8）：[この時刻（ミリ秒）から, 問題の段階, 自然上昇の間隔（ミリ秒）]
    PHASES: {
      // 4分・5分を過ぎたら、さらに速くする（冷却係が多いと決着がつかなくなるので。仕様書にない追加）
      basic: [[0, [1, 2], 3000], [60000, [3, 4], 2000], [120000, [5, 6], 1000], [180000, [5, 6], 500], [240000, [5, 6], 250], [300000, [5, 6], 120]],
      // 全部のカード：物質量（段階7）と混合気体（段階8・9）も出る
      all: [[0, [1, 2], 3000], [60000, [3, 4, 5], 2000], [120000, [6, 7], 1000], [180000, [8, 9], 500], [240000, [8, 9], 250], [300000, [8, 9], 120]],
    },
    METER_JUST: -10,              // ジャストで危険メーターが下がる量（道場と同じ）
    METER_MISS: 10,
    METER_REROLL: 8,
    SPEED_MS: 10000,
    CHAIN_TIMEOUT_MS: 20000,
    BOT_SMART_RATE: { novice: 0.4, regular: 0.6, master: 0.8 }, // CPU のジャストがスマートになる割合
    BOT_SPEED_RATE: { novice: 0.05, regular: 0.3, master: 0.7 }, // スピード（10秒以内）になる割合
    BOT_COUNTER_RATE: 0.5,        // 一人前が「反撃」を選ぶ割合
    FAST_FORWARD_MS: 250,         // 自分が破裂したあと「結果へ」で、1回に進める時間
    EXP_PER_JUST: 8,
    EXP_PER_RANK: 6,              // (人数 − 順位) × 6
    EXP_WIN: 80,
    UNLOCK_CHAPTER: 1,            // ストーリー1章をクリアすると遊べる
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
