// 平衡測試：node tools/balance.js [局數] [策略 active|random|passive] [偏好路線]
require('../js/data.js');
require('../js/sim.js');
const Sim = globalThis.Sim, D = globalThis.DATA;

const N = +process.argv[2] || 30;
const policy = process.argv[3] || 'active';
const focus = process.argv[4] || null;
const MAX = 6000;

function chooseResearch(s) {
  const open = D.NODES.filter((n) => Sim.nodeStatus(s, n.id) === 'open');
  const cur = s.civ.research && Sim.NODE[s.civ.research];
  if (focus && cur && cur.path !== focus && open.some((n) => n.path === focus)) s.civ.research = null;
  if (s.civ.research) return;
  if (!open.length) return;
  let pickN;
  if (focus) pickN = open.filter((n) => n.path === focus).sort((a, b) => a.tier - b.tier)[0];
  if (!pickN) pickN = open[Math.floor(Math.random() * open.length)];
  Sim.setResearch(s, pickN.id);
}

function play() {
  const s = Sim.newWorld({});
  Sim.confirmFounders(s);
  const eraAt = [0];
  let crises = 0;
  for (let i = 0; i < MAX && !s.over; i++) {
    if (s.crisis) {
      crises++;
      const def = D.CRISES.find((d) => d.id === s.crisis.id);
      const ok = def.options.map((o, k) => k).filter((k) => Sim.optionVisible(s, def.options[k]) && Sim.costOf(s, def.options[k].cost) <= s.civ.faith);
      let choice = def.options.length - 1;
      if (policy === 'active') choice = ok.sort((a, b) => def.options[b].cost - def.options[a].cost)[0];
      if (policy === 'random') choice = ok[Math.floor(Math.random() * ok.length)];
      Sim.resolveCrisis(s, choice);
      continue;
    }
    if (policy !== 'passive') chooseResearch(s);
    if ((policy === 'active' || (policy === 'random' && Math.random() < 0.5)) && i % 10 === 0) {
      const order = ['fire', 'insight', 'dream', 'peace', 'art', 'nature', 'fertility'];
      for (const id of order) {
        if (Sim.miracleBlock(s, id)) continue;
        if (id === 'peace' && s.civ.tension < 50) continue;
        if (id === 'nature' && s.nature > 60) continue;
        if (id === 'fertility' && s.civ.era > 2) continue;
        Sim.castMiracle(s, id, {});
        break;
      }
    }
    const before = s.civ.era;
    Sim.tick(s);
    if (s.civ.era > before) eraAt[s.civ.era] = s.tick;
  }
  return { s, eraAt, crises };
}

const res = [];
for (let k = 0; k < N; k++) res.push(play());
const outcome = {};
for (const r of res) {
  const key = r.s.over ? `${r.s.over.type}:${r.s.over.id}` : 'timeout';
  outcome[key] = (outcome[key] || 0) + 1;
}
console.log('policy', policy, 'focus', focus, 'runs', N);
console.log('outcomes', JSON.stringify(outcome));
for (let e = 1; e <= 6; e++) {
  const ts = res.map((r) => r.eraAt[e]).filter(Boolean).sort((a, b) => a - b);
  if (ts.length) console.log(`era ${e} ${D.ERAS[e].name}: ${ts.length}/${N}, median tick ${ts[ts.length >> 1]}`);
}
const ends = res.map((r) => r.s.tick).sort((a, b) => a - b);
console.log('end tick median', ends[ends.length >> 1], 'min', ends[0], 'max', ends[ends.length - 1]);
const ex = res.filter((r) => r.s.over && r.s.over.type === 'extinct').map((r) => r.s.over.era);
console.log('extinct', ex.length, 'at eras', ex.sort().join(','));
console.log('crises avg', (res.reduce((a, r) => a + r.crises, 0) / N).toFixed(1), 'odd avg', (res.reduce((a, r) => a + r.s.civ.oddSeen, 0) / N).toFixed(1));
console.log('nodes done avg', (res.reduce((a, r) => a + r.s.civ.done.length, 0) / N).toFixed(1));
const x = res[0].s;
console.log('sample: pop', Math.round(Sim.totalPop(x)), 'settl', x.settlements.length, 'tribes', Sim.aliveTribes(x).length, 'nature', x.nature.toFixed(0), 'herds', x.herds.length, 'done', x.civ.done.join(' '));
