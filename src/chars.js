// キャラクターと絵柄の描画（Canvas で手描き）。画像ファイルは使わない。色は白・ネイビー・青の濃淡だけ。
// v0.4：カードパックの絵柄（気体・器具・グラフのモチーフ）。
// v0.5：キャラクター（7人の気体の精）と5つの表情。パックの絵柄にもキャラクターを加える。

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
  { id: 'char_boyle', rarity: 'rare', ja: 'ボイル', en: 'Boyle', char: 'boyle', expr: 'normal' },
  { id: 'char_charles', rarity: 'rare', ja: 'シャルル', en: 'Charles', char: 'charles', expr: 'smug' },
  { id: 'char_kelvin', rarity: 'rare', ja: 'ケルビン', en: 'Kelvin', char: 'kelvin', expr: 'normal' },
  { id: 'char_celsius', rarity: 'rare', ja: 'セルシウス', en: 'Celsius', char: 'celsius', expr: 'smug' },
  { id: 'char_vdw', rarity: 'rare', ja: 'ファンデルワールス', en: 'van der Waals', char: 'vdw', expr: 'normal' },
  { id: 'char_fahrenheit', rarity: 'rare', ja: 'ファーレンハイト', en: 'Fahrenheit', char: 'fahrenheit', expr: 'smug' },
  { id: 'char_dalton', rarity: 'rare', ja: 'ドルトン', en: 'Dalton', char: 'dalton', expr: 'normal' },
  { id: 'kimo_bombe', rarity: 'kimo', ja: 'ジト目ボンベ', en: 'Side-eye Cylinder' },
  { id: 'kimo_boyle', rarity: 'kimo', ja: 'むにゅっとボイル', en: 'Squished Boyle', char: 'boyle', expr: 'sweat' },
  { id: 'kimo_celsius', rarity: 'kimo', ja: '白目セルシウス', en: 'White-eyed Celsius', char: 'celsius', expr: 'whiteeye' },
  { id: 'kimo_kelvin', rarity: 'kimo', ja: '昇天ケルビン', en: 'Ascending Kelvin', char: 'kelvin', expr: 'ascend' },
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

  if (art && art.char) {
    // キャラクターの絵柄：集中線の上にキャラクター
    ctx.strokeStyle = art.rarity === 'kimo' ? '#2F4A80' : 'rgba(47,111,237,0.18)';
    ctx.lineWidth = 2 * u;
    for (let k = 0; k < 24; k++) {
      const a = (Math.PI * 2 * k) / 24;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 20 * u, cy + Math.sin(a) * 20 * u);
      ctx.lineTo(cx + Math.cos(a) * 90 * u, cy + Math.sin(a) * 90 * u);
      ctx.stroke();
    }
    drawChar(ctx, art.char, art.expr || 'normal', cx, cy + 4 * u, Math.min(w, h) * 0.86, 0);
    if (art.rarity === 'kimo') sparkles(ctx, w, h, 10, rnd, u, PALE);
    ctx.restore();
    return;
  }

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


// =========================================================
// キャラクター（8章）：その人の名前がついた「気体の精」
// 太い輪郭線（ネイビー）、ジト目、左右で大きさの違う目、目の下のクマ。
// 表情：normal（ふつう）/ smug（ドヤ顔）/ sweat（冷や汗）/ whiteeye（白目）/ ascend（昇天）
// =========================================================
export const CHARS = ['boyle', 'charles', 'kelvin', 'celsius', 'vdw', 'fahrenheit', 'dalton'];
export const EXPRS = ['normal', 'smug', 'sweat', 'whiteeye', 'ascend'];

