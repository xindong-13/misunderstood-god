// 《誤解之神》介面、主迴圈、存檔
(function () {
  'use strict';
  const D = globalThis.DATA, Sim = globalThis.Sim, Render = globalThis.Render;
  const W = D.MAP_W, H = D.MAP_H;

  const SAVE_KEY = 'mgod_save_v2';
  const META_KEY = 'mgod_meta_v1';
  const TICK_MS = 2000;          // 1× 速度下每回合（5 年）的毫秒數
  const OFFLINE_TICK_MS = 20000; // 離線時每 20 秒前進一回合
  const MAX_OFFLINE = 1440;      // 離線最多前進 1440 回合（約 8 小時）
  const RELIC_OBJ = ['骨笛', '石圈', '陶甕', '神殿石柱', '黃金王冠', '巨大齒輪', '黑色方碑'];

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 萬' : Math.round(n).toLocaleString());
  const yearText = (y) => `創世 ${y.toLocaleString()} 年`;

  let s = null;
  let meta = null;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let lastLogSeq = -1;
  let lastSaveTick = 0;
  const ui = { hover: null, targeting: null };

  // ── 存檔 ────────────────────────────────────────────
  function loadMeta() {
    try { meta = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { meta = null; }
    meta = meta || {};
    meta.worldsCreated = meta.worldsCreated || 0;
    meta.codex = meta.codex || {};
    for (const k of ['endings', 'dooms', 'myths', 'eras', 'odds', 'nodes']) meta.codex[k] = meta.codex[k] || {};
    meta.relics = meta.relics || [];
    meta.history = meta.history || [];
    if (meta.speed != null) speed = meta.speed;
  }
  function save() {
    if (!s) return;
    s.savedAt = Date.now();
    s.savedSpeed = speed;
    meta.speed = speed;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) { console.warn('存檔失敗', e); }
  }
  function loadSave() {
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
    if (s && s.version !== 2) s = null;
    if (s) Sim.prepare(s);
    try { localStorage.removeItem('mgod_save_v1'); } catch (e) { /* 舊版存檔 */ }
  }

  function drainDiscoveries() {
    while (s.discoveries.length) {
      const d = s.discoveries.shift();
      if (meta.codex[d.kind]) meta.codex[d.kind][d.id] = (meta.codex[d.kind][d.id] || 0) + 1;
    }
  }

  function newWorld() {
    s = Sim.newWorld(meta);
    meta.worldsCreated++;
    acc = 0; lastLogSeq = -1;
    ui.targeting = null;
    save();
    refresh(true);
    checkPending();
  }

  // ── 離線進度 ────────────────────────────────────────
  function runOffline(since) {
    if (!s || s.over || s.crisis || s.phase !== 'play') return;
    if ((s.savedSpeed == null ? 1 : s.savedSpeed) === 0 && speed === 0) return;
    const elapsed = Date.now() - since;
    const n = Math.min(MAX_OFFLINE, Math.floor(elapsed / OFFLINE_TICK_MS));
    if (n < 3) return;
    const seq0 = s.logSeq, tick0 = s.tick;
    for (let i = 0; i < n; i++) if (!Sim.tick(s)) break;
    drainDiscoveries();
    const years = (s.tick - tick0) * Sim.YEARS;
    const important = s.log.filter((l) => l.seq > seq0 && l.kind !== 'info').slice(-14);
    const h = Math.floor(elapsed / 3600000), m = Math.floor((elapsed % 3600000) / 60000);
    const away = h ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
    let html = `<h2>🌙 你離開的時候</h2>
      <p class="muted">你離開了 ${away}，世界過了 <b>${years.toLocaleString()} 年</b>。</p>`;
    html += important.length
      ? `<div class="loglist">${important.map(logLine).join('')}</div>`
      : '<p>這段日子很平靜，沒有發生什麼大事。</p>';
    if (s.crisis) html += '<p class="warn">⚠️ 有一場危機正在等你處理。</p>';
    html += '<div class="actions"><button class="primary" data-close>回到世界</button></div>';
    openModal(html);
  }

  // ── 彈窗（排隊）────────────────────────────────────
  const modalQueue = [];
  let modalOpen = false;
  function openModal(html, onBind, wide) {
    modalQueue.push({ html, onBind, wide });
    if (!modalOpen) nextModal();
  }
  function nextModal() {
    const m = modalQueue.shift();
    if (!m) { modalOpen = false; $('modal').classList.add('hidden'); checkPending(); return; }
    modalOpen = true;
    $('modalBox').classList.toggle('wide', !!m.wide);
    $('modalBox').innerHTML = m.html;
    $('modal').classList.remove('hidden');
    $('modalBox').querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    if (m.onBind) m.onBind($('modalBox'));
  }
  function closeModal() { nextModal(); refresh(); }

  function checkPending() {
    if (modalOpen || !s) return;
    if (s.phase === 'setup') showFounders();
    else if (s.over && !s.over.shown) showEnd();
    else if (s.crisis) showCrisis();
  }

  // ── 危機 ────────────────────────────────────────────
  function showCrisis() {
    const def = D.CRISES.find((d) => d.id === s.crisis.id);
    const opts = def.options.map((o, i) => {
      if (!Sim.optionVisible(s, o)) return '';
      const cost = Sim.costOf(s, o.cost);
      const can = s.civ.faith >= cost;
      return `<button class="option" data-opt="${i}" ${can ? '' : 'disabled'}>
        <span class="opt-head"><b>${o.req ? '🔓 ' : ''}${esc(o.label)}</b><span class="cost">${cost ? '✨ ' + cost : '免費'}</span></span>
        <span class="opt-desc">${esc(o.desc)}${can ? '' : '（信仰不足）'}</span></button>`;
    }).join('');
    const html = `<div class="crisis-icon">${def.icon}</div><h2>${esc(def.name)}</h2>
      <p class="muted">${yearText(s.crisis.year)}・世界停了下來，等待你的決定。</p>
      <p class="story">${esc(s.crisis.text)}</p>
      <p class="muted">你目前有 ✨ ${Math.floor(s.civ.faith)} 信仰。</p>
      <div class="options">${opts}</div>`;
    openModal(html, (box) => {
      box.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
        const seq0 = s.logSeq;
        const res = Sim.resolveCrisis(s, +b.dataset.opt);
        if (res == null) return;
        drainDiscoveries();
        const lines = s.log.filter((l) => l.seq > seq0 && l.kind !== 'god');
        $('modalBox').innerHTML = `<h2>${esc(def.name)}・結果</h2><p class="story">${esc(res)}</p>
          ${lines.length ? `<div class="loglist">${lines.map(logLine).join('')}</div>` : ''}
          <div class="actions"><button class="primary" data-close>繼續</button></div>`;
        $('modalBox').querySelector('[data-close]').addEventListener('click', closeModal);
        save();
        refresh();
      }));
    });
  }

  // ── 結束 ────────────────────────────────────────────
  function recordOver() {
    if (s.over.recorded) return;
    s.over.recorded = true;
    const era = s.over.era;
    meta.relics.push({ name: `${s.worldName}的${RELIC_OBJ[era]}`, era, world: s.worldName });
    if (meta.relics.length > 20) meta.relics.shift();
    meta.history.push({
      no: s.worldNo, world: s.worldName, type: s.over.type, id: s.over.id, year: s.over.year, era,
      peak: Math.round(s.stats.peakPop),
    });
    save();
  }

  function showEnd() {
    recordOver();
    s.over.shown = true;
    const myths = new Set();
    for (const t of s.tribes) for (const b of t.beliefs) myths.add(b);
    const stat = `<div class="endstats">
      <div><span>經歷</span><b>${s.over.year.toLocaleString()} 年</b></div>
      <div><span>最高人口</span><b>${fmt(s.stats.peakPop)}</b></div>
      <div><span>到達</span><b>${D.ERAS[s.over.era].name}</b></div>
      <div><span>施展奇蹟</span><b>${s.stats.miracles} 次</b></div></div>`;
    let html;
    if (s.over.type === 'ending') {
      const e = D.ENDINGS.find((x) => x.id === s.over.id);
      html = `<div class="crisis-icon">${e.icon}</div><h2>結局：${esc(e.name)}</h2><p class="story">${esc(e.text)}</p>${stat}`;
    } else {
      const d = D.DOOMS[s.over.id];
      html = `<div class="crisis-icon">${d.icon}</div><h2>文明滅亡：${esc(d.name)}</h2>
        <p class="story">「${esc(s.worldName)}」上的人類走到了盡頭。他們留下的${RELIC_OBJ[s.over.era]}，會被埋進下一個世界的土裡。</p>${stat}`;
    }
    html += `<div class="actions"><button data-close>留下來看看</button><button class="primary" id="btnEndNew">🌍 創造新世界</button></div>`;
    openModal(html, (box) => box.querySelector('#btnEndNew').addEventListener('click', () => { modalQueue.length = 0; nextModal(); newWorld(); }));
  }

  // ── 圖鑑 ────────────────────────────────────────────
  function showCodex() {
    const C = meta.codex;
    const card = (known, icon, name, text) => known
      ? `<div class="card"><div class="card-h">${icon} ${esc(name)}</div>${text ? `<div class="card-t">${esc(text)}</div>` : ''}</div>`
      : '<div class="card unknown"><div class="card-h">？？？</div></div>';
    const ends = D.ENDINGS.map((e) => (C.endings[e.id] || !e.hidden ? card(C.endings[e.id], e.icon, e.name, e.text)
      : '<div class="card unknown"><div class="card-h">？？？（隱藏結局）</div></div>')).join('');
    const odds = D.ODDITIES.map((o) => card(C.odds[o.id], o.icon, o.name)).join('');
    const dooms = Object.entries(D.DOOMS).map(([k, d]) => card(C.dooms[k], d.icon, d.name)).join('');
    const myths = Object.entries(D.BELIEFS).map(([k, b]) => card(C.myths[k], '📜', b.name, b.text.replace(/\{tribe\}/g, '某個部族'))).join('');
    const n = (o) => Object.keys(o).length;
    const hist = meta.history.slice().reverse().map((h) => {
      const r = h.type === 'ending' ? `${D.ENDINGS.find((e) => e.id === h.id).icon} ${D.ENDINGS.find((e) => e.id === h.id).name}` : `${D.DOOMS[h.id].icon} ${D.DOOMS[h.id].name}`;
      return `<li>第 ${h.no} 個世界「${esc(h.world)}」：${r}（${h.year.toLocaleString()} 年，${D.ERAS[h.era].name}）</li>`;
    }).join('');
    const html = `<h2>📖 神的圖鑑</h2>
      <h3>結局 ${n(C.endings)} / ${D.ENDINGS.length}</h3><div class="cards">${ends}</div>
      <h3>滅亡方式 ${n(C.dooms)} / ${Object.keys(D.DOOMS).length}</h3><div class="cards small">${dooms}</div>
      <h3>奇特事件 ${n(C.odds)} / ${D.ODDITIES.length}</h3><div class="cards small">${odds}</div>
      <h3>人類的神話 ${n(C.myths)} / ${Object.keys(D.BELIEFS).length}</h3><div class="cards">${myths}</div>
      <h3>歷代世界</h3>${hist ? `<ul class="hist">${hist}</ul>` : '<p class="muted">還沒有任何世界走到盡頭。</p>'}
      <div class="actions"><button class="primary" data-close>關閉</button></div>`;
    openModal(html);
  }

  function showHelp() {
    openModal(`<h2>你是這個世界的神</h2>
      <p class="story">人類會自己生存、遷徙、發展文明。你沒辦法直接控制他們，只能從旁幫一把。</p>
      <ul class="help">
        <li>✨ <b>信仰</b>是你的力量。人類越虔誠、人越多，信仰累積得越快。</li>
        <li>🔥 <b>奇蹟</b>都要花信仰，而且常常有副作用。人類也會用他們自己的方式<b>誤解</b>你的作為，產生各種神話，影響他們的發展。</li>
        <li>⚠️ 發生<b>重大危機</b>時，世界會停下來等你決定。袖手旁觀不用花信仰，但文明有機會直接滅亡。</li>
        <li>🧬 每個世界開始前，先挑選三位<b>始祖</b>。他們的天賦、缺陷和興趣會傳給整個部族。</li>
        <li>🌳 在<b>研究樹</b>選擇發展方向：農耕、航海、工藝、戰爭、自然、神秘學。研究點數有限，沒辦法全部點完，走哪條路會決定文明的樣子。</li>
        <li>🔓 有些研究會在危機中<b>解鎖新的選項</b>。</li>
        <li>🏙️ 把人類帶到<b>未來時代</b>就會迎來結局。結局有很多種（還有隱藏結局），取決於他們最後變成什麼樣的文明。</li>
        <li>🗿 文明滅亡或結局之後，他們的<b>遺跡</b>會埋進下一個世界。</li>
        <li>🌙 關掉遊戲後，世界仍會以較慢的速度繼續運轉。危機發生時會停下來等你回來。</li>
      </ul>
      <p class="muted">小提示：原始人沒有火，科技幾乎不會進步。</p>
      <div class="actions"><button class="primary" data-close>開始</button></div>`);
  }

  function confirmNew() {
    const msg = s && !s.over ? '<p class="warn">目前的世界會被放棄，不會留下遺跡。</p>' : '';
    openModal(`<h2>🌍 創造新世界？</h2>${msg}
      <div class="actions"><button data-close>取消</button><button class="primary" id="btnDoNew">創造</button></div>`,
      (box) => box.querySelector('#btnDoNew').addEventListener('click', () => { modalQueue.length = 0; nextModal(); newWorld(); }));
  }

  // ── 始祖 ────────────────────────────────────────────
  function founderCard(f, i) {
    const P = D.PATHS.find((p) => p.id === f.interest);
    const traits = f.traits.map((k) => {
      const t = D.TRAITS[k];
      return `<div class="ftrait ${t.flaw ? 'flaw' : 'trait'}"><b>${t.flaw ? '▼' : '▲'} ${esc(t.name)}</b><span>${esc(t.desc)}</span></div>`;
    }).join('');
    return `<div class="founder">
      <div class="f-face">${f.face}</div><div class="f-name">${esc(f.name)}</div>
      <div class="f-interest" style="color:${P.color}">興趣：${P.icon} ${P.name}</div>
      <div class="f-traits">${traits}</div>
      <button data-reroll="${i}" ${f.rerolls > 0 ? '' : 'disabled'}>🎲 重抽（剩 ${f.rerolls} 次）</button></div>`;
  }
  function founderHtml() {
    return `<h2>🧬 選擇始祖</h2>
      <p class="muted center">這三位會帶領人類走出洞穴。他們的特質會變成部族的血統，興趣路線的研究速度 +25%。<br>不滿意可以重抽。</p>
      <div class="founders">${s.founders.map(founderCard).join('')}</div>
      <div class="actions"><button class="primary" id="btnGo">🔥 就是他們了</button></div>`;
  }
  function bindFounders(box) {
    box.querySelectorAll('[data-reroll]').forEach((b) => b.addEventListener('click', () => {
      Sim.rerollFounder(s, +b.dataset.reroll);
      box.innerHTML = founderHtml();
      bindFounders(box);
    }));
    box.querySelector('#btnGo').addEventListener('click', () => {
      Sim.confirmFounders(s);
      save();
      closeModal();
    });
  }
  function showFounders() {
    openModal(founderHtml(), bindFounders, true);
  }

  // ── 研究樹 ──────────────────────────────────────────
  function researchPanel() {
    const c = s.civ;
    const n = c.research && Sim.NODE[c.research];
    let html;
    if (n) {
      const P = D.PATHS.find((p) => p.id === n.path);
      const pr = c.prog[n.id] || 0;
      html = `<div class="r-cur"><span>${P.icon} ${esc(n.name)}</span><span class="muted">${Math.floor(pr)} / ${n.cost}</span></div>
        <div class="bar"><div style="width:${(pr / n.cost) * 100}%;background:${P.color}"></div></div>`;
    } else {
      html = `<div class="warn small">⚠️ 還沒選研究目標${c.bank > 1 ? `（已存下 ${Math.floor(c.bank)} 點）` : ''}</div>`;
    }
    const counts = D.PATHS.map((p) => {
      const k = c.done.filter((id) => Sim.NODE[id].path === p.id).length;
      return `<span class="pcount" title="${p.name}" style="${k ? `color:${p.color}` : ''}">${p.icon}${k}</span>`;
    }).join('');
    return html + `<div class="pcounts">${counts}</div><button class="wide" id="btnTree">🌳 打開研究樹</button>`;
  }

  function treeHtml() {
    const c = s.civ;
    const cols = D.PATHS.map((p) => {
      const mult = Sim.pathMult(s, p.id);
      const nodes = D.NODES.filter((n) => n.path === p.id).sort((a, b) => a.tier - b.tier).map((n) => {
        const st = Sim.nodeStatus(s, n.id);
        const cur = c.research === n.id;
        const pr = c.prog[n.id] || 0;
        const note = st === 'done' ? '✔ 已完成' : st === 'locked' ? '🔒 需要前一項' : st === 'era' ? `🔒 需要${D.ERAS[n.era].name}` : cur ? `研究中 ${Math.floor(pr)}/${n.cost}` : `${n.cost} 點${pr ? `（已有 ${Math.floor(pr)}）` : ''}`;
        return `<button class="node ${st}${cur ? ' cur' : ''}" data-node="${n.id}" ${st === 'open' ? '' : 'disabled'} style="--pc:${p.color}">
          <b>${esc(n.name)}</b><span class="n-desc">${esc(n.desc)}</span><span class="n-note">${note}</span>
          ${cur ? `<span class="n-bar"><span style="width:${(pr / n.cost) * 100}%"></span></span>` : ''}</button>`;
      }).join('');
      return `<div class="tcol"><div class="thead" style="color:${p.color}">${p.icon} ${p.name}<span class="muted small">速度 ×${mult.toFixed(2)}</span></div>${nodes}</div>`;
    }).join('');
    return `<h2>🌳 研究樹</h2>
      <p class="muted center">點一個項目，人類就會把研究點數投進去。研究點數有限，一局大約只能完成一半，選擇你想走的路。</p>
      <div class="tree">${cols}</div>
      <div class="actions"><button class="primary" data-close>關閉</button></div>`;
  }
  function bindTree(box) {
    box.querySelectorAll('[data-node]').forEach((b) => b.addEventListener('click', () => {
      Sim.setResearch(s, b.dataset.node);
      drainDiscoveries();
      save();
      box.innerHTML = treeHtml();
      bindTree(box);
      box.querySelector('[data-close]').addEventListener('click', closeModal);
      refresh();
    }));
  }
  function showResearch() {
    openModal(treeHtml(), bindTree, true);
  }

  // ── 面板 ────────────────────────────────────────────
  function bar(label, val, max, cls, text) {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    return `<div class="stat"><div class="stat-h"><span>${label}</span><span>${text}</span></div>
      <div class="bar ${cls}"><div style="width:${pct}%"></div></div></div>`;
  }

  function logLine(l) {
    return `<div class="log ${l.kind}"><span class="yr">${l.year.toLocaleString()}</span><span>${esc(l.text)}</span></div>`;
  }

  function renderPanels(full) {
    const x = Sim.summary(s), c = s.civ;
    $('worldName').textContent = `第 ${s.worldNo} 個世界・${s.worldName}`;
    $('year').textContent = yearText(s.tick * Sim.YEARS);
    $('eraBadge').textContent = `${D.ERAS[c.era].icon} ${D.ERAS[c.era].name}`;

    const req = D.ERAS[c.era].req, span = Sim.eraSpan(s);
    const nextName = c.era < 6 ? D.ERAS[c.era + 1].name : '結局';
    let html = `<div class="bigstat"><div><span>人口</span><b>${fmt(x.P)}</b></div><div><span>聚落</span><b>${x.settlements}</b></div><div><span>部族</span><b>${x.tribes}</b></div></div>`;
    html += bar(`🔬 往${nextName}`, c.tech - req, span, 'tech', `${Math.floor(((c.tech - req) / span) * 100)}%`);
    html += bar('🎭 文化', c.culture, Math.max(c.culture, c.tech, 1), 'culture', Math.floor(c.culture));
    html += bar('⚔️ 衝突', c.tension, 100, c.tension >= 60 ? 'danger' : 'tension', Math.floor(c.tension));
    html += bar('🌳 自然', s.nature, 100, s.nature < 35 ? 'danger' : 'nature', Math.floor(s.nature));
    if (c.era >= 4 || c.pollution > 1) html += bar('🏭 污染', c.pollution, 100, c.pollution >= 60 ? 'danger' : 'poll', Math.floor(c.pollution));
    html += bar('🙏 虔誠', x.devotion * 100, 100, 'devotion', `${Math.round(x.devotion * 100)}%`);
    $('stats').innerHTML = html;

    $('faithLabel').textContent = `✨ ${Math.floor(c.faith)} / ${x.faithCap}`;
    $('faithFill').style.width = `${(c.faith / x.faithCap) * 100}%`;

    // 奇蹟
    const mHtml = D.MIRACLES.map((m) => {
      const block = Sim.miracleBlock(s, m.id);
      const hidden = (m.maxEra != null && c.era > m.maxEra) || (m.id === 'fire' && c.flags.fire);
      if (hidden) return '';
      const active = ui.targeting === m.id ? ' active' : '';
      return `<button class="miracle${active}" data-m="${m.id}" ${block && !active ? 'aria-disabled="true"' : ''} data-block="${esc(block || '')}">
        <span class="m-icon">${m.icon}</span><span class="m-name">${esc(m.name)}</span><span class="m-cost">✨${Sim.costOf(s, m.cost)}</span>
        ${block ? `<span class="m-block">${esc(block)}</span>` : ''}</button>`;
    }).join('');
    $('miracles').innerHTML = mHtml;

    // 研究
    $('research').innerHTML = researchPanel();

    // 部族
    $('tribes').innerHTML = Sim.aliveTribes(s).map((t) => {
      const pop = Sim.tribePop(s, t.id), n = Sim.settlementsOf(s, t.id).length;
      const chips = t.beliefs.map((b) => `<span class="chip" title="${esc(D.BELIEFS[b].text.replace(/\{tribe\}/g, t.name))}">${esc(D.BELIEFS[b].name)}</span>`).join('');
      const traits = (t.traits || []).map((k) => `<span class="chip ${D.TRAITS[k].flaw ? 'flaw' : 'trait'}" title="${esc(D.TRAITS[k].desc)}">${esc(D.TRAITS[k].name)}</span>`).join('');
      return `<div class="tribe"><div class="tribe-h"><span class="dot" style="background:${t.color}"></span><b>${esc(t.name)}</b>
        <span class="muted">${fmt(pop)} 人・${n} 聚落・虔誠 ${Math.round(t.devotion * 100)}%</span></div>
        ${traits ? `<div class="chips">${traits}</div>` : ''}
        <div class="chips">${chips || '<span class="muted small">還沒有關於你的神話</span>'}</div></div>`;
    }).join('') || '<p class="muted">沒有任何部族存活。</p>';

    // 編年史
    if (full || s.logSeq !== lastLogSeq) {
      lastLogSeq = s.logSeq;
      $('log').innerHTML = s.log.slice(-150).reverse().map(logLine).join('');
    }

    document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === speed));
  }

  function draw() { if (s) Render.draw($('map'), s, ui); }
  function refresh(full) { if (!s) return; renderPanels(full); draw(); }

  // ── 互動 ────────────────────────────────────────────
  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function setTargeting(id) {
    ui.targeting = id;
    const m = id && D.MIRACLES.find((o) => o.id === id);
    const hint = $('targetHint');
    if (m) {
      const what = { tile: '選一個地區', settlement: '選一個聚落', colony: '選一塊空地（離現有聚落不能太近或太遠）' }[m.target];
      hint.textContent = `${m.icon} ${m.name}：${what}。右鍵或 Esc 取消`;
      hint.classList.remove('hidden');
      $('map').classList.add('targeting');
    } else {
      hint.classList.add('hidden');
      $('map').classList.remove('targeting');
    }
    refresh();
  }

  function cast(id, target) {
    const seq0 = s.logSeq;
    const r = Sim.castMiracle(s, id, target);
    if (!r.ok) { toast(r.msg); return; }
    drainDiscoveries();
    const myth = s.log.filter((l) => l.seq > seq0 && (l.kind === 'myth' || l.kind === 'bad'));
    toast(myth.length ? myth[0].text : '奇蹟降臨了。');
    save();
    refresh();
    checkPending();
  }

  function onMiracleClick(e) {
    const b = e.target.closest('[data-m]');
    if (!b || !s) return;
    const id = b.dataset.m;
    if (ui.targeting === id) { setTargeting(null); return; }
    const block = Sim.miracleBlock(s, id);
    if (block) { toast(block); return; }
    const m = D.MIRACLES.find((o) => o.id === id);
    if (m.target === 'none') cast(id, {});
    else setTargeting(id);
  }

  function showMiracleInfo(e) {
    const b = e.target.closest('[data-m]');
    const m = b && D.MIRACLES.find((o) => o.id === b.dataset.m);
    $('miracleInfo').innerHTML = m ? `<b>${m.icon} ${esc(m.name)}</b>：${esc(m.desc)}` : '把滑鼠移到奇蹟上查看說明。';
  }

  function tileFromEvent(e) {
    const r = $('map').getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  }

  function onMapMove(e) {
    ui.hover = tileFromEvent(e);
    const tip = $('tooltip');
    if (!ui.hover || !s) { tip.classList.add('hidden'); draw(); return; }
    const { x, y } = ui.hover;
    const parts = [];
    const n = Sim.nearestSettlement(s, x, y);
    if (n && n.d <= 1.2) {
      const t = Sim.tribeById(s, n.st.tribe);
      parts.push(`<b>${esc(n.st.name)}</b>（${esc(t.name)}）<br>人口 ${fmt(n.st.pop)} / 可養活 ${fmt(n.st.cap)}`);
    }
    for (const h of s.herds) if (h.x === x && h.y === y) parts.push(`${D.ANIMALS[h.type].icon} ${D.ANIMALS[h.type].name}群（${Math.round(h.n)} 隻）`);
    for (const r of s.relics) if (r.found && r.x === x && r.y === y) parts.push(`🗿 ${esc(r.name)}`);
    parts.push(`<span class="muted">${D.TERRAIN[s.map[Sim.idx(x, y)]].name}</span>`);
    tip.innerHTML = parts.join('<br>');
    const wrap = $('mapwrap').getBoundingClientRect();
    let left = e.clientX - wrap.left + 14, top = e.clientY - wrap.top + 14;
    if (left > wrap.width - 200) left -= 220;
    if (top > wrap.height - 90) top -= 100;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    tip.classList.remove('hidden');
    draw();
  }

  function onMapClick(e) {
    if (!s || !ui.targeting) return;
    const t = tileFromEvent(e);
    if (!t) return;
    const target = Sim.validTarget(s, ui.targeting, t.x, t.y);
    if (!target) {
      const m = D.MIRACLES.find((o) => o.id === ui.targeting);
      toast(m.target === 'settlement' ? '請點在聚落上。' : m.target === 'colony' ? '這裡不適合建立聚落。' : '這裡不行。');
      return;
    }
    const id = ui.targeting;
    setTargeting(null);
    cast(id, target);
  }

  // ── 主迴圈 ──────────────────────────────────────────
  function loop() {
    const now = performance.now();
    const dt = Math.min(1000, now - last);
    last = now;
    if (!s) return;
    if (s.crisis && s.crisis.year != null) draw(); // 危機紅圈閃爍
    if (modalOpen || s.over || s.crisis || s.phase !== 'play' || speed === 0 || document.hidden) return;
    acc += dt * speed;
    let n = 0;
    while (acc >= TICK_MS && n < 5) {
      acc -= TICK_MS;
      Sim.tick(s);
      n++;
      if (s.crisis || s.over) { acc = 0; break; }
    }
    if (n) {
      const done = s.log.filter((l) => l.seq > lastLogSeq && l.kind === 'research');
      if (done.length) toast(done[done.length - 1].text + (s.civ.research ? '' : '　→ 請選擇下一個研究'));
      drainDiscoveries();
      if (s.tick - lastSaveTick >= 5 || s.crisis || s.over) { save(); lastSaveTick = s.tick; }
      refresh();
      checkPending();
    }
  }

  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(); }
    else if (hiddenAt) {
      const since = hiddenAt; hiddenAt = null;
      if (speed > 0) runOffline(since);
      last = performance.now(); acc = 0;
      refresh(); checkPending();
    }
  });
  window.addEventListener('beforeunload', save);

  function init() {
    loadMeta();
    loadSave();
    $('speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (!b) return;
      speed = +b.dataset.speed; acc = 0; meta.speed = speed;
      refresh();
    });
    $('btnCodex').addEventListener('click', showCodex);
    $('btnHelp').addEventListener('click', showHelp);
    $('btnNew').addEventListener('click', confirmNew);
    $('miracles').addEventListener('click', onMiracleClick);
    $('research').addEventListener('click', (e) => { if (e.target.closest('#btnTree') && s && s.phase === 'play') showResearch(); });
    $('miracles').addEventListener('mouseover', showMiracleInfo);
    $('map').addEventListener('mousemove', onMapMove);
    $('map').addEventListener('mouseleave', () => { ui.hover = null; $('tooltip').classList.add('hidden'); draw(); });
    $('map').addEventListener('click', onMapClick);
    $('map').addEventListener('contextmenu', (e) => { if (ui.targeting) { e.preventDefault(); setTargeting(null); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.targeting) setTargeting(null);
      if (e.key === ' ' && !modalOpen && e.target === document.body) {
        e.preventDefault();
        speed = speed === 0 ? (meta.lastSpeed || 1) : (meta.lastSpeed = speed, 0);
        refresh();
      }
    });

    if (!s) {
      s = Sim.newWorld(meta);
      meta.worldsCreated++;
      save();
      refresh(true);
      showHelp();
    } else {
      refresh(true);
      if (s.savedAt && (s.savedSpeed == null || s.savedSpeed > 0)) runOffline(s.savedAt);
      refresh(true);
      checkPending();
    }
    setInterval(loop, 100);
  }

  globalThis.__game = { get s() { return s; }, refresh, checkPending, drain: () => drainDiscoveries() };
  init();
})();
