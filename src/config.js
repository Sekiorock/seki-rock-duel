// 調整用の数値はすべてここに集める（仕様書 0章-7）。
// この値は「初期値」。遊んでみて、ここだけを書き換えて調整する。

export const CONFIG = {
  // タイトル画面の下に出す版番号（13.3 の付け方に従う）
  VERSION: 'v0.2.1',

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
    CARD_FLY_MS: 220,      // カード1枚がボンベに吸い込まれる時間
    STEP_MS: 300,          // 1枚ぶんの変化（ピストン・温度・針）にかける時間
    STAMP_MS: 450,         // JUST! スタンプ
    RING_MS: 600,          // 光の輪が広がる時間
    MISS_HOLD_MS: 800,     // ハズレで止まってから元に戻り始めるまで
    MISS_BACK_MS: 450,     // ハズレで元の状態に戻る時間
    MISS_MSG_MS: 2000,     // 考え違いの一言を出しておく時間
    NOTICE_MS: 2200,       // 「換気」などのお知らせを出しておく時間
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
