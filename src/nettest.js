// 接続テストのページ（test.html）。校内 Wi-Fi で Firebase に届くか、どのくらい遅れるかを確かめる。
import { CONFIG } from './config.js?v=1.1.0';
import { TEXT, setLang, getLang, LANGS, defaultLang } from './text.js?v=1.1.0';
import { connect, netReady } from './net.js?v=1.1.0';
import { loadSettings, saveSettings } from './storage.js?v=1.1.0';

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
setLang(settings.lang || defaultLang());
let rows = [];   // [key, value]
let verdict = '';

function render() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-t]').forEach((el) => { const v = TEXT[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  document.querySelectorAll('[data-lang-toggle] [data-l]').forEach((sp) => sp.classList.toggle('on', sp.dataset.l === getLang()));
  $('test-rows').innerHTML = rows.map(([k, v]) => `<div><span>${TEXT.testSteps[k] || k}</span><b>${typeof v === 'function' ? v() : v}</b></div>`).join('');
  $('test-verdict').textContent = typeof verdict === 'function' ? verdict() : verdict;
  $('version').textContent = CONFIG.VERSION;
}

document.querySelectorAll('[data-lang-toggle]').forEach((b) => b.addEventListener('click', () => {
  const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
  settings.lang = setLang(next);
  saveSettings(settings);
  render();
}));

$('btn-test').addEventListener('click', async () => {
  $('btn-test').disabled = true;
  rows = [];
  verdict = '';
  if (!netReady()) { verdict = () => TEXT.testNotReady; render(); $('btn-test').disabled = false; return; }
  try {
    const t0 = performance.now();
    rows.push(['sdk', '…']); render();
    const net = await connect();
    const t1 = performance.now();
    rows = [['sdk', () => TEXT.testMs(Math.round(t1 - t0))], ['auth', 'OK']];
    await new Promise((r) => setTimeout(r, 600)); // サーバーとの時計の差が届くのを待つ
    rows.push(['offset', () => TEXT.testMs(Math.round(net.offset))]);
    render();
    // 書き込んでから、読み出しの通知が届くまで（5回）
    const path = `tests/${net.uid}`;
    const times = [];
    for (let i = 0; i < 5; i++) {
      const ms = await new Promise((resolve) => {
        const start = performance.now();
        let off = null;
        const token = `${Date.now()}-${i}`;
        off = net.on(path, (v) => {
          if (v && v.token === token) { if (off) off(); resolve(performance.now() - start); }
        });
        net.set(path, { token, t: net.ts() });
      });
      times.push(Math.round(ms));
      rows[3] = ['rtt', times.map((x) => `${x}`).join(' / ') + ' ms'];
      render();
    }
    await net.remove(path).catch(() => {});
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = Math.max(...times);
    rows[3] = ['rtt', () => TEXT.testAvg(avg, max)];
    verdict = () => (avg <= 500 ? TEXT.testOk : TEXT.testSlow);
  } catch (e) {
    const msg = String((e && (e.code || e.message)) || e);
    verdict = () => TEXT.testFail(msg);
  }
  render();
  $('btn-test').disabled = false;
});

render();
