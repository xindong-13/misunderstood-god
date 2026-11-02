// 《誤解之神》模擬核心：不碰 DOM，可在 Node 裡跑平衡測試
(function () {
  'use strict';
  const D = globalThis.DATA;
  const W = D.MAP_W, H = D.MAP_H, YEARS = D.YEARS_PER_TICK;
  const T = D.TERRAIN;
  const R = Math.random;
  const rand = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const NODE = Object.fromEntries(D.NODES.map((n) => [n.id, n]));
  const ADD_KEYS = new Set(['devotion', 'tension']);
  const isWood = (t) => !!T[t].wood;
  const isSea = (t) => t === 0 || t === 1 || t === 13;

  // 執行期快取（不存檔）
  const RT = {
    owner: new Int32Array(W * H).fill(-1), ownDist: new Float32Array(W * H), caps: new Map(),
    mass: new Int32Array(W * H).fill(-1), nm: {}, nmAdd: {}, done: new Set(), avg: {},
    volcNear: false, coastal: 0,
  };

  // ── 地圖生成 ──────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genMap(seed) {
    const rng = mulberry32(seed);
    const noise = (scale) => {
      const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
      const g = new Float32Array(gw * gh);
      for (let i = 0; i < g.length; i++) g[i] = rng();
      const sm = (t) => t * t * (3 - 2 * t);
      return (x, y) => {
        const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const u = sm(fx - x0), v = sm(fy - y0);
        const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
    };
    const h1 = noise(14), h2 = noise(7), h3 = noise(3.5), m1 = noise(11), m2 = noise(5);
    const hs = new Float32Array(W * H), ms = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      let h = h1(x, y) * 0.5 + h2(x, y) * 0.32 + h3(x, y) * 0.18;
      h -= (dx * dx * 0.8 + dy * dy) * 0.42;
      hs[idx(x, y)] = h;
      ms[idx(x, y)] = m1(x, y) * 0.65 + m2(x, y) * 0.35;
    }
    const sorted = Array.from(hs).sort((a, b) => a - b);
    const sea = sorted[Math.floor(sorted.length * 0.5)];
    const land = sorted.filter((v) => v > sea);
    const low = land[Math.floor(land.length * 0.14)];
    const hill = land[Math.floor(land.length * 0.8)], mount = land[Math.floor(land.length * 0.93)];
    const lm = [];
    for (let i = 0; i < W * H; i++) if (hs[i] > sea) lm.push(ms[i]);
    lm.sort((a, b) => a - b);
    const dry = lm[Math.floor(lm.length * 0.18)], mid = lm[Math.floor(lm.length * 0.45)], wet = lm[Math.floor(lm.length * 0.62)];

    const map = new Array(W * H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y), h = hs[i], m = ms[i];
      if (h <= sea) continue;
      const lat = Math.abs((y - H / 2) / (H / 2));
      if (h >= mount) map[i] = 6;
      else if (h >= hill) map[i] = 5;
      else if (lat > 0.88) map[i] = 14;
      else if (lat > 0.78) map[i] = 7;
      else if (m < dry) map[i] = 4;
      else if (m > wet) map[i] = lat < 0.35 ? 9 : 3;
      else if (h < low && m > mid) map[i] = 8;
      else map[i] = 2;
    }

    // 與外海相連的水才是海，其他是湖
    const ocean = new Uint8Array(W * H);
    const q = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (map[idx(x, y)] === 0) { ocean[idx(x, y)] = 1; q.push(idx(x, y)); }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (map[idx(x, y)] === 0 && !ocean[idx(x, y)]) { ocean[idx(x, y)] = 1; q.push(idx(x, y)); }
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0;
      for (const [ox, oy] of N4) {
        const nx = x + ox, ny = y + oy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (map[j] === 0 && !ocean[j]) { ocean[j] = 1; q.push(j); }
      }
    }
    for (let i = 0; i < W * H; i++) if (map[i] === 0 && !ocean[i]) map[i] = 11;

    // 淺海與珊瑚礁
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (map[i] !== 0) continue;
      let near = false;
      for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (inb(nx, ny) && T[map[idx(nx, ny)]].land) { near = true; break; }
      }
      if (near) {
        const lat = Math.abs((y - H / 2) / (H / 2));
        map[i] = lat < 0.55 && rng() < 0.2 ? 13 : 1;
      }
    }

    // 火山
    const mts = [];
    for (let i = 0; i < W * H; i++) if (map[i] === 6) mts.push(i);
    for (let k = 0; k < 2 && mts.length; k++) map[mts.splice(Math.floor(rng() * mts.length), 1)[0]] = 10;

    // 河流：從高地往低處流到水邊
    const sources = [];
    for (let i = 0; i < W * H; i++) if (map[i] === 5 || map[i] === 6) sources.push(i);
    for (let k = 0; k < 6 && sources.length; k++) {
      let cur = sources.splice(Math.floor(rng() * sources.length), 1)[0];
      const path = [];
      const seen = new Set([cur]);
      for (let step = 0; step < 60; step++) {
        const x = cur % W, y = (cur / W) | 0;
        let best = -1, bh = Infinity, hitWater = false;
        for (const [ox, oy] of N4) {
          const nx = x + ox, ny = y + oy;
          if (!inb(nx, ny)) continue;
          const j = idx(nx, ny);
          if (T[map[j]].water) { hitWater = true; break; }
          if (!seen.has(j) && hs[j] < bh) { bh = hs[j]; best = j; }
        }
        if (hitWater || best < 0 || bh > hs[cur] + 0.015) { if (hitWater) path.push(cur); break; }
        path.push(cur);
        seen.add(best);
        cur = best;
      }
      if (path.length >= 4 && T[map[path[path.length - 1]]].land) {
        for (const i of path) if (![6, 10, 14].includes(map[i])) map[i] = 12;
      }
    }

    // 神秘地形：水晶荒原、巨骨平原
    const patch = (type, from, size) => {
      const cands = [];
      for (let i = 0; i < W * H; i++) if (from.includes(map[i])) cands.push(i);
      if (!cands.length) return;
      const front = [cands[Math.floor(rng() * cands.length)]];
      let n = 0;
      while (front.length && n < size) {
        const i = front.splice(Math.floor(rng() * front.length), 1)[0];
        if (!from.includes(map[i])) continue;
        map[i] = type; n++;
        const x = i % W, y = (i / W) | 0;
        for (const [ox, oy] of N4) if (inb(x + ox, y + oy)) front.push(idx(x + ox, y + oy));
      }
    };
    patch(15, [4, 7, 2], 5);
    patch(16, [4, 2, 5], 4);
    return map;
  }

  function computeMass(s) {
    const m = RT.mass;
    m.fill(-1);
    let id = 0;
    for (let i = 0; i < W * H; i++) {
      if (m[i] >= 0 || !T[s.map[i]].land) continue;
      const q = [i];
      m[i] = id;
      while (q.length) {
        const j = q.pop(), x = j % W, y = (j / W) | 0;
        for (const [ox, oy] of N4) {
          const nx = x + ox, ny = y + oy;
          if (!inb(nx, ny)) continue;
          const k = idx(nx, ny);
          if (m[k] < 0 && T[s.map[k]].land) { m[k] = id; q.push(k); }
        }
      }
      id++;
    }
  }

  // ── 小工具 ──────────────────────────────────────────
  function log(s, text, kind) {
    s.logSeq++;
    s.log.push({ seq: s.logSeq, year: s.tick * YEARS, text, kind: kind || 'info' });
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  }
  const aliveTribes = (s) => s.tribes.filter((t) => t.alive);
  const tribeById = (s, id) => s.tribes.find((t) => t.id === id) || null;
  const settlementById = (s, id) => s.settlements.find((x) => x.id === id) || null;
  const settlementsOf = (s, tid) => s.settlements.filter((x) => x.tribe === tid);
  const totalPop = (s) => s.settlements.reduce((a, x) => a + x.pop, 0);
  const tribePop = (s, tid) => s.settlements.reduce((a, x) => a + (x.tribe === tid ? x.pop : 0), 0);
  const has = (s, id) => s.civ.done.includes(id);

  function weightedPick(items, wf) {
    let sum = 0;
    for (const it of items) sum += Math.max(0, wf(it));
    if (sum <= 0) return items.length ? pick(items) : null;
    let r = R() * sum;
    for (const it of items) { r -= Math.max(0, wf(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  const randomTribe = (s) => weightedPick(aliveTribes(s), (t) => tribePop(s, t.id) + 1);
  const randomSettlementOf = (s, tid) => weightedPick(settlementsOf(s, tid), (x) => x.pop);

  function nearestSettlement(s, x, y, filter) {
    let best = null, bd = Infinity;
    for (const st of s.settlements) {
      if (filter && !filter(st)) continue;
      const d = dist(st.x, st.y, x, y);
      if (d < bd) { bd = d; best = st; }
    }
    return best ? { st: best, d: bd } : null;
  }

  function isCoastal(s, st) {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const x = st.x + ox, y = st.y + oy;
      if (inb(x, y) && isSea(s.map[idx(x, y)])) return true;
    }
    return false;
  }

  function fill(text, ctx, s) {
    if (!text) return '';
    return text
      .replace(/\{tribe\}/g, ctx.tribe ? ctx.tribe.name : '人類')
      .replace(/\{tribeB\}/g, ctx.tribeB ? ctx.tribeB.name : '鄰族')
      .replace(/\{settlement\}/g, ctx.settlement ? ctx.settlement.name : '某個村落')
      .replace(/\{place\}/g, () => {
        if (ctx.tile) {
          const n = nearestSettlement(s, ctx.tile.x, ctx.tile.y);
          return n && n.d < 8 ? n.st.name : '荒野';
        }
        return ctx.settlement ? ctx.settlement.name : '遠方';
      });
  }

  function genPlaceName(s) {
    const used = new Set(s.usedNames);
    for (let k = 0; k < 50; k++) {
      const n = pick(D.NAMES.place1) + pick(D.NAMES.place2);
      if (!used.has(n)) return n;
    }
    return pick(D.NAMES.place1) + pick(D.NAMES.place2) + (s.nextId % 10);
  }

  function makeTribe(s, parent) {
    const usedT = new Set(s.tribes.map((t) => t.name));
    const freeNames = D.NAMES.tribe.filter((n) => !usedT.has(n + '族'));
    const usedC = new Set(aliveTribes(s).map((t) => t.color));
    const freeColors = D.NAMES.colors.filter((c) => !usedC.has(c));
    const t = {
      id: s.nextId++,
      name: (freeNames.length ? pick(freeNames) : pick(D.NAMES.tribe)) + '族',
      color: freeColors.length ? freeColors[0] : pick(D.NAMES.colors),
      devotion: parent ? parent.devotion * 0.8 : 0.5,
      beliefs: parent ? parent.beliefs.slice() : [],
      traits: parent ? parent.traits.slice() : [],
      interests: parent ? parent.interests.slice() : [],
      alive: true, capital: null, founded: s.tick,
    };
    if (t.beliefs.length && R() < 0.5) t.beliefs.splice(Math.floor(R() * t.beliefs.length), 1);
    if (t.traits.length > 1) t.traits.splice(Math.floor(R() * t.traits.length), 1);
    s.tribes.push(t);
    return t;
  }

  function addSettlement(s, x, y, pop, tribeId) {
    const st = { id: s.nextId++, name: genPlaceName(s), x, y, pop, tribe: tribeId, founded: s.tick, cap: pop };
    s.settlements.push(st);
    s.usedNames.push(st.name);
    const tr = tribeById(s, tribeId);
    if (tr && tr.capital == null) tr.capital = st.id;
    return st;
  }

  const landOk = (t) => !!T[t].settle && T[t].food >= 1;

  function spawnHerd(s, type, near, radius) {
    const A = D.ANIMALS[type];
    const r = radius || 6;
    for (let k = 0; k < 120; k++) {
      let x, y;
      if (near && k < 80) { x = Math.round(near.x + rand(-r, r)); y = Math.round(near.y + rand(-r, r)); }
      else { x = Math.floor(R() * W); y = Math.floor(R() * H); }
      if (!inb(x, y) || !A.terrain.includes(s.map[idx(x, y)])) continue;
      const h = { id: s.nextId++, type, x, y, n: A.n0 };
      s.herds.push(h);
      return h;
    }
    return null;
  }

  // ── 修正值 ──────────────────────────────────────────
  function refreshNodeMods(s) {
    RT.nm = {}; RT.nmAdd = { devotion: 0, tension: 0 };
    RT.done = new Set(s.civ.done);
    for (const id of s.civ.done) {
      const n = NODE[id];
      if (!n) continue;
      for (const k in n.mods) {
        if (ADD_KEYS.has(k)) RT.nmAdd[k] += n.mods[k];
        else RT.nm[k] = (RT.nm[k] == null ? 1 : RT.nm[k]) * n.mods[k];
      }
    }
  }
  function gm(s, k) {
    let v = RT.nm[k] == null ? 1 : RT.nm[k];
    for (const m of s.civ.mods) if (m.k === k) v *= m.mult;
    return v;
  }
  function tribeMods(tr) {
    const m = { devotion: 0, tension: 0, wolfSafe: false, cursed: false };
    const mul = (k, v) => { m[k] = (m[k] == null ? 1 : m[k]) * v; };
    const apply = (mods) => {
      for (const k in mods) {
        if (ADD_KEYS.has(k)) m[k] += mods[k];
        else mul(k, mods[k]);
      }
    };
    for (const b of tr.beliefs) if (D.BELIEFS[b]) apply(D.BELIEFS[b].mods);
    for (const t of tr.traits || []) {
      const X = D.TRAITS[t];
      if (!X) continue;
      apply(X.mods);
      if (X.wolfSafe) m.wolfSafe = true;
      if (X.cursed) m.cursed = true;
    }
    for (const p of tr.interests || []) mul('path_' + p, 1.25);
    return m;
  }
  const tm = (m, k) => (m[k] == null ? 1 : m[k]);
  // 全世界（以人口加權）的修正值 × 研究節點修正
  const M = (s, k) => (RT.avg[k] == null ? 1 : RT.avg[k]) * gm(s, k);

  function refreshAvg(s) {
    const tribes = aliveTribes(s);
    const pops = tribes.map((t) => tribePop(s, t.id) + 1);
    const total = pops.reduce((a, b) => a + b, 0) || 1;
    const avg = {};
    tribes.forEach((t, i) => {
      const m = tribeMods(t);
      for (const k in m) {
        if (typeof m[k] !== 'number' || ADD_KEYS.has(k)) continue;
        avg[k] = (avg[k] || 0) + (m[k] - 1) * (pops[i] / total);
      }
    });
    RT.avg = {};
    for (const k in avg) RT.avg[k] = 1 + avg[k];
  }

  const faithCap = (s) => 60 + s.civ.era * 30;
  const costOf = (s, base) => Math.round(base * (1 + s.civ.era * 0.2) * gm(s, 'miracleCost'));
  function eraSpan(s) {
    const e = s.civ.era;
    return e < 6 ? D.ERAS[e + 1].req - D.ERAS[e].req : D.END_TECH - D.ERAS[6].req;
  }

  // ── 始祖 ────────────────────────────────────────────
  function rollFounder(exclude) {
    const keys = Object.keys(D.TRAITS);
    const pos = keys.filter((k) => !D.TRAITS[k].flaw), neg = keys.filter((k) => D.TRAITS[k].flaw);
    const traits = [];
    const nPos = R() < 0.5 ? 1 : 2;
    while (traits.length < nPos) { const k = pick(pos); if (!traits.includes(k)) traits.push(k); }
    if (nPos === 2 || R() < 0.35) traits.push(pick(neg));
    const names = D.FOUNDER_NAMES.filter((n) => !(exclude || []).includes(n));
    return { name: pick(names), face: pick(D.FOUNDER_FACES), traits, interest: pick(D.PATHS).id, rerolls: D.REROLLS_PER_CARD };
  }

  function rerollFounder(s, i) {
    const f = s.founders[i];
    if (!f || f.rerolls <= 0 || s.phase !== 'setup') return false;
    const nf = rollFounder(s.founders.map((x) => x.name));
    nf.rerolls = f.rerolls - 1;
    s.founders[i] = nf;
    return true;
  }

  function confirmFounders(s) {
    if (s.phase !== 'setup') return;
    const tr = s.tribes[0];
    const traits = [];
    for (const f of s.founders) for (const t of f.traits) if (!traits.includes(t)) traits.push(t);
    tr.traits = traits;
    tr.interests = s.founders.map((f) => f.interest);
    s.phase = 'play';
    const names = s.founders.map((f) => f.name).join('、');
    log(s, `始祖${names}帶領${tr.name}，從${s.settlements[0].name}的洞穴裡走了出來。`, 'era');
    if (traits.some((t) => D.TRAITS[t].fire)) {
      s.civ.flags.fire = true;
      log(s, '火之子在掌心點起了火焰。人類從一開始就會用火。', 'good');
    }
    const first = D.NODES.find((n) => n.path === s.founders[0].interest && n.tier === 1);
    if (first) s.civ.research = first.id;
    refreshAvg(s);
  }

  // ── 新世界 ──────────────────────────────────────────
  function newWorld(meta) {
    meta = meta || {};
    const seed = Math.floor(R() * 1e9);
    const map = genMap(seed);
    const s = {
      version: 2, seed, map, mapVer: 0, phase: 'setup',
      worldNo: (meta.worldsCreated || 0) + 1,
      worldName: pick(D.NAMES.world1) + pick(D.NAMES.world2),
      tick: 0, founders: [],
      herds: [], settlements: [], tribes: [], relics: [],
      civ: { era: 0, tech: 0, culture: 0, tension: 0, pollution: 0, faith: 20, mods: [], cd: {}, flags: {}, research: null, prog: {}, done: [], bank: 0, oddSeen: 0 },
      crisis: null, lastCrisis: 0, over: null, lastCause: null,
      log: [], logSeq: 0, nextId: 1, discoveries: [], usedNames: [],
      nature: 100, forest0: 1, herd0: 1, extinctSpecies: [],
      stats: { miracles: 0, peakPop: 0 },
    };
    computeMass(s);
    const massSize = new Map();
    for (let i = 0; i < W * H; i++) if (RT.mass[i] >= 0) massSize.set(RT.mass[i], (massSize.get(RT.mass[i]) || 0) + 1);

    const cands = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y), t = map[i];
      if (![2, 3, 12, 9].includes(t) || (massSize.get(RT.mass[i]) || 0) < 60) continue;
      let sc = 0, water = false;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const tt = map[idx(x + ox, y + oy)];
        sc += T[tt].food;
        if (isSea(tt) || tt === 11) water = true;
      }
      if (water) sc += 4;
      sc -= dist(x, y, W / 2, H / 2) * 0.15;
      cands.push({ x, y, sc });
    }
    cands.sort((a, b) => b.sc - a.sc);
    const start = cands.length ? pick(cands.slice(0, 15)) : { x: W >> 1, y: H >> 1 };
    const tribe = makeTribe(s, null);
    addSettlement(s, start.x, start.y, 12, tribe.id);

    for (const type of Object.keys(D.ANIMALS)) {
      const A = D.ANIMALS[type];
      for (let k = 0; k < A.count; k++) spawnHerd(s, type, k < 2 && A.prey ? start : null, A.sea ? 10 : 6);
    }

    for (const r of (meta.relics || []).slice(-3)) {
      for (let k = 0; k < 100; k++) {
        const x = Math.floor(R() * W), y = Math.floor(R() * H);
        if (!T[map[idx(x, y)]].land || dist(x, y, start.x, start.y) < 6) continue;
        s.relics.push({ x, y, name: r.name, era: r.era, world: r.world, found: false });
        break;
      }
    }

    s.forest0 = Math.max(1, map.filter(isWood).length);
    s.herd0 = Math.max(1, s.herds.filter((h) => D.ANIMALS[h.type].prey).reduce((a, h) => a + h.n, 0));
    s.founders = [rollFounder([])];
    s.founders.push(rollFounder(s.founders.map((f) => f.name)));
    s.founders.push(rollFounder(s.founders.map((f) => f.name)));

    log(s, `第 ${s.worldNo} 個世界「${s.worldName}」誕生了。`, 'era');
    if (s.relics.length) log(s, '這片大地底下，似乎埋著不屬於這個世界的東西……', 'myth');
    prepare(s);
    return s;
  }

  // 讀檔或建立世界後重建快取
  function prepare(s) {
    computeMass(s);
    refreshNodeMods(s);
    computeOwnership(s);
    refreshAvg(s);
    refreshGeo(s);
  }

  function refreshGeo(s) {
    RT.volcNear = false;
    let coast = 0;
    for (const st of s.settlements) {
      if (isCoastal(s, st)) coast++;
      if (!RT.volcNear) {
        for (let oy = -5; oy <= 5 && !RT.volcNear; oy++) for (let ox = -5; ox <= 5; ox++) {
          const x = st.x + ox, y = st.y + oy;
          if (inb(x, y) && s.map[idx(x, y)] === 10) { RT.volcNear = true; break; }
        }
      }
    }
    RT.coastal = s.settlements.length ? coast / s.settlements.length : 0;
  }

  // ── 領地與糧食 ──────────────────────────────────────
  function computeOwnership(s) {
    const r = D.ERAS[s.civ.era].radius;
    const own = RT.owner, od = RT.ownDist;
    own.fill(-1); od.fill(99);
    for (const st of s.settlements) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        const x = st.x + ox, y = st.y + oy;
        if (!inb(x, y)) continue;
        const d = Math.hypot(ox, oy);
        if (d > r + 0.3) continue;
        const i = idx(x, y);
        if (s.map[i] === 0) continue;
        if (d < od[i]) { od[i] = d; own[i] = st.id; }
      }
    }
  }

  function computeCaps(s, agg) {
    const c = s.civ, era = c.era, E = D.ERAS[era], caps = RT.caps;
    caps.clear();
    for (const st of s.settlements) caps.set(st.id, 0);
    const own = RT.owner;
    const farm = has(s, 'farm2'), irrig = has(s, 'farm3');
    for (let i = 0; i < own.length; i++) {
      const o = own[i];
      if (o < 0) continue;
      const t = s.map[i];
      let f = T[t].food;
      if (farm && (t === 2 || t === 12)) f *= 1.4;
      if (irrig && t === 12) f *= 1.5;
      caps.set(o, caps.get(o) + f);
    }
    const r = E.radius;
    const domestic = has(s, 'nat2');
    let landHunt = [0.7, 0.7, 0.35, 0, 0, 0, 0][era];
    if (domestic) landHunt = Math.max(landHunt, 0.5) * (1 + 0.15 * E.food);
    const seaScale = 0.6 + 0.35 * E.food;
    const whaling = has(s, 'sea3');
    for (const st of s.settlements) {
      const a = agg.get(st.tribe);
      const m = a ? a.m : {};
      let c2 = caps.get(st.id) * E.food;
      for (const h of s.herds) {
        const A = D.ANIMALS[h.type];
        if (!A.prey) continue;
        if (dist(h.x, h.y, st.x, st.y) > r + 1.5) continue;
        if (A.sea) {
          if (A.whale && !whaling) continue;
          c2 += h.n * (A.whale ? 1.5 : 0.45) * seaScale * tm(m, 'fish') * gm(s, 'fish');
        } else if (landHunt) {
          c2 += h.n * landHunt * tm(m, 'hunt') * gm(s, 'hunt');
        }
      }
      c2 *= (0.55 + 0.45 * (s.nature / 100)) * tm(m, 'food') * gm(s, 'food');
      caps.set(st.id, Math.max(4, c2));
    }
    return caps;
  }

  // ── 研究 ────────────────────────────────────────────
  function nodeStatus(s, id) {
    const n = NODE[id], c = s.civ;
    if (c.done.includes(id)) return 'done';
    if (n.tier > 1) {
      const prev = D.NODES.find((x) => x.path === n.path && x.tier === n.tier - 1);
      if (prev && !c.done.includes(prev.id)) return 'locked';
    }
    if (c.era < n.era) return 'era';
    return 'open';
  }
  const pathMult = (s, p) => M(s, 'path_' + p);

  function setResearch(s, id) {
    if (id && nodeStatus(s, id) !== 'open') return false;
    s.civ.research = id || null;
    if (id && s.civ.bank > 0) {
      const n = NODE[id];
      const need = n.cost - (s.civ.prog[id] || 0);
      const use = Math.min(need, s.civ.bank);
      s.civ.prog[id] = (s.civ.prog[id] || 0) + use;
      s.civ.bank -= use;
      if (s.civ.prog[id] >= n.cost) completeNode(s, id);
    }
    return true;
  }

  function completeNode(s, id) {
    const c = s.civ, n = NODE[id];
    if (c.done.includes(id)) return;
    c.done.push(id);
    delete c.prog[id];
    refreshNodeMods(s);
    const P = D.PATHS.find((p) => p.id === n.path);
    log(s, `${P.icon} 研究完成：${n.name}。${n.desc}`, 'research');
    s.discoveries.push({ kind: 'nodes', id });
    if (n.myth) applyEffects(s, [{ t: 'myth', pool: n.myth.pool, chance: n.myth.chance, scope: 'tribe' }], {});
    if (c.research === id) {
      const next = D.NODES.find((x) => x.path === n.path && x.tier === n.tier + 1);
      c.research = next && nodeStatus(s, next.id) === 'open' ? next.id : null;
    }
  }

  function addResearch(s, pts) {
    const c = s.civ;
    if (c.research && nodeStatus(s, c.research) !== 'open') c.research = null;
    if (!c.research) { c.bank += pts; return; }
    const n = NODE[c.research];
    c.prog[n.id] = (c.prog[n.id] || 0) + pts * pathMult(s, n.path);
    if (c.prog[n.id] >= n.cost) {
      const extra = (c.prog[n.id] - n.cost) / pathMult(s, n.path);
      completeNode(s, n.id);
      if (extra > 0.01) addResearch(s, extra);
    }
  }

  // ── 神話 ────────────────────────────────────────────
  function gainBelief(s, tribe, id) {
    if (!tribe || !tribe.alive || tribe.beliefs.includes(id)) return false;
    const B = D.BELIEFS[id];
    if (!B) return false;
    tribe.beliefs.push(id);
    log(s, `【${B.name}】` + fill(B.text, { tribe }, s), 'myth');
    s.discoveries.push({ kind: 'myths', id });
    if (tribe.beliefs.length > 4) {
      const old = tribe.beliefs.shift();
      log(s, `${tribe.name}漸漸遺忘了「${D.BELIEFS[old].name}」。`, 'info');
    }
    return true;
  }

  // ── 聚落清理 ────────────────────────────────────────
  function cleanup(s) {
    const dead = s.settlements.filter((x) => x.pop < 1);
    if (dead.length) {
      s.settlements = s.settlements.filter((x) => x.pop >= 1);
      for (const d of dead) if (d.cap > 30 || s.civ.era >= 2) log(s, `${d.name}成了一片廢墟。`, 'bad');
    }
    for (const tr of s.tribes) {
      if (!tr.alive) continue;
      const mine = settlementsOf(s, tr.id);
      if (!mine.length) {
        tr.alive = false;
        if (s.settlements.length) log(s, `${tr.name}消失在歷史之中。`, 'bad');
      } else if (!mine.some((x) => x.id === tr.capital)) {
        tr.capital = mine.reduce((a, b) => (b.pop > a.pop ? b : a)).id;
      }
    }
  }

  // ── 擴張 ────────────────────────────────────────────
  function trySpread(s, st, far) {
    if (s.settlements.length >= 50) return null;
    const r = D.ERAS[s.civ.era].radius;
    const reach = has(s, 'sea4') ? 1.5 : 1;
    const [d0, d1] = far ? [r + 3, (r * 3 + 6) * reach] : [r + 1.5, (r * 2 + 2.5) * reach];
    const boats = has(s, 'sea2');
    const myMass = RT.mass[idx(st.x, st.y)];
    for (let k = 0; k < 30; k++) {
      const a = R() * Math.PI * 2, d = rand(d0, d1);
      const x = Math.round(st.x + Math.cos(a) * d), y = Math.round(st.y + Math.sin(a) * d);
      if (!inb(x, y) || !landOk(s.map[idx(x, y)])) continue;
      if (!boats && RT.mass[idx(x, y)] !== myMass) continue;
      const n = nearestSettlement(s, x, y);
      if (n && n.d < r * 1.5) continue;
      const pop = Math.max(3, st.pop * 0.3);
      st.pop -= pop;
      const tr = tribeById(s, st.tribe);
      const cap = settlementById(s, tr.capital);
      const overseas = RT.mass[idx(x, y)] !== myMass;
      if (s.civ.era >= 1 && !has(s, 'war4') && aliveTribes(s).length < 6 && cap && (dist(x, y, cap.x, cap.y) > 8 || overseas) && R() < (overseas ? 0.45 : 0.3)) {
        const nt = makeTribe(s, tr);
        const ns = addSettlement(s, x, y, pop, nt.id);
        log(s, `${tr.name}的一群人在${ns.name}自立門戶，稱自己為${nt.name}。`, 'info');
        return ns;
      }
      const ns = addSettlement(s, x, y, pop, st.tribe);
      if (overseas) log(s, `${tr.name}的獨木舟靠岸了，他們在海的另一邊建立了${ns.name}。`, 'good');
      return ns;
    }
    return null;
  }

  // ── 地形變化 ────────────────────────────────────────
  function burn(s, n, center) {
    const woods = [];
    for (let i = 0; i < s.map.length; i++) if (isWood(s.map[i])) woods.push(i);
    if (!woods.length) return 0;
    if (!center) {
      const c = woods[Math.floor(R() * woods.length)];
      center = { x: c % W, y: Math.floor(c / W) };
    }
    const list = woods.map((i) => ({ i, d: dist(i % W, Math.floor(i / W), center.x, center.y) + R() * 3 }))
      .sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.i);
    for (const i of list) s.map[i] = 2;
    s.mapVer++;
    return list.length;
  }

  function regrow(s, n) {
    const cands = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (s.map[i] !== 2 && s.map[i] !== 4) continue;
      let adj = 0;
      for (const [ox, oy] of N4) if (inb(x + ox, y + oy) && isWood(s.map[idx(x + ox, y + oy)])) adj++;
      cands.push({ i, w: adj + (RT.owner[i] < 0 ? 1 : 0) + R() });
    }
    cands.sort((a, b) => b.w - a.w);
    for (const c of cands.slice(0, n)) s.map[c.i] = 3;
    if (n) s.mapVer++;
  }

  function makePatch(s, n, type, center) {
    if (!center) {
      for (let k = 0; k < 100; k++) {
        const x = Math.floor(R() * W), y = Math.floor(R() * H);
        if (T[s.map[idx(x, y)]].settle) { center = { x, y }; break; }
      }
    }
    if (!center) return;
    const cands = [];
    for (let oy = -5; oy <= 5; oy++) for (let ox = -5; ox <= 5; ox++) {
      const x = center.x + ox, y = center.y + oy;
      if (!inb(x, y)) continue;
      const t = s.map[idx(x, y)];
      if (!T[t].settle || t === 12 || t === type) continue;
      if (s.settlements.some((st) => st.x === x && st.y === y)) continue;
      cands.push({ i: idx(x, y), d: Math.hypot(ox, oy) + R() * 2 });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, n)) s.map[c.i] = type;
    s.mapVer++;
  }

  // ── 效果解釋器 ──────────────────────────────────────
  function targetsFor(s, e, ctx) {
    switch (e.scope) {
      case 'tribe': return ctx.tribe ? settlementsOf(s, ctx.tribe.id) : [];
      case 'settlement': return ctx.settlement && s.settlements.includes(ctx.settlement) ? [ctx.settlement] : [];
      case 'area': {
        const c = ctx.tile || (ctx.settlement && { x: ctx.settlement.x, y: ctx.settlement.y });
        if (!c) return [];
        const r = e.r || ctx.radius || 5;
        return s.settlements.filter((x) => dist(x.x, x.y, c.x, c.y) <= r);
      }
      default: return s.settlements.slice();
    }
  }
  const ctxCenter = (ctx) => ctx.tile || (ctx.settlement && { x: ctx.settlement.x, y: ctx.settlement.y }) || null;

  function startCrisis(s, def, ctxIn) {
    const tribe = (ctxIn && ctxIn.tribe) || randomTribe(s);
    const tribeB = def.needsTwo ? pick(aliveTribes(s).filter((t) => t !== tribe)) : null;
    const st = (ctxIn && ctxIn.settlement) || (tribe ? randomSettlementOf(s, tribe.id) : null);
    const ctx = { tribe, tribeB, settlement: st };
    if (def.flag) s.civ.flags[def.flag] = true;
    const text = fill(def.text, ctx, s);
    s.crisis = { id: def.id, tribe: tribe && tribe.id, tribeB: tribeB && tribeB.id, settlement: st && st.id, text, year: s.tick * YEARS };
    log(s, `【${def.name}】${text}`, 'crisis');
  }

  function applyEffects(s, effs, ctx) {
    if (!effs) return;
    const c = s.civ;
    for (const e of effs) {
      const sc = e.sc ? 1 + c.era : 1;
      switch (e.t) {
        case 'tech': c.tech += e.v * sc; break;
        case 'techPct': c.tech += e.v * eraSpan(s); break;
        case 'research': {
          const n = c.research && NODE[c.research];
          if (n) addResearch(s, Math.min(e.max || 50 * (1 + c.era), e.pct * n.cost) / pathMult(s, n.path));
          else c.bank += e.pct * 40 * (1 + c.era);
          break;
        }
        case 'completeNode': {
          const n = c.research && NODE[c.research];
          if (n) completeNode(s, n.id);
          break;
        }
        case 'culture': c.culture = Math.max(0, c.culture + e.v * sc); break;
        case 'tension': c.tension = clamp(c.tension + e.v, 0, 120); break;
        case 'tensionSet': c.tension = e.v; break;
        case 'faith': c.faith = clamp(c.faith + e.v, 0, faithCap(s)); break;
        case 'pollution': c.pollution = clamp(c.pollution + e.v, 0, 100); break;
        case 'flag':
          if (e.k === 'fire' && !c.flags.fire && c.era === 0) log(s, '人類學會了用火。', 'era');
          c.flags[e.k] = true; break;
        case 'devotion': {
          const trs = e.scope === 'tribe' ? [ctx.tribe].filter(Boolean) : aliveTribes(s);
          for (const tr of trs) tr.devotion = clamp(tr.devotion + e.v, 0, 1);
          break;
        }
        case 'pop': {
          const ts = targetsFor(s, e, ctx);
          let p = rand(e.pct[0], e.pct[1]);
          if (e.cause !== 'wrath' && p < 1) p = Math.min(1, p * M(s, 'resilience'));
          for (const st of ts) { st.pop *= 1 - p; if (st.pop < 2.5) st.pop = 0; }
          if (e.cause && ts.length) s.lastCause = e.cause;
          if (p >= 0.3 && e.scope === 'all') {
            const floor = D.ERAS[c.era].req;
            const loss = Math.min(c.tech - floor, p * 0.35 * eraSpan(s));
            if (loss > 1) { c.tech -= loss; log(s, '大量知識隨著死者一起失傳了。', 'bad'); }
          }
          cleanup(s);
          break;
        }
        case 'boom': {
          for (const st of targetsFor(s, e, ctx)) {
            st.pop = e.over ? st.pop * (1 + e.pct) : Math.max(st.pop, Math.min(st.pop * (1 + e.pct), (st.cap || st.pop) * 1.15));
          }
          break;
        }
        case 'mod': c.mods.push({ k: e.k, mult: e.mult, until: s.tick + e.dur }); break;
        case 'burn': burn(s, e.n, ctxCenter(ctx)); break;
        case 'regrow': regrow(s, e.n); break;
        case 'crystal': makePatch(s, e.n, e.type || 15, ctxCenter(ctx)); break;
        case 'herds': {
          const types = ['deer', 'deer', 'bison', 'bison', 'wolf'];
          for (let k = 0; k < e.n; k++) spawnHerd(s, pick(types), e.near ? ctx.tile : null);
          break;
        }
        case 'spawn': {
          const near = ctxCenter(ctx);
          for (let k = 0; k < e.n; k++) spawnHerd(s, e.type, near, 10);
          break;
        }
        case 'killMonster': {
          const before = s.herds.length;
          s.herds = s.herds.filter((h) => !D.ANIMALS[h.type].monster);
          if (s.herds.length < before) log(s, '海怪沉回了深淵。', 'good');
          break;
        }
        case 'colony': {
          if (!ctx.tile) break;
          const n = nearestSettlement(s, ctx.tile.x, ctx.tile.y);
          if (!n) break;
          const pop = Math.max(3, n.st.pop * 0.25);
          n.st.pop = Math.max(1, n.st.pop - pop);
          const ns = addSettlement(s, ctx.tile.x, ctx.tile.y, pop, n.st.tribe);
          log(s, `${tribeById(s, n.st.tribe).name}在${ns.name}建立了新家園。`, 'good');
          break;
        }
        case 'migrate': {
          for (let k = 0; k < e.n; k++) {
            const st = weightedPick(s.settlements, (x) => x.pop);
            if (st) trySpread(s, st, true);
          }
          break;
        }
        case 'schism': {
          const big = aliveTribes(s).map((t) => ({ t, list: settlementsOf(s, t.id) })).filter((o) => o.list.length >= 2);
          if (!big.length || aliveTribes(s).length >= 8) {
            const tr = ctx.tribe || randomTribe(s);
            if (tr) { tr.devotion = clamp(tr.devotion - 0.15, 0, 1); log(s, `${tr.name}的信徒之間出現了裂痕。`, 'bad'); }
            break;
          }
          const o = pick(big);
          const cap = settlementById(s, o.t.capital) || o.list[0];
          o.list.sort((a, b) => dist(b.x, b.y, cap.x, cap.y) - dist(a.x, a.y, cap.x, cap.y));
          const nt = makeTribe(s, o.t);
          for (const st of o.list.slice(0, Math.ceil(o.list.length / 2))) st.tribe = nt.id;
          cleanup(s);
          const mine = settlementsOf(s, nt.id);
          nt.capital = mine.length ? mine[0].id : null;
          c.tension = clamp(c.tension + 15, 0, 120);
          log(s, `${o.t.name}分裂了，脫離的人自稱${nt.name}。`, 'bad');
          break;
        }
        case 'conquer': {
          let a = ctx.tribe, b = ctx.tribeB;
          if (!a || !b || !a.alive || !b.alive) break;
          if (tribePop(s, b.id) > tribePop(s, a.id)) [a, b] = [b, a];
          for (const st of settlementsOf(s, b.id)) st.tribe = a.id;
          cleanup(s);
          log(s, `${a.name}征服了${b.name}。`, 'bad');
          break;
        }
        case 'conquerAll': {
          const trs = aliveTribes(s);
          if (trs.length < 2) break;
          const big = trs.reduce((a, b) => (tribePop(s, b.id) > tribePop(s, a.id) ? b : a));
          for (const st of s.settlements) st.tribe = big.id;
          cleanup(s);
          log(s, `${big.name}統一了整個世界。`, 'era');
          break;
        }
        case 'destroy': {
          for (let k = 0; k < e.n && s.settlements.length > 1; k++) pick(s.settlements).pop = 0;
          if (e.cause) s.lastCause = e.cause;
          cleanup(s);
          break;
        }
        case 'extinct':
          for (const st of s.settlements) st.pop = 0;
          s.lastCause = e.cause || 'collapse';
          cleanup(s);
          break;
        case 'crisis': {
          if (s.crisis || s.over) break;
          const def = D.CRISES.find((d) => d.id === e.id);
          if (def && (!def.needsTwo || aliveTribes(s).length >= 2)) startCrisis(s, def, ctx);
          break;
        }
        case 'chance':
          applyEffects(s, R() < e.p ? e.then : e.else, ctx);
          break;
        case 'log': log(s, fill(e.text, ctx, s), e.kind || 'info'); break;
        case 'myth': {
          const trs = e.scope === 'each' ? aliveTribes(s) : [ctx.tribe || randomTribe(s)].filter(Boolean);
          for (const tr of trs) {
            if (R() >= e.chance) continue;
            const pool = e.pool.filter((id) => !tr.beliefs.includes(id));
            if (pool.length) gainBelief(s, tr, pick(pool));
          }
          break;
        }
      }
    }
  }

  function eventCtx(s, needsCoast) {
    let st = null;
    if (needsCoast) {
      const coast = s.settlements.filter((x) => isCoastal(s, x));
      if (!coast.length) return null;
      st = weightedPick(coast, (x) => x.pop);
    }
    const tribe = st ? tribeById(s, st.tribe) : randomTribe(s);
    if (!tribe) return null;
    return {
      tribe,
      tribeB: pick(aliveTribes(s).filter((t) => t !== tribe)) || null,
      settlement: st || randomSettlementOf(s, tribe.id),
    };
  }

  // ── 每回合 ──────────────────────────────────────────
  function tick(s) {
    if (s.over || s.crisis || s.phase !== 'play') return false;
    s.tick++;
    const c = s.civ, era = c.era, E = D.ERAS[era], r = E.radius;

    computeOwnership(s);
    const agg = new Map();
    for (const tr of aliveTribes(s)) agg.set(tr.id, { tr, pop: 0, m: tribeMods(tr) });
    const caps = computeCaps(s, agg);

    // 聚落成長
    let over = 0;
    const gGrowth = gm(s, 'growth');
    for (const st of s.settlements) {
      const a = agg.get(st.tribe);
      const cap = caps.get(st.id) || 4;
      st.cap = cap;
      const g = 0.03 * (a ? tm(a.m, 'growth') : 1) * gGrowth;
      if (st.pop < cap) st.pop += g * st.pop * (1 - st.pop / cap) + 0.02;
      else { st.pop -= (st.pop - cap) * 0.06; over++; }
    }
    const overFrac = s.settlements.length ? over / s.settlements.length : 0;

    // 擴張
    const gExpand = gm(s, 'expand');
    for (const st of s.settlements.slice()) {
      const a = agg.get(st.tribe);
      const ex = (a ? tm(a.m, 'expand') : 1) * gExpand;
      if (st.pop > st.cap * 0.7 && st.pop >= 14 && R() < 0.03 * ex) trySpread(s, st, false);
    }

    // 動物
    const huntF = [1, 1, 0.6, 0.4, 0.25, 0.15, 0.1][era] * (has(s, 'nat2') ? 0.5 : 1);
    const seaF = [1, 1, 0.7, 0.5, 0.35, 0.25, 0.2][era];
    const whaling = has(s, 'sea3'), spears = has(s, 'war1'), legion = has(s, 'war3');
    for (const h of s.herds) {
      const A = D.ANIMALS[h.type];
      if (!A.monster) h.n += 0.05 * h.n * (1 - h.n / A.cap);
      for (const st of s.settlements) {
        const d = dist(h.x, h.y, st.x, st.y);
        if (d <= r + 1) {
          if (A.monster) { /* 不會被獵捕 */ }
          else if (A.sea) {
            if (!A.whale || whaling) h.n -= st.pop * 0.0006 * seaF * (A.whale ? 0.6 : 1);
          } else {
            h.n -= st.pop * 0.0015 * huntF * (A.danger ? 0.3 : 1);
            if (era >= 3) h.n -= 0.05;
          }
        }
        if (A.danger && era <= 2 && d <= 2 && st.pop < 80 && !spears && R() < 0.004) {
          const a = agg.get(st.tribe);
          if (!(a && a.m.wolfSafe)) {
            st.pop *= 0.92;
            s.lastCause = 'wolves';
            log(s, `${A.name}在夜裡襲擊了${st.name}。`, 'bad');
          }
        }
        if (A.monster && d <= 3 && R() < 0.003) {
          if (legion) {
            h.n = 0;
            log(s, `${st.name}的軍團駕船出海，斬殺了糾纏他們多年的海怪。`, 'good');
          } else {
            st.pop *= 0.88;
            s.lastCause = 'kraken';
            log(s, `海怪從深海伸出觸手，把${st.name}的漁船拖進了海底。`, 'bad');
          }
        }
      }
      if (h.type === 'wolf' || h.type === 'croc') {
        const prey = s.herds.find((o) => D.ANIMALS[o.type].prey && !D.ANIMALS[o.type].sea && dist(o.x, o.y, h.x, h.y) <= 3);
        if (prey) { prey.n -= 0.12; h.n += 0.03; } else h.n -= 0.03;
      }
      if (R() < (A.monster ? 0.15 : 0.08)) {
        const nx = h.x + Math.round(rand(-1, 1)), ny = h.y + Math.round(rand(-1, 1));
        if (inb(nx, ny) && A.terrain.includes(s.map[idx(nx, ny)])) { h.x = nx; h.y = ny; }
      }
      if (!A.monster && h.n > A.cap * 0.9 && R() < 0.01 && s.herds.length < 48) {
        const nh = spawnHerd(s, h.type, { x: h.x, y: h.y }, 3);
        if (nh) { nh.n = h.n / 2; h.n /= 2; }
      }
    }
    s.herds = s.herds.filter((h) => h.n >= 0.5);
    for (const type of Object.keys(D.ANIMALS)) {
      if (D.ANIMALS[type].monster) continue;
      const alive = s.herds.some((h) => h.type === type);
      if (!alive && !s.extinctSpecies.includes(type)) {
        s.extinctSpecies.push(type);
        log(s, `${D.ANIMALS[type].name}從這個世界上消失了。`, 'bad');
      } else if (alive && s.extinctSpecies.includes(type)) {
        s.extinctSpecies = s.extinctSpecies.filter((x) => x !== type);
      }
    }
    if (!s.herds.some((h) => h.type === 'kraken') && R() < 0.0005) spawnHerd(s, 'kraken', null);

    cleanup(s);

    // 文明數值
    for (const st of s.settlements) { const a = agg.get(st.tribe); if (a) a.pop += st.pop; }
    let P = 0, techG = 0, cultG = 0, faithG = 0, tensAdd = 0, pollM = 0;
    const alive = aliveTribes(s);
    const baseDev = [0.55, 0.55, 0.5, 0.45, 0.35, 0.25, 0.15][era];
    for (const a of agg.values()) {
      if (!a.tr.alive || a.pop <= 0) continue;
      const sp = Math.sqrt(a.pop);
      P += a.pop;
      techG += sp * 0.02 * tm(a.m, 'tech');
      cultG += sp * 0.012 * tm(a.m, 'culture');
      faithG += a.tr.devotion * sp * 0.12 * tm(a.m, 'faith');
      tensAdd += a.m.tension;
      pollM += a.pop * tm(a.m, 'pollution');
      const target = clamp(baseDev + a.m.devotion + RT.nmAdd.devotion, 0, 1);
      a.tr.devotion += (target - a.tr.devotion) * 0.004;
    }
    pollM = P > 0 ? pollM / P : 1;
    if (era === 0 && !c.flags.fire) {
      techG *= 0.35;
      if (R() < 0.002) applyEffects(s, [{ t: 'flag', k: 'fire' }], {});
    }
    techG *= gm(s, 'tech');
    if (has(s, 'mys4')) {
      let mystic = 0;
      for (let i = 0; i < RT.owner.length; i++) if (RT.owner[i] >= 0 && T[s.map[i]].mystic) mystic++;
      techG += mystic * 0.04;
    }
    c.tech += techG;
    addResearch(s, techG * 0.6);
    c.culture += cultG * gm(s, 'culture') * (1 - c.tension / 250);
    c.faith = clamp(c.faith + faithG * gm(s, 'faith'), 0, faithCap(s));
    const nT = alive.length;
    tensAdd += RT.nmAdd.tension;
    c.tension = clamp(c.tension * 0.995 + (nT > 1 ? 0.06 * (nT - 1) + tensAdd : tensAdd * 0.3) + overFrac * 0.25, 0, 120);
    // 帝國：慢慢併吞其他部族
    if (nT > 1 && has(s, 'war4') && R() < 0.015) {
      const big = alive.reduce((a, b) => (tribePop(s, b.id) > tribePop(s, a.id) ? b : a));
      const small = pick(alive.filter((t) => t !== big));
      for (const st of settlementsOf(s, small.id)) st.tribe = big.id;
      cleanup(s);
      log(s, `${small.name}被併入了${big.name}的帝國。`, 'info');
    }
    if (era >= 5) {
      c.pollution += Math.sqrt(P) * 0.0018 * pollM * gm(s, 'pollution') * (c.flags.green ? 0.5 : 1) * (era === 6 ? 0.6 : 1);
    }
    c.pollution = clamp(c.pollution * 0.995, 0, 100);

    // 砍伐與森林再生
    const deforEra = [0, 0, 0.3, 0.5, 0.7, 1, 0.6][era];
    if (deforEra > 0) {
      const gDefor = gm(s, 'defor');
      for (const st of s.settlements) {
        const a = agg.get(st.tribe);
        if (R() >= 0.008 * deforEra * (a ? tm(a.m, 'defor') : 1) * gDefor) continue;
        for (let k = 0; k < 10; k++) {
          const x = st.x + Math.round(rand(-r, r)), y = st.y + Math.round(rand(-r, r));
          if (inb(x, y) && isWood(s.map[idx(x, y)])) { s.map[idx(x, y)] = 2; s.mapVer++; break; }
        }
      }
    }
    const regrowP = has(s, 'nat5') ? 0.4 : 0.06;
    if (R() < regrowP) {
      const x = Math.floor(R() * W), y = Math.floor(R() * H), i = idx(x, y);
      if (s.map[i] === 2 && (RT.owner[i] < 0 || has(s, 'nat5'))) {
        const adj = N4.some(([ox, oy]) => inb(x + ox, y + oy) && isWood(s.map[idx(x + ox, y + oy)]));
        if (adj) { s.map[i] = 3; s.mapVer++; }
      }
    }

    // 自然指數
    let wood = 0;
    for (let i = 0; i < s.map.length; i++) if (isWood(s.map[i])) wood++;
    const animals = s.herds.filter((h) => D.ANIMALS[h.type].prey).reduce((a, h) => a + h.n, 0);
    s.nature = clamp(100 * (0.55 * Math.min(1, wood / s.forest0) + 0.45 * Math.min(1, animals / s.herd0)) - c.pollution * 0.5, 0, 100);

    // 時代推進
    while (c.era < 6 && c.tech >= D.ERAS[c.era + 1].req) {
      c.era++;
      log(s, `══ 人類進入了${D.ERAS[c.era].name} ══`, 'era');
      s.discoveries.push({ kind: 'eras', id: c.era });
    }

    // 遺跡
    if (c.era >= 1) {
      for (const rl of s.relics) {
        if (rl.found) continue;
        const n = nearestSettlement(s, rl.x, rl.y);
        if (n && n.d <= 3) {
          rl.found = true;
          const tr = tribeById(s, n.st.tribe);
          log(s, `${n.st.name}的人挖出了一座古老的遺跡——那是「${rl.name}」。沒有人知道是誰建造的。`, 'myth');
          applyEffects(s, [{ t: 'tech', v: 6 * (rl.era + 1) }, { t: 'research', pct: 0.3 }, { t: 'culture', v: 4 * (rl.era + 1) }, { t: 'myth', pool: ['ancestor'], chance: 0.7, scope: 'tribe' }], { tribe: tr });
        }
      }
    }

    refreshAvg(s);
    if (s.tick % 10 === 0) refreshGeo(s);

    // 一般事件
    if (R() < 0.012 && s.settlements.length) {
      const evs = D.EVENTS.filter((e) => c.era >= (e.minEra || 0) && c.era <= (e.maxEra == null ? 9 : e.maxEra) &&
        (!e.needsTwo || nT >= 2) && !(e.once && c.flags['ev_' + e.id]) && (!e.coastal || RT.coastal > 0));
      const ev = weightedPick(evs, (e) => e.w);
      const ctx = ev && eventCtx(s, ev.coastal);
      if (ctx) {
        if (ev.once) c.flags['ev_' + ev.id] = true;
        log(s, fill(ev.text, ctx, s), ev.kind);
        applyEffects(s, ev.effects, ctx);
      }
    }

    // 奇特事件
    if (R() < 0.0035 * M(s, 'odd') && s.settlements.length) {
      const ods = D.ODDITIES.filter((o) => c.era >= (o.minEra || 0) && (!o.coastal || RT.coastal > 0));
      const od = weightedPick(ods, (o) => o.w);
      const ctx = od && eventCtx(s, od.coastal);
      if (ctx) {
        const tmods = tribeMods(ctx.tribe);
        let pGood = has(s, 'mys3') ? 0.8 : 0.45;
        if (tmods.cursed) pGood *= 0.5;
        const v = R() < pGood ? od.good : od.bad;
        c.oddSeen++;
        log(s, `${od.icon}【${od.name}】` + fill(v.text, ctx, s), 'odd');
        s.discoveries.push({ kind: 'odds', id: od.id });
        applyEffects(s, v.effects, ctx);
      }
    }

    c.mods = c.mods.filter((m) => m.until > s.tick);
    s.stats.peakPop = Math.max(s.stats.peakPop, P);

    if (checkEnd(s)) return true;

    // 危機
    if (!s.crisis && s.tick - s.lastCrisis > 40 && s.tick > 30) {
      const info = {
        era: c.era, P, nature: s.nature, overFrac, tribes: nT, tension: c.tension, pollution: c.pollution,
        flags: c.flags, coastal: RT.coastal, volcNear: RT.volcNear, m: (k) => M(s, k),
      };
      for (const def of D.CRISES) {
        if (def.needsTwo && nT < 2) continue;
        if (R() < def.prob(info)) { startCrisis(s, def); break; }
      }
    }
    return true;
  }

  function crisisCtx(s) {
    const k = s.crisis;
    return { tribe: tribeById(s, k.tribe), tribeB: tribeById(s, k.tribeB), settlement: settlementById(s, k.settlement) };
  }
  const optionVisible = (s, opt) => !opt.req || has(s, opt.req);

  function resolveCrisis(s, i) {
    if (!s.crisis) return null;
    const def = D.CRISES.find((d) => d.id === s.crisis.id);
    const opt = def.options[i];
    if (!opt || !optionVisible(s, opt) || s.civ.faith < costOf(s, opt.cost)) return null;
    s.civ.faith -= costOf(s, opt.cost);
    const ctx = crisisCtx(s);
    log(s, `你的決定：${opt.label}。${opt.result}`, 'god');
    s.crisis = null;
    applyEffects(s, opt.effects, ctx);
    s.lastCrisis = s.tick;
    computeOwnership(s);
    checkEnd(s);
    return opt.result;
  }

  // ── 結束判定 ────────────────────────────────────────
  function summary(s) {
    const P = totalPop(s);
    let dev = 0;
    for (const tr of aliveTribes(s)) dev += tr.devotion * tribePop(s, tr.id);
    const paths = {};
    for (const p of D.PATHS) paths[p.id] = 0;
    for (const id of s.civ.done) paths[NODE[id].path]++;
    return {
      P, era: s.civ.era, tech: s.civ.tech, culture: s.civ.culture, tension: s.civ.tension,
      pollution: s.civ.pollution, nature: s.nature, devotion: P > 0 ? dev / P : 0,
      faith: s.civ.faith, faithCap: faithCap(s), tribes: aliveTribes(s).length, settlements: s.settlements.length,
      paths, oddSeen: s.civ.oddSeen,
    };
  }

  function checkEnd(s) {
    if (s.over) return true;
    if (s.phase !== 'play') return false;
    if (totalPop(s) < 1 || !s.settlements.length) {
      const cause = s.lastCause || 'collapse';
      s.over = { type: 'extinct', id: cause, year: s.tick * YEARS, era: s.civ.era };
      s.crisis = null;
      log(s, `最後一個人倒下了。${D.DOOMS[cause].name}。`, 'crisis');
      s.discoveries.push({ kind: 'dooms', id: cause });
      return true;
    }
    if (s.civ.era === 6 && s.civ.tech >= D.END_TECH) {
      const x = summary(s);
      const end = D.ENDINGS.find((e) => e.cond(x));
      s.over = { type: 'ending', id: end.id, year: s.tick * YEARS, era: 6 };
      log(s, `【結局：${end.name}】${end.text}`, 'era');
      s.discoveries.push({ kind: 'endings', id: end.id });
      return true;
    }
    return false;
  }

  // ── 奇蹟 ────────────────────────────────────────────
  function miracleBlock(s, id) {
    const m = D.MIRACLES.find((x) => x.id === id), c = s.civ;
    if (s.over) return '世界已結束';
    if (s.phase !== 'play') return '還沒開始';
    if (s.crisis) return '先處理危機';
    if (c.era < (m.minEra || 0)) return `需要${D.ERAS[m.minEra].name}`;
    if (m.maxEra != null && c.era > m.maxEra) return '時代已過';
    if (m.once && c.flags['m_' + id]) return '已施展';
    if (id === 'fire' && c.flags.fire) return '他們已經會用火了';
    if (id === 'insight' && !c.research) return '先選擇研究目標';
    const cd = (c.cd[id] || 0) - s.tick;
    if (cd > 0) return `冷卻中（${cd * YEARS} 年）`;
    if (c.faith < costOf(s, m.cost)) return '信仰不足';
    return null;
  }

  function validTarget(s, id, x, y) {
    const m = D.MIRACLES.find((o) => o.id === id);
    if (!inb(x, y)) return null;
    const t = s.map[idx(x, y)];
    if (m.target === 'tile') return { tile: { x, y } };
    if (m.target === 'settlement') {
      const n = nearestSettlement(s, x, y);
      return n && n.d <= 1.6 ? { settlement: n.st } : null;
    }
    if (m.target === 'colony') {
      if (!landOk(t)) return null;
      const n = nearestSettlement(s, x, y);
      if (!n || n.d < 2.5 || n.d > 16) return null;
      return { tile: { x, y } };
    }
    return {};
  }

  function castMiracle(s, id, target) {
    const block = miracleBlock(s, id);
    if (block) return { ok: false, msg: block };
    const m = D.MIRACLES.find((x) => x.id === id), c = s.civ;
    const ctx = { radius: m.radius };
    if (target && target.tile) ctx.tile = target.tile;
    if (target && target.settlement) ctx.settlement = target.settlement;
    if (ctx.settlement) ctx.tribe = tribeById(s, ctx.settlement.tribe);
    else if (ctx.tile) {
      const n = nearestSettlement(s, ctx.tile.x, ctx.tile.y);
      if (n) ctx.tribe = tribeById(s, n.st.tribe);
    }
    if (!ctx.tribe) ctx.tribe = randomTribe(s);
    if (!ctx.settlement && ctx.tribe && m.target === 'none') ctx.settlement = randomSettlementOf(s, ctx.tribe.id);

    c.faith -= costOf(s, m.cost);
    if (m.cd) c.cd[id] = s.tick + m.cd;
    if (m.once) c.flags['m_' + id] = true;
    s.stats.miracles++;
    log(s, `${m.icon} 你施展了「${m.name}」。` + fill(m.msg, ctx, s), 'god');
    applyEffects(s, m.effects, ctx);
    for (const se of m.side || []) {
      if (R() < se.p) { log(s, '副作用：' + se.text, 'bad'); applyEffects(s, se.effects, ctx); }
    }
    if (m.myth) applyEffects(s, [{ t: 'myth', ...m.myth }], ctx);
    computeOwnership(s);
    checkEnd(s);
    return { ok: true };
  }

  globalThis.Sim = {
    W, H, YEARS, RT, NODE,
    newWorld, prepare, tick, computeOwnership, castMiracle, miracleBlock, validTarget, resolveCrisis, optionVisible,
    rerollFounder, confirmFounders, setResearch, nodeStatus, pathMult,
    summary, tribePop, settlementsOf, tribeById, settlementById, aliveTribes, totalPop, eraSpan,
    nearestSettlement, faithCap, idx, costOf, tribeMods, has,
  };
})();
