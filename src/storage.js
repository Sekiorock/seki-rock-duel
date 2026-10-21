// localStorage の読み書き（11章）。使えない環境（プライベートブラウズなど）でも遊べるよう、必ず try/catch で囲む。
// データの形が変わる版では、migrate() で古い形から新しい形に変換し、記録が消えないようにする。

const PREFIX = 'srd.';
export const SCHEMA = 2; // v0.4 のデータの形

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (def, v) => ({ ...def, ...(isObj(v) ? v : {}) });

// ---- 古い形からの変換 ----
// v0.3 まで：srd.settings / srd.mistakes / srd.records（dojoBest, dojoMaxChain, dojoPlays）だけ。
// v0.4：srd.meta を足し、records に項目を足し、profile / collection / titles / mastery を作る。
export function migrate() {
  const meta = merge({ schema: 1 }, load('meta', {}));
  if (meta.schema >= SCHEMA) return false;
  // records：残っている値は消さず、足りない項目だけを足す
  const old = load('records', {});
  save('records', { ...DEFAULT_RECORDS, ...(isObj(old) ? old : {}), totals: { ...DEFAULT_TOTALS, ...((isObj(old) && isObj(old.totals)) ? old.totals : {}) } });
  if (!isObj(load('profile', null))) save('profile', { ...DEFAULT_PROFILE });
  if (!isObj(load('collection', null))) save('collection', { ...DEFAULT_COLLECTION });
  if (!isObj(load('titles', null))) save('titles', {});
  if (!isObj(load('mastery', null))) save('mastery', { cards: {}, traps: {} });
  if (!isObj(load('story', null))) save('story', { cleared: {}, friends: [] });
  save('meta', { schema: SCHEMA, migratedAt: Date.now() });
  return true;
}

// ---- 設定（srd.settings） ----
const DEFAULT_SETTINGS = { assist: false, lang: 'ja', muted: false };
export const loadSettings = () => merge(DEFAULT_SETTINGS, load('settings', {}));
export const saveSettings = (s) => save('settings', s);

// ---- 直近のハズレの考え違い（srd.mistakes） ----
export function recordMistake(id, max) {
  const list = load('mistakes', []);
  const arr = Array.isArray(list) ? list : [];
  arr.push(id);
  while (arr.length > max) arr.shift();
  save('mistakes', arr);
  return arr;
}

export function loadMistakes() {
  const list = load('mistakes', []);
  return Array.isArray(list) ? list : [];
}

// 直近で最も多かった考え違い（計算ミス・範囲外は除く）
export function favoriteMistake(models) {
  const counts = {};
  for (const id of loadMistakes()) if (models.includes(id)) counts[id] = (counts[id] || 0) + 1;
  let best = null;
  for (const id of models) if (counts[id] && (!best || counts[id] > counts[best])) best = id;
  return best;
}

// ---- 記録（srd.records）：自己ベスト、今日の5問、累計 ----
const DEFAULT_TOTALS = {
  justs: 0, smarts: 0, speeds: 0, tempJusts: 0, celsiusHighJusts: 0, fevers: 0,
  dailyDays: 0, packs: 0, coolGasMaxInMatch: 0,
};
const DEFAULT_RECORDS = {
  dojoBest: 0, dojoMaxChain: 0, dojoPlays: 0,
  taBest: 0, taPlays: 0,
  daily: {},            // { YYYYMMDD: { cards, timeMs, misses } }
  totals: { ...DEFAULT_TOTALS },
};

export function loadRecords() {
  const r = load('records', {});
  const out = merge(DEFAULT_RECORDS, r);
  out.totals = merge(DEFAULT_TOTALS, out.totals);
  out.daily = isObj(out.daily) ? out.daily : {};
  return out;
}
export const saveRecords = (r) => save('records', r);

// ---- プロフィール（srd.profile）：段位と経験値 ----
const DEFAULT_PROFILE = { nickname: '', char: 'boyle', rank: 0, exp: 0 };
export const loadProfile = () => merge(DEFAULT_PROFILE, load('profile', {}));
export const saveProfile = (p) => save('profile', p);

// ---- 集めたカード絵柄（srd.collection） ----
const DEFAULT_COLLECTION = { owned: {}, pending: 0, back: null, bombe: null };
export function loadCollection() {
  const c = merge(DEFAULT_COLLECTION, load('collection', {}));
  c.owned = isObj(c.owned) ? c.owned : {};
  return c;
}
export const saveCollection = (c) => save('collection', c);

// ---- 称号（srd.titles）：{ id: 獲得した時刻 } ----
export const loadTitles = () => merge({}, load('titles', {}));
export const saveTitles = (t) => save('titles', t);

// ---- 熟練度（srd.mastery） ----
// cards：カードの種類ごと { n: 使った回数, ok: 正解の回数, ms: 合計時間 }
// traps：考え違いの種類ごと { n: その罠がある問題を出した回数, ok: 見抜いた回数, ms: 合計時間 }
export function loadMastery() {
  const m = merge({ cards: {}, traps: {} }, load('mastery', {}));
  if (!isObj(m.cards)) m.cards = {};
  if (!isObj(m.traps)) m.traps = {};
  return m;
}
export const saveMastery = (m) => save('mastery', m);
