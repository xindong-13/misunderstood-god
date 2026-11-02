// 《誤解之神》地圖繪製
(function () {
  'use strict';
  const D = globalThis.DATA, Sim = globalThis.Sim;
  const W = D.MAP_W, H = D.MAP_H, TS = 16;
  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const TOWN = ['⛺', '🛖', '🛖', '🏘️', '🏰', '🏭', '🏙️'];

  let base = null, baseKey = '';

  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function hash(i) {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  function drawBase(s) {
    if (!base) { base = document.createElement('canvas'); base.width = W * TS; base.height = H * TS; }
    const g = base.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = s.map[i];
      const [r, gg, b] = rgb(D.TERRAIN[t].color);
      const v = (hash(i + s.seed) - 0.5) * 16;
      g.fillStyle = `rgb(${(r + v) | 0},${(gg + v) | 0},${(b + v) | 0})`;
      g.fillRect(x * TS, y * TS, TS, TS);
      const px = x * TS, py = y * TS, h2 = hash(i * 7 + s.seed);
      if (t === 3) {
        g.fillStyle = 'rgba(20,60,30,0.55)';
        for (let k = 0; k < 2; k++) {
          const cx = px + 4 + ((h2 * (k + 3) * 97) % 8), cy = py + 5 + k * 5;
          g.beginPath(); g.moveTo(cx, cy - 4); g.lineTo(cx + 3.5, cy + 3); g.lineTo(cx - 3.5, cy + 3); g.fill();
        }
      } else if (t === 6) {
        g.fillStyle = 'rgba(60,55,55,0.6)';
        g.beginPath(); g.moveTo(px + 8, py + 2); g.lineTo(px + 14, py + 14); g.lineTo(px + 2, py + 14); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath(); g.moveTo(px + 8, py + 2); g.lineTo(px + 10, py + 6); g.lineTo(px + 6, py + 6); g.fill();
      } else if (t === 5) {
        g.strokeStyle = 'rgba(90,75,50,0.5)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(px + 8, py + 12, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else if (t === 4) {
        g.fillStyle = 'rgba(160,130,80,0.45)';
        g.fillRect(px + 3 + h2 * 8, py + 4 + h2 * 3, 1.5, 1.5);
        g.fillRect(px + 10 - h2 * 5, py + 11, 1.5, 1.5);
      } else if (t === 0 && h2 < 0.12) {
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(px + 3, py + 8); g.quadraticCurveTo(px + 6, py + 5, px + 9, py + 8); g.stroke();
      } else if (t === 9) { // 叢林
        g.fillStyle = 'rgba(15,55,25,0.6)';
        for (let k = 0; k < 3; k++) {
          g.beginPath(); g.arc(px + 4 + k * 4, py + 5 + ((k * 5 + h2 * 9) % 7), 2.6, 0, Math.PI * 2); g.fill();
        }
      } else if (t === 8) { // 沼澤
        g.fillStyle = 'rgba(70,110,120,0.55)';
        g.fillRect(px + 2, py + 9, 6, 2); g.fillRect(px + 8, py + 4, 5, 2);
        g.strokeStyle = 'rgba(30,50,25,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(px + 11, py + 14); g.lineTo(px + 11, py + 8); g.moveTo(px + 4, py + 7); g.lineTo(px + 4, py + 2); g.stroke();
      } else if (t === 10) { // 火山
        g.fillStyle = 'rgba(40,25,22,0.8)';
        g.beginPath(); g.moveTo(px + 8, py + 3); g.lineTo(px + 15, py + 15); g.lineTo(px + 1, py + 15); g.fill();
        g.fillStyle = '#ff5a2a';
        g.beginPath(); g.moveTo(px + 6, py + 5); g.lineTo(px + 10, py + 5); g.lineTo(px + 9, py + 8); g.lineTo(px + 7, py + 8); g.fill();
      } else if (t === 12) { // 河流
        g.strokeStyle = '#4f93bd'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath();
        let any = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nt = s.map[ny * W + nx];
          if (nt === 12 || D.TERRAIN[nt].water) { g.moveTo(px + 8, py + 8); g.lineTo(px + 8 + ox * 8, py + 8 + oy * 8); any = true; }
        }
        if (!any) { g.moveTo(px + 4, py + 8); g.lineTo(px + 12, py + 8); }
        g.stroke(); g.lineCap = 'butt';
      } else if (t === 13) { // 珊瑚礁
        g.fillStyle = 'rgba(255,140,150,0.7)';
        g.fillRect(px + 3 + h2 * 4, py + 4, 2, 2); g.fillRect(px + 10, py + 9 + h2 * 3, 2, 2); g.fillRect(px + 5, py + 12, 2, 2);
      } else if (t === 11) { // 湖
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(px + 4, py + 9); g.lineTo(px + 9, py + 9); g.stroke();
      } else if (t === 14) { // 冰川
        g.strokeStyle = 'rgba(140,180,210,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(px + 2, py + 5 + h2 * 4); g.lineTo(px + 8, py + 9); g.lineTo(px + 14, py + 6); g.stroke();
      } else if (t === 15) { // 水晶
        g.fillStyle = 'rgba(230,210,255,0.9)';
        g.beginPath(); g.moveTo(px + 6, py + 2); g.lineTo(px + 9, py + 8); g.lineTo(px + 6, py + 14); g.lineTo(px + 3, py + 8); g.fill();
        g.fillStyle = 'rgba(160,120,230,0.9)';
        g.beginPath(); g.moveTo(px + 11, py + 6); g.lineTo(px + 13, py + 10); g.lineTo(px + 11, py + 14); g.lineTo(px + 9, py + 10); g.fill();
      } else if (t === 16) { // 巨骨
        g.strokeStyle = 'rgba(250,245,230,0.9)'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(px + 8, py + 13, 6, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.beginPath(); g.moveTo(px + 5, py + 8); g.lineTo(px + 5, py + 12); g.moveTo(px + 8, py + 7); g.lineTo(px + 8, py + 12); g.moveTo(px + 11, py + 8); g.lineTo(px + 11, py + 12); g.stroke();
      }
    }
    baseKey = s.seed + ':' + s.mapVer;
  }

  function draw(cv, s, ui) {
    const ctx = cv.getContext('2d');
    if (baseKey !== s.seed + ':' + s.mapVer) drawBase(s);
    ctx.drawImage(base, 0, 0);

    // 領地
    const own = Sim.RT.owner;
    const tribeOf = new Map(s.settlements.map((st) => [st.id, st.tribe]));
    const color = new Map(s.tribes.map((t) => [t.id, t.color]));
    const tAt = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      const o = own[y * W + x];
      return o < 0 ? -1 : tribeOf.has(o) ? tribeOf.get(o) : -1;
    };
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tAt(x, y);
      if (t < 0) continue;
      ctx.fillStyle = color.get(t);
      ctx.fillRect(x * TS, y * TS, TS, TS);
    }
    ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tAt(x, y);
      if (t < 0) continue;
      ctx.strokeStyle = color.get(t);
      ctx.beginPath();
      if (tAt(x + 1, y) !== t) { ctx.moveTo((x + 1) * TS - 1, y * TS); ctx.lineTo((x + 1) * TS - 1, (y + 1) * TS); }
      if (tAt(x - 1, y) !== t) { ctx.moveTo(x * TS + 1, y * TS); ctx.lineTo(x * TS + 1, (y + 1) * TS); }
      if (tAt(x, y + 1) !== t) { ctx.moveTo(x * TS, (y + 1) * TS - 1); ctx.lineTo((x + 1) * TS, (y + 1) * TS - 1); }
      if (tAt(x, y - 1) !== t) { ctx.moveTo(x * TS, y * TS + 1); ctx.lineTo((x + 1) * TS, y * TS + 1); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 污染
    if (s.civ.pollution > 1) {
      ctx.fillStyle = `rgba(60,52,40,${(s.civ.pollution / 100) * 0.45})`;
      ctx.fillRect(0, 0, W * TS, H * TS);
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 遺跡
    ctx.font = `13px ${EMOJI_FONT}`;
    for (const r of s.relics) if (r.found) ctx.fillText('🗿', r.x * TS + TS / 2, r.y * TS + TS / 2);

    // 動物
    ctx.font = `11px ${EMOJI_FONT}`;
    for (const h of s.herds) {
      ctx.globalAlpha = Math.min(1, 0.4 + h.n / 15);
      ctx.fillText(D.ANIMALS[h.type].icon, h.x * TS + TS / 2, h.y * TS + TS / 2);
    }
    ctx.globalAlpha = 1;

    // 聚落
    const icon = TOWN[s.civ.era];
    const capitals = new Set(s.tribes.filter((t) => t.alive).map((t) => t.capital));
    const crisisSt = s.crisis ? s.crisis.settlement : null;
    for (const st of s.settlements) {
      const cx = st.x * TS + TS / 2, cy = st.y * TS + TS / 2;
      const size = 12 + Math.min(10, Math.max(0, Math.log10(st.pop) * 3.2));
      ctx.fillStyle = color.get(st.tribe) || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(cx, cy, size / 2 + 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `${size}px ${EMOJI_FONT}`;
      ctx.fillText(icon, cx, cy + 1);
      if (st.id === crisisSt) {
        const pulse = 4 + ((performance.now() / 120) % 8);
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, size / 2 + pulse, 0, Math.PI * 2); ctx.stroke();
      }
      if (capitals.has(st.id)) {
        ctx.font = '11px "Microsoft JhengHei","PingFang TC",sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(st.name, cx, cy + size / 2 + 9);
        ctx.fillStyle = '#fff';
        ctx.fillText(st.name, cx, cy + size / 2 + 9);
      }
    }

    // 滑鼠與瞄準
    if (ui.hover) {
      const { x, y } = ui.hover;
      if (ui.targeting) {
        const m = D.MIRACLES.find((o) => o.id === ui.targeting);
        const ok = !!Sim.validTarget(s, m.id, x, y);
        ctx.strokeStyle = ok ? 'rgba(255,240,150,0.95)' : 'rgba(255,80,80,0.9)';
        ctx.fillStyle = ok ? 'rgba(255,240,150,0.15)' : 'rgba(255,80,80,0.12)';
        ctx.lineWidth = 2;
        if (m.target === 'tile') {
          ctx.beginPath(); ctx.arc(x * TS + TS / 2, y * TS + TS / 2, (m.radius || 5) * TS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (m.target === 'settlement') {
          const t = Sim.validTarget(s, m.id, x, y);
          if (t) { ctx.beginPath(); ctx.arc(t.settlement.x * TS + TS / 2, t.settlement.y * TS + TS / 2, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
          else { ctx.strokeRect(x * TS, y * TS, TS, TS); }
        } else {
          ctx.fillRect(x * TS, y * TS, TS, TS); ctx.strokeRect(x * TS, y * TS, TS, TS);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
        ctx.strokeRect(ui.hover.x * TS + 0.5, ui.hover.y * TS + 0.5, TS - 1, TS - 1);
      }
    }
  }

  globalThis.Render = { draw, TS };
})();