// 目。lid：まぶたの下がり具合（0〜1）、look：黒目の向き
function charEye(ctx, x, y, r, u, expr, look = 0.3) {
  if (expr === 'ascend') {
    ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6 * u;
    ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    return;
  }
  const lid = { normal: 0.5, smug: 0.62, sweat: 0.12, whiteeye: 0 }[expr] ?? 0.5;
  if (expr === 'whiteeye') r *= 1.15;
  ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6 * u;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (expr !== 'whiteeye') {
    const pr = expr === 'sweat' ? r * 0.28 : r * 0.42;
    const lk = expr === 'smug' ? 0.45 : expr === 'sweat' ? -0.35 : look;
    ctx.fillStyle = NAVY;
    ctx.beginPath(); ctx.arc(x + r * lk, y + r * 0.22, pr, 0, Math.PI * 2); ctx.fill();
  }
  // まぶた（ジト目）
  if (lid > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = MID;
    ctx.fillRect(x - r, y - r, r * 2, r * 2 * lid);
    ctx.restore();
    ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    const ly = y - r + r * 2 * lid;
    const half = Math.sqrt(Math.max(0, r * r - (ly - y) * (ly - y)));
    ctx.moveTo(x - half, ly); ctx.lineTo(x + half, ly); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  // クマ
  ctx.strokeStyle = MID; ctx.lineWidth = 1.8 * u;
  ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 1.12, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
}

function charMouth(ctx, x, y, w, u, expr, kind = 'plain') {
  ctx.strokeStyle = NAVY; ctx.fillStyle = NAVY; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round';
  ctx.beginPath();
  if (expr === 'smug') {
    ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + w * 0.5, x + w * 1.1, y - w * 0.45);
    ctx.stroke();
  } else if (expr === 'sweat') {
    ctx.moveTo(x - w, y);
    for (let k = 1; k <= 4; k++) ctx.lineTo(x - w + (w * 2 * k) / 4, y + (k % 2 ? -w * 0.25 : w * 0.25));
    ctx.stroke();
  } else if (expr === 'whiteeye') {
    ctx.fillStyle = NAVY;
    ctx.ellipse(x, y + w * 0.2, w * 0.55, w * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'ascend') {
    ctx.fillStyle = WHITE;
    ctx.arc(x, y, w * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.moveTo(x - w * 0.8, y + w * 0.05); ctx.lineTo(x + w * 0.8, y - w * 0.05); ctx.stroke();
  }
  if (kind === 'teeth' && expr !== 'whiteeye') {
    // 出っ歯
    ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.8 * u;
    ctx.fillRect(x - w * 0.35, y + 1 * u, w * 0.32, w * 0.55); ctx.strokeRect(x - w * 0.35, y + 1 * u, w * 0.32, w * 0.55);
    ctx.fillRect(x + w * 0.03, y + 1 * u, w * 0.32, w * 0.55); ctx.strokeRect(x + w * 0.03, y + 1 * u, w * 0.32, w * 0.55);
  }
  if (kind === 'tongue' && expr !== 'whiteeye' && expr !== 'ascend') {
    // べろ
    ctx.fillStyle = BLUE; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.8 * u;
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + w * 0.35, w * 0.32, w * 0.45, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function sweatDrops(ctx, x, y, u) {
  ctx.fillStyle = PALE; ctx.strokeStyle = BLUE; ctx.lineWidth = 1.6 * u;
  for (const [dx, dy, s] of [[0, 0, 1], [7, 9, 0.7]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * u, y + dy * u - 5 * s * u);
    ctx.quadraticCurveTo(x + dx * u + 4 * s * u, y + dy * u + 2 * s * u, x + dx * u, y + dy * u + 4 * s * u);
    ctx.quadraticCurveTo(x + dx * u - 4 * s * u, y + dy * u + 2 * s * u, x + dx * u, y + dy * u - 5 * s * u);
    ctx.fill(); ctx.stroke();
  }
}

function halo(ctx, x, y, u) {
  ctx.strokeStyle = BLUE; ctx.lineWidth = 3 * u;
  ctx.beginPath(); ctx.ellipse(x, y, 16 * u, 5 * u, 0, 0, Math.PI * 2); ctx.stroke();
}

function tube(ctx, u, x, y, w, h) {
  ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u;
  rr(ctx, x, y, w, h, w / 2); ctx.fill(); ctx.stroke();
}

// キャラクターを描く。(cx, cy) が中心、size が全体の高さ、t は時間（秒、ゆらゆら動く）
export function drawChar(ctx, id, expr = 'normal', cx = 50, cy = 50, size = 100, t = 0) {
  const u = size / 100;
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 2.2) * 1.5 * u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (expr === 'ascend') ctx.globalAlpha = 0.78; // 昇天：薄い青に（灰色にはしない）
  const E = expr;
  switch (id) {
    case 'boyle': {
      // ピストン型の胴体。押されると（冷や汗・白目）顔がむにゅっと潰れる
      const squish = E === 'sweat' || E === 'whiteeye' ? 0.84 : 1;
      ctx.save();
      ctx.scale(1 / Math.sqrt(squish), squish);
      ctx.fillStyle = NAVY;
      rr(ctx, -4 * u, -50 * u, 8 * u, 20 * u, 2 * u); ctx.fill();
      rr(ctx, -18 * u, -54 * u, 36 * u, 8 * u, 3 * u); ctx.fill();
      ctx.fillStyle = WHITE; ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u;
      rr(ctx, -30 * u, -32 * u, 60 * u, 76 * u, 14 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NAVY; rr(ctx, -30 * u, -32 * u, 60 * u, 10 * u, 5 * u); ctx.fill();
      ctx.fillStyle = PALE; ctx.fillRect(-27 * u, 22 * u, 54 * u, 16 * u);
      charEye(ctx, -12 * u, -6 * u, 9 * u, u, E, 0.3);
      charEye(ctx, 13 * u, -5 * u, 6.5 * u, u, E, 0.4);
      charMouth(ctx, 0, 11 * u, 9 * u, u, E, 'teeth');
      ctx.restore();
      if (E === 'sweat') sweatDrops(ctx, 26 * u, -20 * u, u);
      break;
    }
    case 'charles': {
      // 熱気球型の頭、ひょろ長い首。温められる（ドヤ顔）とふくらむ
      const inf = E === 'smug' ? 1.1 : E === 'sweat' ? 0.92 : 1;
      ctx.strokeStyle = NAVY; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(-3 * u, 8 * u); ctx.lineTo(-3 * u, 34 * u); ctx.moveTo(3 * u, 8 * u); ctx.lineTo(3 * u, 34 * u); ctx.stroke();
      ctx.fillStyle = NAVY; rr(ctx, -11 * u, 33 * u, 22 * u, 13 * u, 3 * u); ctx.fill();
      ctx.save(); ctx.scale(inf, inf);
      ctx.fillStyle = PALE; ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u;
      ctx.beginPath(); ctx.ellipse(0, -18 * u, 31 * u, 32 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = BLUE;
      for (const dx of [-24, 24]) { ctx.beginPath(); ctx.ellipse(dx * u, -18 * u, 7 * u, 32 * u, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, -18 * u, 31 * u, 32 * u, 0, 0, Math.PI * 2); ctx.stroke();
      charEye(ctx, -10 * u, -22 * u, 7.5 * u, u, E, 0.35);
      charEye(ctx, 10 * u, -20 * u, 5.5 * u, u, E, 0.45);
      charMouth(ctx, 1 * u, -5 * u, 7 * u, u, E);
      ctx.restore();
      if (E === 'sweat') sweatDrops(ctx, 28 * u, -34 * u, u);
      break;
    }
    case 'kelvin': {
      // 霜のついた温度計型。眉毛だけ太い。無表情
      tube(ctx, u, -17 * u, -48 * u, 34 * u, 76 * u);
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 32 * u, 17 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(0, 32 * u, 11 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-4 * u, 10 * u, 8 * u, 18 * u);
      // 霜
      ctx.fillStyle = WHITE; ctx.strokeStyle = BLUE; ctx.lineWidth = 1.6 * u;
      for (const [x, y] of [[-16, -36], [-10, -48], [0, -51], [10, -48], [16, -36], [17, -20]]) {
        ctx.beginPath(); ctx.moveTo(x * u, (y - 5) * u); ctx.lineTo((x + 3) * u, y * u); ctx.lineTo(x * u, (y + 5) * u); ctx.lineTo((x - 3) * u, y * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // 太い眉
      ctx.fillStyle = NAVY;
      rr(ctx, -16 * u, -34 * u, 13 * u, 5 * u, 2 * u); ctx.fill();
      rr(ctx, 3 * u, -33 * u, 12 * u, 5 * u, 2 * u); ctx.fill();
      charEye(ctx, -9 * u, -21 * u, 6.5 * u, u, E === 'smug' ? 'normal' : E, 0.2);
      charEye(ctx, 9 * u, -20 * u, 5 * u, u, E === 'smug' ? 'normal' : E, 0.2);
      charMouth(ctx, 0, -6 * u, 6 * u, u, E === 'smug' ? 'normal' : E);
      if (E === 'sweat') sweatDrops(ctx, 20 * u, -40 * u, u);
      break;
    }
    case 'celsius': {
      // 温度計型で、目盛りが途中でずれている。にやけ顔、舌を出す
      tube(ctx, u, -17 * u, -48 * u, 34 * u, 76 * u);
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 32 * u, 17 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(0, 32 * u, 11 * u, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = NAVY; ctx.lineWidth = 2 * u;
      for (let k = 0; k < 4; k++) { const y = (-40 + k * 7) * u; ctx.beginPath(); ctx.moveTo(17 * u, y); ctx.lineTo(24 * u, y); ctx.stroke(); }
      for (let k = 0; k < 4; k++) { const y = (-8 + k * 7) * u; ctx.beginPath(); ctx.moveTo(21 * u, y); ctx.lineTo(28 * u, y); ctx.stroke(); } // ずれた目盛り
      charEye(ctx, -8 * u, -24 * u, 7 * u, u, E, 0.5);
      charEye(ctx, 9 * u, -22 * u, 5 * u, u, E, 0.6);
      charMouth(ctx, 0, -6 * u, 7 * u, u, E === 'normal' ? 'smug' : E, 'tongue');
      if (E === 'sweat') sweatDrops(ctx, -22 * u, -40 * u, u);
      break;
    }
    case 'vdw': {
      // 分子がぎゅうぎゅうに詰まったゴツゴツの体。つながった太眉
      const balls = [[-18, -8, 17], [15, -12, 18], [-3, 12, 20], [21, 14, 14], [-22, 18, 13], [2, -30, 14], [-20, -28, 10], [22, -32, 9]];
      ctx.strokeStyle = NAVY; ctx.lineWidth = 7 * u;
      balls.forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.stroke(); });
      balls.forEach(([x, y, r], k) => { ctx.fillStyle = k % 3 === 1 ? PALE : WHITE; ctx.beginPath(); ctx.arc(x * u, y * u, r * u - 1.5 * u, 0, Math.PI * 2); ctx.fill(); });
      charEye(ctx, -9 * u, -7 * u, 7.5 * u, u, E, 0.3);
      charEye(ctx, 10 * u, -8 * u, 6 * u, u, E, 0.35);
      ctx.fillStyle = NAVY;
      ctx.beginPath(); ctx.moveTo(-19 * u, -19 * u); ctx.quadraticCurveTo(0, -24 * u, 18 * u, -19 * u); ctx.lineTo(18 * u, -15 * u); ctx.quadraticCurveTo(0, -20 * u, -19 * u, -15 * u); ctx.closePath(); ctx.fill();
      charMouth(ctx, 0, 10 * u, 8 * u, u, E);
      if (E === 'sweat') sweatDrops(ctx, 30 * u, -16 * u, u);
      break;
    }
    case 'fahrenheit': {
      // シルクハットに古い温度計、片眼鏡
      tube(ctx, u, -17 * u, -38 * u, 34 * u, 70 * u);
      ctx.fillStyle = PALE; ctx.beginPath(); ctx.arc(0, 36 * u, 16 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 36 * u, 10 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = NAVY;
      rr(ctx, -15 * u, -64 * u, 30 * u, 26 * u, 2 * u); ctx.fill();
      rr(ctx, -26 * u, -40 * u, 52 * u, 6 * u, 3 * u); ctx.fill();
      ctx.fillStyle = BLUE; ctx.fillRect(-15 * u, -46 * u, 30 * u, 4 * u);
      charEye(ctx, -8 * u, -18 * u, 6 * u, u, E, 0.3);
      charEye(ctx, 9 * u, -17 * u, 7.5 * u, u, E, 0.3);
      ctx.strokeStyle = NAVY; ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.arc(9 * u, -17 * u, 10 * u, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18 * u, -12 * u); ctx.quadraticCurveTo(28 * u, 4 * u, 18 * u, 18 * u); ctx.stroke();
      charMouth(ctx, 0, -2 * u, 6.5 * u, u, E);
      if (E === 'sweat') sweatDrops(ctx, -22 * u, -26 * u, u);
      break;
    }
    case 'dalton': {
      // 大小の玉がいくつもくっついた体
      const balls = [[0, 2, 25], [-25, 22, 12], [24, -22, 13], [26, 22, 9], [-22, -26, 9], [-30, -2, 7]];
      ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u;
      balls.slice(1).forEach(([x, y, r], k) => { ctx.fillStyle = [PALE, MID, WHITE, BLUE, PALE][k]; ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 2 * u, 25 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      charEye(ctx, -9 * u, -3 * u, 7.5 * u, u, E, 0.3);
      charEye(ctx, 10 * u, -2 * u, 5.5 * u, u, E, 0.35);
      charMouth(ctx, 0, 13 * u, 7 * u, u, E);
      if (E === 'sweat') sweatDrops(ctx, 22 * u, -6 * u, u);
      break;
    }
    default: break;
  }
  if (E === 'ascend') halo(ctx, 0, -58 * u, u);
  if (E === 'whiteeye') {
    // 青ざめた線（危険メーター90以上）
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2.2 * u;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo((-14 + k * 7) * u, -44 * u); ctx.lineTo((-14 + k * 7) * u, -32 * u); ctx.stroke();
    }
  }
  ctx.restore();
}
