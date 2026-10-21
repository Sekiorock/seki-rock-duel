// 絵柄の描画（Canvas で手描き）。画像ファイルは使わない。色は白・ネイビー・青の濃淡だけ。
// v0.4：カードパックの絵柄（気体・器具・グラフのモチーフ）。
// v0.5 で、ここにキャラクター（7人の気体の精）の描画と表情を足し、絵柄にもキャラクターを加える。

const NAVY = '#1B2A49';
const BLUE = '#2F6FED';
const PALE = '#DCE7FD';
const WHITE = '#FFFFFF';
const MID = '#7FA3F2';

// ---- 絵柄の一覧 ----
// rarity：normal（ノーマル）/ rare（レア）/ kimo（キモレア）
export const ARTS = [
  { id: 'piston', rarity: 'normal', ja: 'ピストン', en: 'Piston' },
  { id: 'thermo', rarity: 'normal', ja: '温度計', en: 'Thermometer' },
  { id: 'gauge', rarity: 'normal', ja: '圧力計', en: 'Pressure Gauge' },
  { id: 'dance', rarity: 'normal', ja: '分子のダンス', en: 'Molecule Dance' },
  { id: 'balloon', rarity: 'normal', ja: '熱気球', en: 'Hot-air Balloon' },
  { id: 'frost', rarity: 'normal', ja: '霜の結晶', en: 'Frost Crystal' },
  { id: 'flask', rarity: 'normal', ja: 'フラスコ', en: 'Flask' },
  { id: 'bubbles', rarity: 'normal', ja: '泡', en: 'Bubbles' },
  { id: 'wave', rarity: 'normal', ja: '圧力の波', en: 'Pressure Wave' },
  { id: 'arrows', rarity: 'normal', ja: '押し合う矢印', en: 'Pushing Arrows' },
  { id: 'iceberg', rarity: 'normal', ja: '氷山', en: 'Iceberg' },
  { id: 'cylinders', rarity: 'normal', ja: 'ボンベの列', en: 'Row of Cylinders' },
  { id: 'syringe', rarity: 'normal', ja: '注射器', en: 'Syringe' },
  { id: 'kettle', rarity: 'normal', ja: 'やかん', en: 'Kettle' },
  { id: 'boyle_curve', rarity: 'rare', ja: 'ボイルの曲線', en: "Boyle's Curve" },
  { id: 'charles_line', rarity: 'rare', ja: 'シャルルの直線', en: "Charles's Line" },
  { id: 'zero', rarity: 'rare', ja: '絶対零度', en: 'Absolute Zero' },
  { id: 'constellation', rarity: 'rare', ja: '分子の星座', en: 'Molecule Constellation' },
  { id: 'just_stamp', rarity: 'rare', ja: 'JUST! の瞬間', en: 'The JUST! Moment' },
  { id: 'fever', rarity: 'rare', ja: 'フィーバー', en: 'Fever' },
  { id: 'chain', rarity: 'rare', ja: '連鎖の輪', en: 'Chain Rings' },
  { id: 'kimo_bombe', rarity: 'kimo', ja: 'ジト目ボンベ', en: 'Side-eye Cylinder' },
  { id: 'kimo_thermo', rarity: 'kimo', ja: 'べろ出し温度計', en: 'Tongue-out Thermometer' },
  { id: 'kimo_molecule', rarity: 'kimo', ja: '目玉の分子', en: 'Eyeball Molecule' },
];
export const ART_BY_ID = Object.fromEntries(ARTS.map((a) => [a.id, a]));

