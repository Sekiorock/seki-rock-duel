// localStorage の読み書き。使えない環境（プライベートブラウズなど）でも遊べるよう、必ず try/catch で囲む。

const PREFIX = 'srd.';

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

// ---- 設定（srd.settings） ----
const DEFAULT_SETTINGS = { assist: false, lang: 'ja', muted: false };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function saveSettings(s) {
  save('settings', s);
}

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

// ---- 記録（srd.records） ----
const DEFAULT_RECORDS = { dojoBest: 0, dojoMaxChain: 0, dojoPlays: 0 };

export function loadRecords() {
  const r = load('records', {});
  return { ...DEFAULT_RECORDS, ...(r && typeof r === 'object' ? r : {}) };
}

// 道場の結果を記録する。自己ベストを更新したら true
export function recordDojo(summary) {
  const r = loadRecords();
  const newBest = summary.score > r.dojoBest;
  r.dojoBest = Math.max(r.dojoBest, summary.score);
  r.dojoMaxChain = Math.max(r.dojoMaxChain, summary.maxChain);
  r.dojoPlays += 1;
  save('records', r);
  return { newBest, records: r };
}
