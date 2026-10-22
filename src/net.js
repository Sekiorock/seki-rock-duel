// ライブ対戦の通信（仕様書7章。v1.0〜）。Firebase Realtime Database と匿名ログインを使う。
// Firebase の SDK は、みんなで対戦の画面を開いたときに初めて CDN から読み込む（ほかのモードでは読み込まない）。
//
// ★ 依頼者が書き換えるところ ★
// Firebase のコンソールで「ウェブアプリを追加」したときに出る設定値を、下の FIREBASE_CONFIG に貼り付ける。
// 手順は docs/FIREBASE_SETUP.md。null のままだと「まだ準備中」と表示する。
export const FIREBASE_CONFIG = null;
// 例：
// export const FIREBASE_CONFIG = {
//   apiKey: 'AIza....',
//   authDomain: 'seki-rock-duel.firebaseapp.com',
//   databaseURL: 'https://seki-rock-duel-default-rtdb.firebaseio.com',
//   projectId: 'seki-rock-duel',
//   appId: '1:1234567890:web:abcdef',
// };

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

// 動作確認用：URL に ?mock を付けると、Firebase の代わりに、この端末のブラウザの中だけで動く
// にせものの通信を使う（同じブラウザの別タブどうしで部屋に入れる）。授業では使わない
export const useMock = () => {
  try { return new URLSearchParams(location.search).has('mock'); } catch (e) { return false; }
};
export const netReady = () => !!FIREBASE_CONFIG || useMock();

let backend = null;
// 通信の準備（1回だけ）。うまくいけば backend を返す
export async function connect() {
  if (backend) return backend;
  const b = useMock() ? new MockBackend() : new FirebaseBackend(FIREBASE_CONFIG);
  await b.init();
  backend = b;
  return b;
}

// ---------- Firebase ----------
class FirebaseBackend {
  constructor(config) {
    if (!config) throw new Error('not_configured');
    this.config = config;
    this.offset = 0;
    this.connected = false;
  }

  async init() {
    const [A, U, D] = await Promise.all([
      import(`${SDK}firebase-app.js`),
      import(`${SDK}firebase-auth.js`),
      import(`${SDK}firebase-database.js`),
    ]);
    this.D = D;
    const app = A.initializeApp(this.config);
    const auth = U.getAuth(app);
    const cred = await U.signInAnonymously(auth);
    this.uid = cred.user.uid;
    this.db = D.getDatabase(app);
    D.onValue(D.ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
    D.onValue(D.ref(this.db, '.info/connected'), (s) => { this.connected = !!s.val(); if (this.onConn) this.onConn(this.connected); });
  }

  r(path) { return this.D.ref(this.db, path); }
  ts() { return this.D.serverTimestamp(); }
  serverNow() { return Date.now() + this.offset; }
  async get(path) { const s = await this.D.get(this.r(path)); return s.exists() ? s.val() : null; }
  set(path, v) { return this.D.set(this.r(path), v); }
  update(path, obj) { return this.D.update(this.r(path), obj); }
  remove(path) { return this.D.remove(this.r(path)); }
  push(path, v) { return this.D.push(this.r(path), v); }
  on(path, cb) { return this.D.onValue(this.r(path), (s) => cb(s.exists() ? s.val() : null)); }
  onAdded(path, cb) { return this.D.onChildAdded(this.r(path), (s) => cb(s.key, s.val())); }
  onDisconnectUpdate(path, obj) { return this.D.onDisconnect(this.r(path)).update(obj); }
  cancelDisconnect(path) { return this.D.onDisconnect(this.r(path)).cancel(); }
}

// ---------- にせものの通信（動作確認用。localStorage を共有のデータベースにする） ----------
const MOCK_KEY = 'srd.mockdb';
const isTs = (v) => v && typeof v === 'object' && v['.sv'] === 'timestamp';
function resolveTs(v) {
  if (isTs(v)) return Date.now();
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const x = resolveTs(v[k]); if (x !== null && x !== undefined) o[k] = x; } return Object.keys(o).length ? o : null; }
  return v;
}
const parts = (path) => path.split('/').filter(Boolean);

class MockBackend {
  async init() {
    let uid = null;
    try { uid = sessionStorage.getItem('srd.mockuid'); } catch (e) { /* なし */ }
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('srd.mockuid', uid); } catch (e) { /* なし */ } }
    this.uid = uid;
    this.offset = 0;
    this.connected = true;
    this.listeners = [];
    this.disc = [];
    window.addEventListener('storage', (e) => { if (e.key === MOCK_KEY) this._fire(); });
    window.addEventListener('pagehide', () => { this.disc.forEach(([p, o]) => this._write((root) => this._merge(root, p, o))); });
  }

  _root() { try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || {}; } catch (e) { return {}; } }
  _at(root, path) { let n = root; for (const k of parts(path)) { if (!n || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; }
  _put(root, path, v) {
    const ks = parts(path);
    let n = root;
    for (let i = 0; i < ks.length - 1; i++) { if (!n[ks[i]] || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
    if (v === null || v === undefined) delete n[ks[ks.length - 1]];
    else n[ks[ks.length - 1]] = v;
  }
  _merge(root, path, obj) { for (const k of Object.keys(obj)) this._put(root, `${path}/${k}`, resolveTs(obj[k])); }
  _write(fn) { const root = this._root(); fn(root); localStorage.setItem(MOCK_KEY, JSON.stringify(root)); this._fire(); }
  _fire() {
    const root = this._root();
    for (const l of this.listeners) {
      const v = this._at(root, l.path);
      if (l.added) {
        const keys = v && typeof v === 'object' ? Object.keys(v) : [];
        keys.forEach((k) => { if (!l.seen.has(k)) { l.seen.add(k); l.cb(k, v[k]); } });
      } else {
        const j = JSON.stringify(v);
        if (j !== l.last) { l.last = j; l.cb(v === undefined ? null : JSON.parse(j)); }
      }
    }
  }

  ts() { return { '.sv': 'timestamp' }; }
  serverNow() { return Date.now(); }
  async get(path) { const v = this._at(this._root(), path); return v === undefined ? null : v; }
  async set(path, v) { this._write((root) => this._put(root, path, resolveTs(v))); }
  async update(path, obj) { this._write((root) => this._merge(root, path, obj)); }
  async remove(path) { this._write((root) => this._put(root, path, null)); }
  async push(path, v) { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await this.set(`${path}/${id}`, v); return { key: id }; }
  on(path, cb) {
    const l = { path, cb, last: undefined };
    this.listeners.push(l);
    setTimeout(() => { const v = this._at(this._root(), path); l.last = JSON.stringify(v); cb(v === undefined ? null : v); }, 0);
    return () => { this.listeners = this.listeners.filter((x) => x !== l); };
  }
  onAdded(path, cb) {
    const l = { path, cb, added: true, seen: new Set() };
    this.listeners.push(l);
    setTimeout(() => this._fire(), 0);
    return () => { this.listeners = this.listeners.filter((x) => x !== l); };
  }
  async onDisconnectUpdate(path, obj) { this.disc = this.disc.filter(([p]) => p !== path); this.disc.push([path, obj]); }
  async cancelDisconnect(path) { this.disc = this.disc.filter(([p]) => p !== path); }
}