// 乱数（見た目だけ。同じ絵柄はいつも同じ形になるように固定の種を使う）
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ジト目（半分閉じたまぶた）。左右で大きさを変える
function jitoEye(ctx, x, y, r, look = 0.3) {
  ctx.fillStyle = WHITE;
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.arc(x + r * look, y + r * 0.25, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // まぶた
  ctx.fillStyle = MID;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.lineTo(x + r, y - r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // クマ
  ctx.strokeStyle = MID;
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.35, r * 1.05, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

// 絵柄を描く（w×h の範囲）
export function drawArt(ctx, id, w, h) {
  const art = ART_BY_ID[id];
  const rnd = seeded([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const cx = w / 2;
  const cy = h / 2;
  const u = Math.min(w, h) / 100; // 100 を基準にした大きさ
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  if (art && art.rarity === 'kimo') { bg.addColorStop(0, NAVY); bg.addColorStop(1, '#2A3F6E'); }
  else if (art && art.rarity === 'rare') { bg.addColorStop(0, PALE); bg.addColorStop(1, '#BFD2FB'); }
  else { bg.addColorStop(0, WHITE); bg.addColorStop(1, PALE); }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = NAVY;
  ctx.fillStyle = NAVY;
  ctx.lineWidth = 3 * u;

  switch (id) {
    case 'piston': {
      ctx.fillStyle = WHITE;
      rr(ctx, cx - 22 * u, cy - 10 * u, 44 * u, 50 * u, 6 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALE; ctx.fillRect(cx - 19 * u, cy + 5 * u, 38 * u, 32 * u);
      ctx.fillStyle = NAVY; ctx.fillRect(cx - 20 * u, cy - 2 * u, 40 * u, 8 * u);
      ctx.fillRect(cx - 3 * u, cy - 40 * u, 6 * u, 38 * u);
      ctx.fillRect(cx - 14 * u, cy - 44 * u, 28 * u, 6 * u);
      dots(ctx, cx, cy + 22 * u, 15 * u, 12 * u, 7, rnd, u);
      break;
    }
    case 'thermo': thermo(ctx, cx, cy, u, 0.65); break;
    case 'gauge': {
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.arc(cx, cy, 34 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * 0.75 + (Math.PI * 1.5 * k) / 8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 24 * u, cy + Math.sin(a) * 24 * u);
        ctx.lineTo(cx + Math.cos(a) * 30 * u, cy + Math.sin(a) * 30 * u);
        ctx.stroke();
      }
      ctx.strokeStyle = BLUE; ctx.lineWidth = 6 * u;
      ctx.beginPath(); ctx.arc(cx, cy, 27 * u, Math.PI * 1.8, Math.PI * 1.95); ctx.stroke();
      ctx.strokeStyle = NAVY; ctx.lineWidth = 3.5 * u;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 22 * u, cy - 14 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 4 * u, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'dance': dots(ctx, cx, cy, 38 * u, 38 * u, 18, rnd, u, true); break;
    case 'balloon': {
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.ellipse(cx, cy - 12 * u, 28 * u, 32 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BLUE;
      for (const dx of [-14, 0, 14]) { ctx.beginPath(); ctx.ellipse(cx + dx * u, cy - 12 * u, 5 * u, 31 * u, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(cx - 12 * u, cy + 18 * u); ctx.lineTo(cx - 8 * u, cy + 32 * u); ctx.moveTo(cx + 12 * u, cy + 18 * u); ctx.lineTo(cx + 8 * u, cy + 32 * u); ctx.stroke();
      ctx.fillStyle = NAVY; rr(ctx, cx - 10 * u, cy + 30 * u, 20 * u, 12 * u, 2 * u); ctx.fill();
      break;
    }
    case 'frost': {
      ctx.strokeStyle = BLUE; ctx.lineWidth = 4 * u;
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const ex = cx + Math.cos(a) * 36 * u;
        const ey = cy + Math.sin(a) * 36 * u;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
        for (const t of [0.45, 0.7]) {
          const px = cx + Math.cos(a) * 36 * u * t;
          const py = cy + Math.sin(a) * 36 * u * t;
          for (const s of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a + s * 0.8) * 10 * u, py + Math.sin(a + s * 0.8) * 10 * u); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(cx, cy, 5 * u, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'flask': {
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(cx - 8 * u, cy - 38 * u); ctx.lineTo(cx - 8 * u, cy - 10 * u); ctx.lineTo(cx - 32 * u, cy + 34 * u);
      ctx.lineTo(cx + 32 * u, cy + 34 * u); ctx.lineTo(cx + 8 * u, cy - 10 * u); ctx.lineTo(cx + 8 * u, cy - 38 * u); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = BLUE;
      ctx.beginPath(); ctx.moveTo(cx - 22 * u, cy + 15 * u); ctx.lineTo(cx - 30 * u, cy + 32 * u); ctx.lineTo(cx + 30 * u, cy + 32 * u); ctx.lineTo(cx + 22 * u, cy + 15 * u); ctx.closePath(); ctx.fill();
      bubbles(ctx, cx, cy - 2 * u, 14 * u, 5, rnd, u);
      break;
    }
    case 'bubbles': bubbles(ctx, cx, cy, 40 * u, 14, rnd, u); break;
    case 'wave': {
      ctx.lineWidth = 4 * u;
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = k % 2 ? BLUE : NAVY;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = cy - 30 * u + k * 15 * u + Math.sin(x / (10 * u) + k) * 6 * u;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'arrows': {
      ctx.fillStyle = WHITE; rr(ctx, cx - 18 * u, cy - 18 * u, 36 * u, 36 * u, 6 * u); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (Math.PI / 2) * k;
        const x1 = cx + Math.cos(a) * 44 * u; const y1 = cy + Math.sin(a) * 44 * u;
        const x2 = cx + Math.cos(a) * 22 * u; const y2 = cy + Math.sin(a) * 22 * u;
        arrow(ctx, x1, y1, x2, y2, u, k % 2 ? BLUE : NAVY);
      }
      dots(ctx, cx, cy, 12 * u, 12 * u, 5, rnd, u);
      break;
    }
    case 'iceberg': {
      ctx.fillStyle = BLUE; ctx.fillRect(0, cy + 8 * u, w, h);
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.moveTo(cx - 34 * u, cy + 8 * u); ctx.lineTo(cx - 12 * u, cy - 30 * u); ctx.lineTo(cx, cy - 18 * u); ctx.lineTo(cx + 14 * u, cy - 36 * u); ctx.lineTo(cx + 36 * u, cy + 8 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(cx - 40 * u, cy + 8 * u); ctx.lineTo(cx - 20 * u, cy + 44 * u); ctx.lineTo(cx + 26 * u, cy + 44 * u); ctx.lineTo(cx + 44 * u, cy + 8 * u); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'cylinders': {
      for (let k = 0; k < 3; k++) {
        const x = cx - 32 * u + k * 22 * u;
        ctx.fillStyle = k === 1 ? BLUE : WHITE;
        rr(ctx, x, cy - 26 * u + k * 4 * u, 18 * u, 60 * u, 8 * u); ctx.fill(); ctx.stroke();
        ctx.fillStyle = NAVY; ctx.fillRect(x + 6 * u, cy - 34 * u + k * 4 * u, 6 * u, 9 * u);
      }
      break;
    }
    case 'syringe': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.6);
      ctx.fillStyle = WHITE; rr(ctx, -30 * u, -10 * u, 50 * u, 20 * u, 3 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALE; ctx.fillRect(-28 * u, -8 * u, 24 * u, 16 * u);
      ctx.fillStyle = NAVY; ctx.fillRect(-6 * u, -9 * u, 4 * u, 18 * u); ctx.fillRect(-2 * u, -2 * u, 34 * u, 4 * u);
      ctx.fillRect(30 * u, -10 * u, 4 * u, 20 * u);
      ctx.beginPath(); ctx.moveTo(-30 * u, 0); ctx.lineTo(-44 * u, 0); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'kettle': {
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.ellipse(cx, cy + 10 * u, 30 * u, 24 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 26 * u, cy + 4 * u); ctx.lineTo(cx + 44 * u, cy - 12 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 12 * u, 16 * u, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = BLUE; ctx.lineWidth = 3 * u;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + 44 * u + k * 4 * u, cy - 16 * u);
        ctx.bezierCurveTo(cx + 36 * u + k * 4 * u, cy - 26 * u, cx + 52 * u + k * 4 * u, cy - 32 * u, cx + 44 * u + k * 4 * u, cy - 44 * u);
        ctx.stroke();
      }
      break;
    }
    case 'boyle_curve': graph(ctx, w, h, u, (x) => 0.18 / Math.max(0.05, x), 'P', 'V'); break;
    case 'charles_line': graph(ctx, w, h, u, (x) => 0.1 + 0.8 * x, 'V', 'T'); break;
    case 'zero': {
      thermo(ctx, cx - 18 * u, cy, u, 0.02);
      ctx.fillStyle = NAVY;
      ctx.font = `900 ${16 * u}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('0 K', cx + 2 * u, cy - 4 * u);
      ctx.font = `700 ${10 * u}px system-ui, sans-serif`;
      ctx.fillText('−273℃', cx + 2 * u, cy + 12 * u);
      sparkles(ctx, w, h, 8, rnd, u, BLUE);
      break;
    }
    case 'constellation': {
      ctx.fillStyle = NAVY; ctx.fillRect(0, 0, w, h);
      const pts = Array.from({ length: 9 }, () => [10 * u + rnd() * (w - 20 * u), 10 * u + rnd() * (h - 20 * u)]);
      ctx.strokeStyle = MID; ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      pts.forEach(([x, y]) => { ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x, y, 3.5 * u, 0, Math.PI * 2); ctx.fill(); });
      sparkles(ctx, w, h, 14, rnd, u, PALE);
      break;
    }
    case 'just_stamp': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.2);
      ctx.fillStyle = WHITE; rr(ctx, -40 * u, -16 * u, 80 * u, 32 * u, 6 * u); ctx.fill();
      ctx.lineWidth = 4 * u; ctx.stroke();
      ctx.fillStyle = BLUE; ctx.font = `italic 900 ${22 * u}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JUST!', 0, 1 * u);
      ctx.restore();
      ring(ctx, cx, cy, 44 * u, u);
      break;
    }
    case 'fever': {
      ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 30; k++) {
        ctx.fillStyle = k % 3 ? WHITE : PALE;
        ctx.save(); ctx.translate(rnd() * w, rnd() * h); ctx.rotate(rnd() * 3);
        ctx.fillRect(-4 * u, -2 * u, 8 * u, 4 * u); ctx.restore();
      }
      ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 2.5 * u;
      ctx.font = `italic 900 ${20 * u}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText('FEVER!', cx, cy); ctx.fillText('FEVER!', cx, cy);
      break;
    }
    case 'chain': {
      ctx.lineWidth = 6 * u;
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = k % 2 ? BLUE : NAVY;
        ctx.beginPath(); ctx.ellipse(cx - 30 * u + k * 20 * u, cy, 14 * u, 22 * u, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'kimo_bombe': {
      ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 4 * u;
      rr(ctx, cx - 26 * u, cy - 30 * u, 52 * u, 70 * u, 22 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALE; rr(ctx, cx - 6 * u, cy - 42 * u, 12 * u, 14 * u, 3 * u); ctx.fill(); ctx.stroke();
      jitoEye(ctx, cx - 11 * u, cy - 6 * u, 9 * u, 0.5);
      jitoEye(ctx, cx + 13 * u, cy - 4 * u, 6.5 * u, 0.6);
      ctx.strokeStyle = NAVY; ctx.lineWidth = 2.5 * u;
      ctx.beginPath(); ctx.moveTo(cx - 8 * u, cy + 16 * u); ctx.quadraticCurveTo(cx + 2 * u, cy + 12 * u, cx + 12 * u, cy + 18 * u); ctx.stroke();
      sparkles(ctx, w, h, 10, rnd, u, PALE);
      break;
    }
    case 'kimo_thermo': {
      thermo(ctx, cx, cy, u, 0.55, true);
      jitoEye(ctx, cx - 7 * u, cy - 18 * u, 6 * u, -0.4);
      jitoEye(ctx, cx + 8 * u, cy - 16 * u, 4.5 * u, -0.3);
      ctx.fillStyle = BLUE; ctx.strokeStyle = NAVY; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.ellipse(cx + 3 * u, cy + 4 * u, 4 * u, 7 * u, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      sparkles(ctx, w, h, 10, rnd, u, PALE);
      break;
    }
    case 'kimo_molecule': {
      ctx.strokeStyle = WHITE; ctx.lineWidth = 4 * u;
      const ps = [[-24, -18, 12], [22, -20, 9], [0, 20, 15]];
      ctx.beginPath(); ctx.moveTo(cx + ps[0][0] * u, cy + ps[0][1] * u); ctx.lineTo(cx + ps[2][0] * u, cy + ps[2][1] * u); ctx.lineTo(cx + ps[1][0] * u, cy + ps[1][1] * u); ctx.stroke();
      ps.forEach(([x, y, r], k) => jitoEye(ctx, cx + x * u, cy + y * u, r * u, k === 1 ? -0.5 : 0.4));
      sparkles(ctx, w, h, 12, rnd, u, PALE);
      break;
    }
    default: {
      ctx.fillStyle = NAVY;
      ctx.font = `900 ${30 * u}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy);
    }
  }
  ctx.restore();
}

// カードの裏面（何も付けていないときの絵柄）：ネイビーに青い線
export function drawDefaultBack(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 2;
  for (let k = -h; k < w + h; k += 10) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k - h, h); ctx.stroke();
  }
  ctx.fillStyle = WHITE;
  ctx.font = `900 ${Math.round(Math.min(w, h) * 0.26)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SRD', w / 2, h / 2);
  ctx.restore();
}

// 絵柄を画像（data URL）にする。同じものは使い回す
const cache = new Map();
export function artURL(id, w = 120, h = 168) {
  const key = `${id}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    if (id) drawArt(ctx, id, w, h);
    else drawDefaultBack(ctx, w, h);
    url = c.toDataURL('image/png');
  } catch (e) { /* 描けない環境では空にする */ }
  cache.set(key, url);
  return url;
}

// ---- 部品 ----
function dots(ctx, cx, cy, rx, ry, n, rnd, u, big = false) {
  for (let k = 0; k < n; k++) {
    const x = cx + (rnd() * 2 - 1) * rx;
    const y = cy + (rnd() * 2 - 1) * ry;
    const r = (big ? 4 + rnd() * 3 : 3) * u;
    ctx.fillStyle = k % 3 ? BLUE : PALE;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (big) {
      ctx.strokeStyle = MID; ctx.lineWidth = 1.2 * u;
      ctx.beginPath(); ctx.moveTo(x - r * 1.4, y + r * 0.4); ctx.lineTo(x - r * 2.8, y + r * 1.1); ctx.stroke();
    }
  }
}

function bubbles(ctx, cx, cy, spread, n, rnd, u) {
  for (let k = 0; k < n; k++) {
    const x = cx + (rnd() * 2 - 1) * spread;
    const y = cy + (rnd() * 2 - 1) * spread;
    const r = (3 + rnd() * 7) * u;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
  }
}

function thermo(ctx, cx, cy, u, level, face = false) {
  ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 3 * u;
  rr(ctx, cx - (face ? 16 : 8) * u, cy - 38 * u, (face ? 32 : 16) * u, 62 * u, (face ? 16 : 8) * u); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + 30 * u, 13 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.arc(cx, cy + 30 * u, 9 * u, 0, Math.PI * 2); ctx.fill();
  if (!face) {
    const top = cy + 22 * u - level * 54 * u;
    ctx.fillRect(cx - 3.5 * u, top, 7 * u, cy + 24 * u - top);
    ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5 * u;
    for (let k = 0; k < 6; k++) { const y = cy - 30 * u + k * 9 * u; ctx.beginPath(); ctx.moveTo(cx + 9 * u, y); ctx.lineTo(cx + 14 * u, y); ctx.stroke(); }
  }
}

function graph(ctx, w, h, u, f, yl, xl) {
  const L = 18 * u; const B = h - 18 * u; const R = w - 10 * u; const T = 12 * u;
  ctx.fillStyle = WHITE; ctx.fillRect(L, T, R - L, B - T);
  ctx.strokeStyle = PALE; ctx.lineWidth = 1 * u;
  for (let k = 1; k < 5; k++) {
    ctx.beginPath(); ctx.moveTo(L + ((R - L) * k) / 5, T); ctx.lineTo(L + ((R - L) * k) / 5, B); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L, T + ((B - T) * k) / 5); ctx.lineTo(R, T + ((B - T) * k) / 5); ctx.stroke();
  }
  ctx.strokeStyle = NAVY; ctx.lineWidth = 2.5 * u;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
  ctx.strokeStyle = BLUE; ctx.lineWidth = 3.5 * u;
  ctx.beginPath();
  for (let i = 0; i <= 50; i++) {
    const x = 0.04 + (i / 50) * 0.94;
    const y = Math.min(1, f(x));
    const px = L + x * (R - L);
    const py = B - y * (B - T);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = NAVY; ctx.font = `italic 700 ${11 * u}px "Times New Roman", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(yl, L - 8 * u, T + 6 * u);
  ctx.fillText(xl, R - 4 * u, B + 9 * u);
}

function ring(ctx, cx, cy, r, u) {
  ctx.strokeStyle = BLUE; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function sparkles(ctx, w, h, n, rnd, u, color) {
  ctx.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const x = rnd() * w; const y = rnd() * h; const s = (1.5 + rnd() * 2.5) * u;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x + s * 2, y); ctx.lineTo(x + s * 0.5, y + s * 0.5);
    ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.5, y + s * 0.5); ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s * 0.5, y - s * 0.5);
    ctx.closePath(); ctx.fill();
  }
}

function arrow(ctx, x1, y1, x2, y2, u, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4 * u;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.5) * 9 * u, y2 - Math.sin(a - 0.5) * 9 * u);
  ctx.lineTo(x2 - Math.cos(a + 0.5) * 9 * u, y2 - Math.sin(a + 0.5) * 9 * u);
  ctx.closePath(); ctx.fill();
}
