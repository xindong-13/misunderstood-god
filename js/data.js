// 《誤解之神》遊戲資料
// 想擴充內容：在對應的清單裡加一筆即可，不需要改 sim.js。
// 文字裡可用的替換字：{tribe} {tribeB} {settlement} {place}
//
// 修正值（mods）的 key：
//   倍率：tech(研究) culture growth faith food fish hunt defor pollution expand
//         plague famine doom odd resilience miracleCost path_<路線id>
//   加值：devotion tension
(function () {
  'use strict';

  const MAP_W = 60;
  const MAP_H = 38;
  const YEARS_PER_TICK = 5;

  // ── 地形 ────────────────────────────────────────────
  // land：陸地；settle：可建聚落；water：水域；wood：森林類；mystic：神秘地形
  const TERRAIN = [
    { key: 'deep', name: '深海', color: '#1b3a5c', food: 0, water: true },
    { key: 'shallow', name: '淺海', color: '#2f6f96', food: 0.8, water: true },
    { key: 'plains', name: '平原', color: '#8db36f', food: 2.5, land: true, settle: true },
    { key: 'forest', name: '森林', color: '#3f7a45', food: 1.8, land: true, settle: true, wood: true },
    { key: 'desert', name: '沙漠', color: '#dcc28a', food: 0.4, land: true, settle: true },
    { key: 'hills', name: '丘陵', color: '#a49270', food: 1.2, land: true, settle: true },
    { key: 'mountain', name: '高山', color: '#807b78', food: 0.2, land: true },
    { key: 'tundra', name: '凍原', color: '#cfdbe2', food: 0.6, land: true, settle: true },
    { key: 'swamp', name: '沼澤', color: '#56704f', food: 1.3, land: true, settle: true },
    { key: 'jungle', name: '叢林', color: '#2a6b3c', food: 2.0, land: true, settle: true, wood: true },
    { key: 'volcano', name: '火山', color: '#5b3934', food: 0.3, land: true },
    { key: 'lake', name: '湖泊', color: '#4f93bd', food: 1.3, water: true },
    { key: 'river', name: '河流', color: '#8db36f', food: 2.4, land: true, settle: true },
    { key: 'reef', name: '珊瑚礁', color: '#3aa6a0', food: 1.5, water: true },
    { key: 'glacier', name: '冰川', color: '#eef6fb', food: 0, land: true },
    { key: 'crystal', name: '水晶荒原', color: '#9d8fc8', food: 1.0, land: true, settle: true, mystic: true },
    { key: 'bones', name: '巨骨平原', color: '#bdae8d', food: 1.0, land: true, settle: true, mystic: true },
  ];

  // ── 時代 ────────────────────────────────────────────
  const ERAS = [
    { name: '原始時代', req: 0, icon: '⛺', food: 1, radius: 2 },
    { name: '部落時代', req: 20, icon: '🛖', food: 1.4, radius: 2 },
    { name: '農耕時代', req: 80, icon: '🌾', food: 3, radius: 3 },
    { name: '城邦時代', req: 240, icon: '🏘️', food: 5, radius: 3 },
    { name: '王國時代', req: 560, icon: '🏰', food: 8, radius: 4 },
    { name: '工業時代', req: 1150, icon: '🏭', food: 15, radius: 4 },
    { name: '未來時代', req: 2200, icon: '🏙️', food: 26, radius: 5 },
  ];
  const END_TECH = 3600;

  // ── 動物 ────────────────────────────────────────────
  // prey：算進自然指數；danger：會襲擊聚落；sea：海洋生物
  const ANIMALS = {
    deer: { name: '鹿', icon: '🦌', cap: 15, n0: 12, count: 6, terrain: [2, 3, 9], prey: true },
    bison: { name: '野牛', icon: '🐂', cap: 14, n0: 10, count: 5, terrain: [2, 5, 12], prey: true },
    wolf: { name: '狼', icon: '🐺', cap: 8, n0: 6, count: 4, terrain: [3, 5, 7], danger: true },
    croc: { name: '鱷魚', icon: '🐊', cap: 6, n0: 4, count: 3, terrain: [8, 12, 9], danger: true },
    fish: { name: '魚', icon: '🐟', cap: 20, n0: 14, count: 10, terrain: [1, 13, 11], sea: true, prey: true },
    turtle: { name: '海龜', icon: '🐢', cap: 10, n0: 6, count: 4, terrain: [1, 13], sea: true, prey: true },
    squid: { name: '烏賊', icon: '🦑', cap: 12, n0: 8, count: 3, terrain: [0, 1], sea: true, prey: true },
    whale: { name: '鯨魚', icon: '🐋', cap: 6, n0: 4, count: 4, terrain: [0], sea: true, prey: true, whale: true },
    kraken: { name: '海怪', icon: '🐙', cap: 1, n0: 1, count: 1, terrain: [0], sea: true, monster: true },
  };

  // ── 始祖特質（開局抽卡）────────────────────────────
  const TRAITS = {
    // 天賦
    fire_child: { name: '火之子', desc: '天生會生火。開局就有火。', mods: {}, fire: true },
    swimmer: { name: '水性好', desc: '捕魚收穫 +60%，航海研究 +30%。', mods: { fish: 1.6, path_sea: 1.3 } },
    storyteller: { name: '說書人', desc: '文化成長 +30%。', mods: { culture: 1.3 } },
    hunter: { name: '神射手', desc: '狩獵收穫 +50%。', mods: { hunt: 1.5 } },
    green_thumb: { name: '綠手指', desc: '人口成長 +15%，農耕研究 +30%。', mods: { growth: 1.15, path_farm: 1.3 } },
    tinkerer: { name: '巧手', desc: '所有研究 +12%，工藝研究再 +30%。', mods: { tech: 1.12, path_craft: 1.3 } },
    long_life: { name: '長壽', desc: '人口成長 +10%，瘟疫機率 -30%。', mods: { growth: 1.1, plague: 0.7 } },
    devout: { name: '虔誠', desc: '虔誠度 +15%。', mods: { devotion: 0.15 } },
    peacemaker: { name: '和事佬', desc: '衝突累積變慢。', mods: { tension: -0.03 } },
    explorer: { name: '探險家', desc: '擴張速度 +60%。', mods: { expand: 1.6 } },
    beast_friend: { name: '獸語者', desc: '猛獸不會攻擊，自然研究 +30%。', mods: { path_nat: 1.3 }, wolfSafe: true },
    dreamer: { name: '通靈者', desc: '神秘學研究 +40%，奇特事件更常發生。', mods: { path_mys: 1.4, odd: 1.4 } },
    iron_will: { name: '鋼鐵意志', desc: '災難造成的人口損失 -20%。', mods: { resilience: 0.8 } },
    star_gazer: { name: '觀星者', desc: '所有研究 +10%，信仰 +10%。', mods: { tech: 1.1, faith: 1.1 } },
    warrior: { name: '戰士之魂', desc: '戰爭研究 +40%，猛獸不敢靠近。', mods: { path_war: 1.4 }, wolfSafe: true },
    sturdy: { name: '強壯', desc: '糧食產量 +12%。', mods: { food: 1.12 } },
    // 缺陷
    hydrophobic: { name: '怕水', desc: '捕魚收穫 -50%，航海研究 -40%。', flaw: true, mods: { fish: 0.5, path_sea: 0.6 } },
    hothead: { name: '暴躁', desc: '衝突累積變快。', flaw: true, mods: { tension: 0.04 } },
    frail: { name: '體弱', desc: '瘟疫機率 +60%，成長 -5%。', flaw: true, mods: { plague: 1.6, growth: 0.95 } },
    glutton: { name: '貪吃', desc: '糧食產量 -15%。', flaw: true, mods: { food: 0.85 } },
    superstitious: { name: '迷信', desc: '虔誠 +10%，但研究 -10%。', flaw: true, mods: { devotion: 0.1, tech: 0.9 } },
    lazy: { name: '懶惰', desc: '所有研究 -15%。', flaw: true, mods: { tech: 0.85 } },
    skeptic: { name: '不信神', desc: '虔誠 -20%。', flaw: true, mods: { devotion: -0.2 } },
    clumsy: { name: '笨手笨腳', desc: '工藝研究 -40%。', flaw: true, mods: { path_craft: 0.6 } },
    arsonist: { name: '縱火狂', desc: '砍伐森林的速度加倍。', flaw: true, mods: { defor: 2 } },
    loner: { name: '孤僻', desc: '擴張速度 -40%。', flaw: true, mods: { expand: 0.6 } },
    cursed: { name: '被詛咒的', desc: '奇特事件頻繁發生，而且多半是壞事。神秘學研究 +20%。', flaw: true, mods: { odd: 1.8, path_mys: 1.2 }, cursed: true },
  };

  const FOUNDER_NAMES = ['阿岩', '小禾', '烏魯', '卡娜', '莫恩', '緹雅', '巴洛', '艾薇', '赫德', '露米', '索爾', '妮卡', '洛克', '希雅', '達雷', '雅拉', '奧圖', '芙蘿', '格倫', '茉莉', '塔克', '伊芙', '蘭朵', '朔'];
  const FOUNDER_FACES = ['🧑', '👩', '👨', '🧔', '👵', '👴', '🧒', '👧', '👱', '🧓'];
  const REROLLS_PER_CARD = 3;

  // ── 研究路線 ────────────────────────────────────────
  const PATHS = [
    { id: 'farm', name: '農耕', icon: '🌾', color: '#e8c35a' },
    { id: 'sea', name: '航海', icon: '⛵', color: '#4fb3ff' },
    { id: 'craft', name: '工藝', icon: '⚒️', color: '#c9a27a' },
    { id: 'war', name: '戰爭', icon: '⚔️', color: '#ff6b6b' },
    { id: 'nat', name: '自然', icon: '🏹', color: '#5fd38d' },
    { id: 'mys', name: '神秘學', icon: '🔮', color: '#b79cff' },
  ];

  // 研究節點：tier 1–5，era = 最低時代，cost = 研究點數
  const NODES = [
    { id: 'farm1', path: 'farm', tier: 1, era: 0, cost: 20, name: '採集智慧', desc: '知道哪些果子能吃。糧食 +10%。', mods: { food: 1.1 } },
    { id: 'farm2', path: 'farm', tier: 2, era: 1, cost: 60, name: '播種', desc: '學會耕種。平原與河流的糧食大幅提升。', mods: { food: 1.1 }, myth: { pool: ['farm_land_gift', 'farm_chosen', 'nature_resource'], chance: 0.5 } },
    { id: 'farm3', path: 'farm', tier: 3, era: 2, cost: 180, name: '灌溉', desc: '引河水進田。河流糧食再 +50%，饑荒機率 -40%。', mods: { famine: 0.6, food: 1.1 } },
    { id: 'farm4', path: 'farm', tier: 4, era: 3, cost: 450, name: '糧倉', desc: '饑荒機率 -70%。解鎖危機選項「開倉放糧」。', mods: { famine: 0.3 } },
    { id: 'farm5', path: 'farm', tier: 5, era: 5, cost: 750, name: '豐饒之地', desc: '糧食 +40%，人口成長 +10%。', mods: { food: 1.4, growth: 1.1 } },

    { id: 'sea1', path: 'sea', tier: 1, era: 0, cost: 20, name: '漁網', desc: '捕魚收穫 +50%。', mods: { fish: 1.5 } },
    { id: 'sea2', path: 'sea', tier: 2, era: 1, cost: 60, name: '獨木舟', desc: '可以渡海，到其他島嶼建立聚落。', mods: {} },
    { id: 'sea3', path: 'sea', tier: 3, era: 2, cost: 180, name: '捕鯨', desc: '可以獵捕鯨魚，獲得大量食物。', mods: { fish: 1.2 }, myth: { pool: ['whale_ancestor'], chance: 0.4 } },
    { id: 'sea4', path: 'sea', tier: 4, era: 3, cost: 450, name: '星圖航行', desc: '遠距離殖民，擴張 +40%。解鎖危機選項「船隊出海避難」。', mods: { expand: 1.4, culture: 1.05 } },
    { id: 'sea5', path: 'sea', tier: 5, era: 5, cost: 750, name: '遠洋帝國', desc: '捕魚收穫加倍，文化 +10%。走向「海洋文明」結局。', mods: { fish: 2, culture: 1.1 } },

    { id: 'craft1', path: 'craft', tier: 1, era: 0, cost: 20, name: '石器', desc: '所有研究 +8%。', mods: { tech: 1.08 } },
    { id: 'craft2', path: 'craft', tier: 2, era: 1, cost: 60, name: '冶金', desc: '所有研究 +10%。', mods: { tech: 1.1 } },
    { id: 'craft3', path: 'craft', tier: 3, era: 2, cost: 180, name: '機械', desc: '所有研究 +12%。', mods: { tech: 1.12 } },
    { id: 'craft4', path: 'craft', tier: 4, era: 4, cost: 450, name: '蒸汽', desc: '所有研究 +20%，但污染 +30%。', mods: { tech: 1.2, pollution: 1.3 } },
    { id: 'craft5', path: 'craft', tier: 5, era: 5, cost: 750, name: '量子', desc: '所有研究 +30%。解鎖危機選項「量子淨化」。', mods: { tech: 1.3 } },

    { id: 'war1', path: 'war', tier: 1, era: 0, cost: 20, name: '長矛', desc: '猛獸不再是威脅，狩獵 +20%。', mods: { hunt: 1.2 } },
    { id: 'war2', path: 'war', tier: 2, era: 1, cost: 60, name: '城牆', desc: '戰爭和天災的損失 -20%。', mods: { resilience: 0.8 } },
    { id: 'war3', path: 'war', tier: 3, era: 2, cost: 180, name: '軍團', desc: '擴張 +20%，軍隊會主動獵殺靠近海岸的海怪。', mods: { expand: 1.2 } },
    { id: 'war4', path: 'war', tier: 4, era: 3, cost: 450, name: '帝國', desc: '其他部族會慢慢被併入最強的部族。解鎖危機選項「帝國鎮壓」。世界統一時走向「永恆帝國」結局。', mods: { tension: 0.02 } },
    { id: 'war5', path: 'war', tier: 5, era: 5, cost: 750, name: '威懾', desc: '末日武器危機機率 -70%，並解鎖「威懾平衡」。', mods: { doom: 0.3 } },

    { id: 'nat1', path: 'nat', tier: 1, era: 0, cost: 20, name: '追蹤', desc: '狩獵收穫 +30%。', mods: { hunt: 1.3 } },
    { id: 'nat2', path: 'nat', tier: 2, era: 1, cost: 60, name: '馴化', desc: '飼養動物：之後的時代也能從獸群獲得食物，獵捕對獸群的傷害減半。解鎖危機選項「讓家禽吃掉蝗蟲」。', mods: { food: 1.05 }, myth: { pool: ['talking_beasts'], chance: 0.3 } },
    { id: 'nat3', path: 'nat', tier: 3, era: 2, cost: 180, name: '草藥', desc: '瘟疫機率 -40%。解鎖危機選項「草藥治療」。', mods: { plague: 0.6 } },
    { id: 'nat4', path: 'nat', tier: 4, era: 3, cost: 450, name: '森林守護', desc: '砍伐森林的速度 -60%。', mods: { defor: 0.4 } },
    { id: 'nat5', path: 'nat', tier: 5, era: 5, cost: 750, name: '萬物共生', desc: '污染 -50%，森林會自己長回來。', mods: { pollution: 0.5 } },

    { id: 'mys1', path: 'mys', tier: 1, era: 0, cost: 20, name: '占星', desc: '信仰 +10%，奇特事件更常發生。', mods: { faith: 1.1, odd: 1.3 }, myth: { pool: ['comet_omen'], chance: 0.4 } },
    { id: 'mys2', path: 'mys', tier: 2, era: 1, cost: 60, name: '解夢', desc: '信仰 +15%。解鎖危機選項「預知墜落點」。', mods: { faith: 1.15 } },
    { id: 'mys3', path: 'mys', tier: 3, era: 2, cost: 180, name: '異象解讀', desc: '奇特事件變成好事的機率大幅提高。', mods: { odd: 1.2 } },
    { id: 'mys4', path: 'mys', tier: 4, era: 3, cost: 450, name: '水晶共鳴', desc: '水晶荒原和巨骨平原會產生研究點數，奇蹟花費 -20%。', mods: { miracleCost: 0.8 } },
    { id: 'mys5', path: 'mys', tier: 5, era: 5, cost: 750, name: '帷幕之外', desc: '他們開始看見世界的另一面。見證夠多奇特事件，可能迎來隱藏結局。', mods: { odd: 2 } },
  ];

  // ── 神話（人類對你的誤解）──────────────────────────
  const BELIEFS = {
    fire_tears: { name: '火是神的眼淚', text: '{tribe}相信火是你落下的眼淚，從此每逢新月就焚燒一片森林獻給你。', mods: { faith: 1.3, defor: 2.5 } },
    fire_priests: { name: '火種祭司', text: '{tribe}把火種交給祭司日夜看守，只有祭司能決定誰配得上火光。', mods: { faith: 1.2, tech: 0.85 } },
    fire_thief: { name: '盜火者', text: '{tribe}流傳著一個故事：火是一位英雄從神那裡偷來的。他們崇拜那位英雄，而不是你。', mods: { devotion: -0.2, tech: 1.2 } },
    rain_dance: { name: '祈雨之舞', text: '{tribe}認定是他們的舞蹈喚來了雨，舞蹈成了最神聖的藝術。', mods: { culture: 1.2 } },
    rain_sacrifice: { name: '雨要祭品', text: '{tribe}相信每場雨都要用活物交換，祭壇上的血從未乾過。', mods: { faith: 1.35, growth: 0.92 } },
    flood_wrath: { name: '洪水是懲罰', text: '{tribe}把那場洪水解讀為神的懲罰，開始互相指責是誰觸怒了你。', mods: { tension: 0.04, devotion: 0.1 } },
    farm_land_gift: { name: '神賜之土', text: '{tribe}相信土地是神親手分配的，越過邊界就是褻瀆。', mods: { tension: 0.04, growth: 1.1 } },
    farm_chosen: { name: '選民', text: '{tribe}認為只有他們被神選中學會耕種，其他人都是野蠻人。', mods: { tension: 0.06, devotion: 0.15, growth: 1.05 } },
    nature_resource: { name: '大地是禮物', text: '{tribe}認為大地的一切都是神送的禮物，用多少都不必愧疚。', mods: { defor: 2, growth: 1.1 } },
    fertility_cult: { name: '多子即福', text: '{tribe}把生孩子當成對神最大的敬意，家家戶戶擠滿了孩子。', mods: { growth: 1.25, culture: 0.9 } },
    dream_prophet: { name: '夢之先知', text: '{tribe}出現了一群自稱能解夢的先知。他們把每個夢都刻在石板上，意外發明了文字的雛形。', mods: { tech: 1.12, devotion: 0.1 } },
    dream_heresy: { name: '夢是魔鬼的低語', text: '{tribe}認為那些奇怪的夢是魔鬼在說話，開始懷疑一切來自天上的東西。', mods: { devotion: -0.25, tech: 1.08 } },
    peace_dove: { name: '白鴿使者', text: '{tribe}相信白鴿是神的使者，殺鴿子成了最重的罪，打仗也變得不吉利。', mods: { tension: -0.04 } },
    peace_passive: { name: '無為之道', text: '{tribe}從和平之兆裡領悟到：「什麼都不做，就是神的旨意。」', mods: { tech: 0.88, tension: -0.03, culture: 1.05 } },
    wrath_fear: { name: '恐懼之神', text: '{tribe}從此只記得你的怒火。他們跪拜得更虔誠，卻再也不敢抬頭看天空。', mods: { faith: 1.4, culture: 0.85 } },
    wrath_martyr: { name: '殉道聖城', text: '{tribe}把被天罰的城奉為聖地，倖存者被尊為聖人。', mods: { culture: 1.15, tension: 0.02 } },
    art_muse: { name: '繆思降臨', text: '{tribe}相信每件藝術品都是神借人的手完成的。', mods: { culture: 1.3, devotion: 0.05 } },
    art_idol: { name: '天才崇拜', text: '{tribe}把靈感歸功於一位天才藝術家，替他立了一座比神殿還高的雕像。', mods: { culture: 1.2, devotion: -0.15 } },
    nature_spirits: { name: '萬物有靈', text: '{tribe}相信每棵樹裡都住著神的碎片，砍樹前要先道歉。', mods: { defor: 0.3, pollution: 0.6, tech: 0.95 } },
    guide_promised: { name: '應許之地', text: '{tribe}相信神指引的地方永遠在更遠處，他們停不下遷徙的腳步。', mods: { expand: 1.6, tension: 0.02 } },
    plague_holy_water: { name: '聖水', text: '{tribe}相信是祭司的聖水治好了瘟疫，祭司的權力從此凌駕一切。', mods: { faith: 1.25, tech: 0.9 } },
    plague_healers: { name: '醫者教團', text: '{tribe}的醫者開始記錄病人的症狀。他們以為在研究神意，其實在研究醫學。', mods: { tech: 1.12, growth: 1.05 } },
    plague_sin: { name: '瘟疫是罪', text: '{tribe}認為瘟疫是對罪人的懲罰，開始驅逐病人和外地人。', mods: { tension: 0.05, devotion: 0.15 } },
    manna_wait: { name: '等待天降', text: '{tribe}相信只要夠虔誠，食物就會從天上掉下來，田地漸漸荒廢了。', mods: { growth: 0.88, devotion: 0.15 } },
    sky_clean: { name: '天空會自己變乾淨', text: '{tribe}看到天空一夜之間變藍，認定污染是神會處理的事。', mods: { pollution: 1.7 } },
    green_faith: { name: '綠色信仰', text: '{tribe}把保護環境變成一種新的宗教儀式。', mods: { pollution: 0.5, defor: 0.5 } },
    weapons_fail: { name: '神不許殺戮', text: '{tribe}親眼看到武器在手中失靈，相信神禁止殺戮。', mods: { tension: -0.05, devotion: 0.1 } },
    doom_prophecy: { name: '末日預言', text: '{tribe}的領袖從噩夢中驚醒，開始到處宣揚末日將近。', mods: { tension: 0.03, devotion: 0.2, culture: 1.1 } },
    comet_omen: { name: '彗星預兆', text: '{tribe}相信彗星是神的信使，預告偉大的變革即將到來。', mods: { tech: 1.06, devotion: 0.05 } },
    ancestor: { name: '先人崇拜', text: '{tribe}相信那些古老遺跡是神親手蓋的，開始模仿先人的工藝。', mods: { tech: 1.1, culture: 1.1 } },
    quake_dragon: { name: '地底巨龍', text: '{tribe}相信大地底下睡著一條龍，地震是牠在翻身。他們不再向天空祈禱，改向大地獻祭。', mods: { devotion: -0.15, culture: 1.1 } },
    winter_hearth: { name: '爐火之誓', text: '{tribe}熬過寒冬後立下誓言：爐火永遠不能熄滅。守火成了每個家庭的責任。', mods: { culture: 1.1, growth: 1.05 } },
    sea_mother: { name: '海之母', text: '{tribe}相信大海是你的子宮，所有魚都是你的孩子。出海前要先向海浪鞠躬。', mods: { fish: 1.3, devotion: 0.05 } },
    whale_ancestor: { name: '鯨是祖先', text: '{tribe}認為鯨魚是死去祖先的靈魂，從此禁止捕鯨，還會為擱淺的鯨舉行葬禮。', mods: { culture: 1.15, fish: 0.85 } },
    talking_beasts: { name: '獸之盟約', text: '{tribe}相信人和野獸曾經立下盟約：只取需要的，不多拿一分。', mods: { hunt: 0.9, defor: 0.7, devotion: 0.05 } },
    blood_moon: { name: '血月教團', text: '{tribe}出現了一個每逢血月就徹夜狂歡的教團，他們說血月是神睜開的眼睛。', mods: { faith: 1.3, tension: 0.03 } },
    twin_sun: { name: '雙日信仰', text: '{tribe}相信天上其實有兩個神，一個給予、一個奪取，他們學會了兩邊都拜。', mods: { faith: 1.15, culture: 1.1 } },
    crystal_voice: { name: '水晶之聲', text: '{tribe}相信水晶裡封著神的聲音，把水晶貼在耳邊就能聽見神諭。', mods: { path_mys: 1.3, devotion: 0.1 } },
    star_people: { name: '星之子民', text: '{tribe}相信那位旅人才是真正的神，而你只是祂的僕人。', mods: { tech: 1.15, devotion: -0.2 } },
  };

  // ── 奇蹟 ────────────────────────────────────────────
  // target：none（全世界）／tile（地區）／settlement（指定聚落）／colony（指定空地）
  const MIRACLES = [
    {
      id: 'fire', name: '賜火', icon: '🔥', cost: 15, minEra: 0, maxEra: 0, once: true, target: 'none',
      desc: '讓人類學會用火。沒有火的原始人，研究幾乎不會進步。',
      msg: '一道閃電劈中枯木。這一夜，人類第一次圍著火堆入睡。',
      effects: [{ t: 'flag', k: 'fire' }, { t: 'tech', v: 3 }, { t: 'devotion', v: 0.1, scope: 'all' }],
      side: [{ p: 0.35, text: '火勢失控，燒掉了一片森林。', effects: [{ t: 'burn', n: 8 }] }],
      myth: { pool: ['fire_tears', 'fire_priests', 'fire_thief'], chance: 0.8, scope: 'each' },
    },
    {
      id: 'insight', name: '啟示', icon: '💡', cost: 40, cd: 50, target: 'none',
      desc: '把答案直接放進人類腦中：目前的研究立刻前進一大步（最多 150 點，前期研究通常能直接完成）。',
      msg: '{settlement}的一個孩子突然說出了大人們想了一百年的答案。',
      effects: [{ t: 'research', pct: 1, max: 150 }],
      myth: { pool: ['dream_prophet', 'comet_omen'], chance: 0.4, scope: 'tribe' },
    },
    {
      id: 'rain', name: '豐收之雨', icon: '🌧️', cost: 12, cd: 15, target: 'tile', radius: 5,
      desc: '在指定地區降雨：人口增加、動物繁衍。雨下太久可能變成洪水。',
      msg: '烏雲在{place}上空聚集，乾裂的大地喝飽了水。',
      effects: [{ t: 'boom', pct: 0.25, scope: 'area' }, { t: 'herds', n: 2, near: true }],
      side: [{ p: 0.2, text: '雨下得太久，洪水淹沒了低地。', effects: [{ t: 'pop', pct: [0.1, 0.2], scope: 'area', cause: 'disaster' }, { t: 'myth', pool: ['flood_wrath'], chance: 0.7, scope: 'tribe' }] }],
      myth: { pool: ['rain_dance', 'rain_sacrifice'], chance: 0.5, scope: 'tribe' },
    },
    {
      id: 'fertility', name: '繁衍祝福', icon: '👶', cost: 20, cd: 30, target: 'none',
      desc: '所有人口增加 20%。人變多了，糧食和衝突的壓力也會跟著變大。',
      msg: '這一年，嬰兒的哭聲響遍了整個世界。',
      effects: [{ t: 'boom', pct: 0.2, scope: 'all', over: true }, { t: 'tension', v: 8 }],
      myth: { pool: ['fertility_cult'], chance: 0.5, scope: 'tribe' },
    },
    {
      id: 'dream', name: '智慧之夢', icon: '💭', cost: 30, cd: 35, minEra: 1, target: 'none',
      desc: '託夢給智者：目前的研究大幅前進，時代也往前推進一些。他們未必會照你的意思理解。',
      msg: '{tribe}的一位智者從夢中驚醒，畫下了他看見的東西。',
      effects: [{ t: 'research', pct: 0.5, max: 120 }, { t: 'techPct', v: 0.1 }],
      side: [{ p: 0.3, text: '有人把神諭寫成了另一個版本，信徒因此分裂。', effects: [{ t: 'schism' }] }],
      myth: { pool: ['dream_prophet', 'dream_heresy'], chance: 0.6, scope: 'tribe' },
    },
    {
      id: 'peace', name: '和平之兆', icon: '🕊️', cost: 20, cd: 25, target: 'none',
      desc: '大幅降低衝突。人們可能會變得太安逸。',
      msg: '一群白鴿從天而降，停在每一座村落的屋頂上。',
      effects: [{ t: 'tension', v: -40 }, { t: 'culture', v: 3, sc: 1 }],
      side: [{ p: 0.25, text: '日子過得太安逸，大家對研究失去了熱情。', effects: [{ t: 'mod', k: 'tech', mult: 0.7, dur: 40 }] }],
      myth: { pool: ['peace_dove', 'peace_passive'], chance: 0.5, scope: 'tribe' },
    },
    {
      id: 'guide', name: '引導遷徙', icon: '🧭', cost: 15, cd: 15, target: 'colony',
      desc: '指定一塊空地，讓最近的聚落派人去開拓。神的指引可以跨越海洋。',
      msg: '一道光柱落在遠方，{tribe}的人們收拾行囊追了過去。',
      effects: [{ t: 'colony' }],
      myth: { pool: ['guide_promised'], chance: 0.35, scope: 'tribe' },
    },
    {
      id: 'calm_sea', name: '平息海洋', icon: '🌊', cost: 20, cd: 30, target: 'none',
      desc: '把海怪趕回深淵，魚群和海龜回到海岸邊。',
      msg: '海面平靜得像一面鏡子，魚群在淺灘上閃閃發光。',
      effects: [{ t: 'killMonster' }, { t: 'spawn', type: 'fish', n: 3 }, { t: 'spawn', type: 'turtle', n: 1 }],
      myth: { pool: ['sea_mother'], chance: 0.5, scope: 'tribe' },
    },
    {
      id: 'wrath', name: '天罰', icon: '⚡', cost: 25, cd: 20, target: 'settlement',
      desc: '重擊一個聚落，讓所有人心生畏懼：衝突大降、虔誠上升。',
      msg: '雷火從天而降，{settlement}化為一片焦土。',
      effects: [{ t: 'pop', pct: [0.4, 0.6], scope: 'settlement', cause: 'wrath' }, { t: 'tension', v: -50 }, { t: 'devotion', v: 0.2, scope: 'all' }],
      myth: { pool: ['wrath_fear', 'wrath_martyr'], chance: 0.8, scope: 'each' },
    },
    {
      id: 'art', name: '啟迪藝術', icon: '🎨', cost: 25, cd: 30, minEra: 2, target: 'none',
      desc: '賜予靈感，文化大幅提升，衝突略降。',
      msg: '{settlement}的工匠一夜之間雕出了讓人落淚的作品。',
      effects: [{ t: 'culture', v: 10, sc: 1 }, { t: 'tension', v: -10 }],
      myth: { pool: ['art_muse', 'art_idol'], chance: 0.6, scope: 'tribe' },
    },
    {
      id: 'nature', name: '復育大地', icon: '🌳', cost: 25, cd: 30, target: 'none',
      desc: '森林重生、動物回歸，同時降低污染。',
      msg: '種子從灰燼中發芽，消失已久的獸群回到了原野。',
      effects: [{ t: 'regrow', n: 15 }, { t: 'herds', n: 4 }, { t: 'pollution', v: -15 }],
      myth: { pool: ['nature_spirits', 'nature_resource'], chance: 0.5, scope: 'tribe' },
    },
  ];

  // ── 一般事件（自動發生，不會暫停）──────────────────
  const EVENTS = [
    { id: 'harvest', minEra: 0, w: 3, kind: 'good', text: '{tribe}迎來了一個豐年，孩子們吃得飽飽的。', effects: [{ t: 'boom', pct: 0.1, scope: 'tribe' }] },
    { id: 'mammoth', minEra: 0, maxEra: 1, w: 1.5, kind: 'good', text: '{tribe}的獵人圍捕了一頭巨獸，全族吃了整整一個月。', effects: [{ t: 'boom', pct: 0.08, scope: 'tribe' }] },
    { id: 'comet', minEra: 0, w: 1, kind: 'myth', text: '一顆彗星劃過夜空，所有人都抬頭望著它。', effects: [{ t: 'faith', v: 15 }, { t: 'myth', pool: ['comet_omen'], chance: 0.5, scope: 'tribe' }] },
    { id: 'wildfire', minEra: 0, w: 1, kind: 'bad', text: '雷擊引發森林大火，燒了好幾天才熄滅。', effects: [{ t: 'burn', n: 6 }] },
    { id: 'drought', minEra: 0, w: 1.5, kind: 'bad', text: '{tribe}的土地整整一年沒下雨。', effects: [{ t: 'pop', pct: [0.05, 0.1], scope: 'tribe', cause: 'famine' }] },
    { id: 'whale_beach', minEra: 0, w: 1, coastal: true, kind: 'myth', text: '一頭巨大的鯨魚擱淺在{settlement}的海灘上，全村的人圍著牠看了三天三夜。', effects: [{ t: 'boom', pct: 0.06, scope: 'tribe' }, { t: 'myth', pool: ['whale_ancestor', 'sea_mother'], chance: 0.4, scope: 'tribe' }] },
    { id: 'turtle_eggs', minEra: 0, w: 1, coastal: true, kind: 'good', text: '成千上萬隻小海龜在{settlement}的沙灘上破殼而出。', effects: [{ t: 'spawn', type: 'turtle', n: 2 }] },
    { id: 'inventor', minEra: 1, w: 2, kind: 'good', text: '{settlement}出了一位天才工匠，他的發明改變了大家的生活。', effects: [{ t: 'research', pct: 0.3 }, { t: 'techPct', v: 0.03 }] },
    { id: 'clash', minEra: 1, w: 3, needsTwo: true, kind: 'bad', text: '{tribe}和{tribeB}在邊境爆發衝突，雙方都有人喪命。', effects: [{ t: 'tension', v: 15 }, { t: 'pop', pct: [0.02, 0.05], scope: 'tribe', cause: 'war' }] },
    { id: 'festival', minEra: 1, w: 2, kind: 'good', text: '{tribe}舉辦了盛大的祭典，為你獻上歌舞。', effects: [{ t: 'faith', v: 8 }, { t: 'tension', v: -5 }, { t: 'culture', v: 1, sc: 1 }] },
    { id: 'horse', minEra: 1, maxEra: 3, w: 1, once: true, kind: 'good', text: '{tribe}馴服了第一匹野馬，世界一下子變小了。', effects: [{ t: 'techPct', v: 0.08 }, { t: 'migrate', n: 1 }] },
    { id: 'poet', minEra: 2, w: 2, kind: 'good', text: '一位詩人在{settlement}寫下了流傳千年的史詩。', effects: [{ t: 'culture', v: 4, sc: 1 }] },
    { id: 'doubt', minEra: 2, w: 1.5, kind: 'bad', text: '{settlement}有人開始質疑神是否存在，越來越多人覺得他說得有道理。', effects: [{ t: 'devotion', v: -0.1, scope: 'tribe' }] },
    { id: 'temple', minEra: 2, w: 1.5, kind: 'myth', text: '{tribe}蓋起一座宏偉的神殿，但裡面供奉的神像長得一點都不像你。', effects: [{ t: 'devotion', v: 0.1, scope: 'tribe' }, { t: 'faith', v: 10 }] },
    { id: 'trade', minEra: 3, w: 2, needsTwo: true, kind: 'good', text: '{tribe}和{tribeB}之間開通了商路，商隊帶來了貨物，也帶來了新想法。', effects: [{ t: 'tension', v: -12 }, { t: 'culture', v: 3, sc: 1 }, { t: 'research', pct: 0.15 }] },
    { id: 'philosopher', minEra: 3, maxEra: 5, w: 1.5, kind: 'myth', text: '{settlement}的一位哲學家主張：「神或許只是我們還不理解的自然現象。」', effects: [{ t: 'research', pct: 0.2 }, { t: 'devotion', v: -0.08, scope: 'all' }] },
    { id: 'explorer', minEra: 4, w: 1.5, kind: 'good', text: '{tribe}的探險家發現了一片無人的土地。', effects: [{ t: 'migrate', n: 2 }] },
    { id: 'babyboom', minEra: 4, w: 1, kind: 'good', text: '太平盛世，{tribe}的人口快速增長。', effects: [{ t: 'boom', pct: 0.12, scope: 'tribe' }] },
    { id: 'steam', minEra: 5, maxEra: 5, w: 1.5, kind: 'good', text: '{settlement}的煙囪越來越多，機器日夜不停地運轉。', effects: [{ t: 'techPct', v: 0.05 }, { t: 'pollution', v: 6 }] },
    { id: 'thinking_machine', minEra: 6, w: 1.5, kind: 'myth', text: '{settlement}的研究者造出了會思考的機器。機器問的第一個問題是：「誰創造了你們？」', effects: [{ t: 'techPct', v: 0.06 }] },
  ];

  // ── 奇特事件：有好壞兩種走向，「異象解讀」能讓好結果更常出現 ──
  const ODDITIES = [
    {
      id: 'blood_moon', name: '血月', icon: '🌑', w: 1.2,
      good: { text: '{tribe}在血月下舉行盛大的儀式，所有人都說看見了神的臉。', effects: [{ t: 'faith', v: 30 }, { t: 'myth', pool: ['blood_moon'], chance: 0.5, scope: 'tribe' }] },
      bad: { text: '血月升起的那一夜，人們互相指控是對方召來了厄運。', effects: [{ t: 'tension', v: 25 }, { t: 'myth', pool: ['blood_moon'], chance: 0.3, scope: 'tribe' }] },
    },
    {
      id: 'sunken_city', name: '海底古城', icon: '🏛️', w: 1, coastal: true,
      good: { text: '退潮時，{settlement}外的海面浮出了一座古城，城牆上的壁畫標示著星星的位置。', effects: [{ t: 'research', pct: 0.6 }, { t: 'culture', v: 3, sc: 1 }] },
      bad: { text: '{settlement}外的海面浮出了一座古城。城裡有什麼東西醒了過來，游向了深海。', effects: [{ t: 'spawn', type: 'kraken', n: 1 }, { t: 'pop', pct: [0.03, 0.06], scope: 'tribe', cause: 'kraken' }] },
    },
    {
      id: 'talking_beasts', name: '動物開口說話', icon: '🦊', w: 1,
      good: { text: '{settlement}的獵人發誓，有一頭鹿開口求他手下留情。從此他們不再濫捕。', effects: [{ t: 'herds', n: 3 }, { t: 'myth', pool: ['talking_beasts'], chance: 0.7, scope: 'tribe' }] },
      bad: { text: '動物們開口說話了，說的全是人類的壞話。{tribe}的人嚇得好幾年不敢出門打獵。', effects: [{ t: 'mod', k: 'growth', mult: 0.8, dur: 30 }, { t: 'devotion', v: -0.05, scope: 'tribe' }] },
    },
    {
      id: 'sleepwalk', name: '集體夢遊', icon: '😴', w: 1,
      good: { text: '{settlement}的人在同一個夜裡夢遊，醒來時發現自己站在一片肥沃的新土地上。', effects: [{ t: 'migrate', n: 1 }, { t: 'research', pct: 0.2 }] },
      bad: { text: '{settlement}的人集體夢遊走進了海裡，只有少數人醒了過來。', effects: [{ t: 'pop', pct: [0.15, 0.3], scope: 'settlement', cause: 'collapse' }] },
    },
    {
      id: 'twin_sun', name: '雙日', icon: '☀️', w: 1,
      good: { text: '天上出現了兩個太陽，作物瘋狂地生長。', effects: [{ t: 'mod', k: 'growth', mult: 1.3, dur: 40 }, { t: 'myth', pool: ['twin_sun'], chance: 0.5, scope: 'tribe' }] },
      bad: { text: '天上出現了兩個太陽，河流乾涸、森林起火。', effects: [{ t: 'pop', pct: [0.05, 0.1], scope: 'all', cause: 'famine' }, { t: 'burn', n: 6 }, { t: 'myth', pool: ['twin_sun'], chance: 0.4, scope: 'tribe' }] },
    },
    {
      id: 'crystal_rain', name: '水晶雨', icon: '💎', w: 1,
      good: { text: '一場閃閃發光的雨落在{place}附近，地面長出了大片水晶。', effects: [{ t: 'crystal', n: 6 }, { t: 'research', pct: 0.3 }, { t: 'myth', pool: ['crystal_voice'], chance: 0.5, scope: 'tribe' }] },
      bad: { text: '天上掉下了水晶，{tribe}和{tribeB}為了搶水晶大打出手。', effects: [{ t: 'crystal', n: 6 }, { t: 'tension', v: 15 }] },
    },
    {
      id: 'bone_song', name: '巨骨之歌', icon: '🦴', w: 0.8,
      good: { text: '荒原上的巨大骸骨在夜裡唱起了歌，{tribe}的人把歌詞抄了下來。', effects: [{ t: 'culture', v: 5, sc: 1 }, { t: 'crystal', n: 4, type: 16 }] },
      bad: { text: '荒原上的巨大骸骨在夜裡發出哀號，{tribe}認定那是不祥之兆。', effects: [{ t: 'tension', v: 10 }, { t: 'crystal', n: 4, type: 16 }] },
    },
    {
      id: 'frozen_village', name: '停滯的村莊', icon: '⏳', w: 0.7, minEra: 1,
      good: { text: '{settlement}的時間停了一百年。重新流動之後，村民帶回了來自未來的知識。', effects: [{ t: 'techPct', v: 0.08 }, { t: 'research', pct: 0.5 }] },
      bad: { text: '{settlement}連同所有人從地圖上消失了，只剩下一圈焦黑的地面。', effects: [{ t: 'pop', pct: [1, 1], scope: 'settlement', cause: 'collapse' }] },
    },
    {
      id: 'star_visitor', name: '星之旅人', icon: '👽', w: 0.7, minEra: 1,
      good: { text: '一位發光的旅人從天而降，在{settlement}住了一年，教會人們許多不可思議的事。', effects: [{ t: 'techPct', v: 0.1 }, { t: 'myth', pool: ['star_people'], chance: 0.4, scope: 'tribe' }] },
      bad: { text: '一位發光的旅人在{settlement}待了一晚就離開了。隔天，所有人開始發燒。', effects: [{ t: 'crisis', id: 'plague' }] },
    },
    {
      id: 'fish_rain', name: '魚雨', icon: '🐟', w: 1,
      good: { text: '天上下起了魚，{tribe}的人撿了整整一個星期。', effects: [{ t: 'boom', pct: 0.12, scope: 'tribe' }, { t: 'spawn', type: 'fish', n: 2 }] },
      bad: { text: '魚雨下了七天，腐爛的魚堆成了山，臭味引來了疾病。', effects: [{ t: 'pop', pct: [0.03, 0.07], scope: 'tribe', cause: 'plague' }] },
    },
    {
      id: 'mirror_folk', name: '鏡中人', icon: '🪞', w: 0.8,
      good: { text: '{tribe}的人在水面看見另一個自己向他們鞠躬。他們相信那是神派來的使者。', effects: [{ t: 'devotion', v: 0.1, scope: 'all' }, { t: 'faith', v: 15 }] },
      bad: { text: '{tribe}的人在水面看見另一個自己在嘲笑他們。從此他們不再相信眼睛看到的任何東西，包括神蹟。', effects: [{ t: 'devotion', v: -0.15, scope: 'all' }] },
    },
    {
      id: 'aurora', name: '極光之歌', icon: '🌌', w: 1,
      good: { text: '整片天空亮起了會唱歌的極光，人們跟著哼出了新的旋律。', effects: [{ t: 'faith', v: 25 }, { t: 'culture', v: 2, sc: 1 }] },
      bad: { text: '天空亮起了會唱歌的極光，人們什麼事都不做，每天只躺著看天空。', effects: [{ t: 'mod', k: 'tech', mult: 0.85, dur: 25 }] },
    },
    {
      id: 'giant_wake', name: '巨獸甦醒', icon: '🦣', w: 0.8,
      good: { text: '冰層裂開，一群遠古巨獸走了出來，在{place}附近的原野上繁衍。', effects: [{ t: 'herds', n: 4 }, { t: 'boom', pct: 0.08, scope: 'tribe' }] },
      bad: { text: '冰層裂開，一頭遠古巨獸走了出來，踩平了{settlement}。', effects: [{ t: 'pop', pct: [0.25, 0.45], scope: 'settlement', cause: 'wolves' }] },
    },
  ];

  // ── 危機（世界會暫停，等你決定）──────────────────
  // prob(i)：i = { era, P, nature, overFrac, tribes, tension, pollution, flags, coastal, volcNear, m(k) }
  // option.req：要研究過該節點才會出現
  const passive = (p, cause) => ({ t: 'chance', p, then: [{ t: 'extinct', cause }], else: [] });
  const CRISES = [
    {
      id: 'winter', name: '大寒冬', icon: '❄️',
      prob: (i) => (i.era <= 1 ? 0.0025 : 0),
      text: '一場前所未有的寒冬降臨，{tribe}縮在洞穴裡瑟瑟發抖，雪已經下了四十天。',
      options: [
        { label: '融化冰雪', cost: 25, desc: '寒冬提早結束，幾乎沒有傷亡。', effects: [{ t: 'pop', pct: [0.02, 0.05], scope: 'all', cause: 'cold' }, { t: 'devotion', v: 0.1, scope: 'all' }], result: '太陽重新露臉，冰雪在一天之內融化。' },
        { label: '讓他們圍著火堆撐過去', cost: 10, desc: '損失一到兩成人口。若還沒有火，他們會在絕望中學會生火。', effects: [{ t: 'pop', pct: [0.1, 0.2], scope: 'all', cause: 'cold' }, { t: 'flag', k: 'fire' }, { t: 'myth', pool: ['winter_hearth'], chance: 0.6, scope: 'tribe' }], result: '他們擠在一起，守著微弱的火光熬過了冬天。' },
        { label: '袖手旁觀', cost: 0, desc: '可能失去一半以上的人，約兩成機會全滅。', effects: [{ t: 'pop', pct: [0.4, 0.75], scope: 'all', cause: 'cold' }, passive(0.2, 'cold')], result: '春天來的時候，很多人沒能醒來。' },
      ],
    },
    {
      id: 'plague', name: '大瘟疫', icon: '☠️',
      prob: (i) => (i.era >= 1 ? 0.0012 + Math.min(0.003, i.P / 150000) : 0.0004) * i.m('plague'),
      text: '一種可怕的熱病在{settlement}爆發，正沿著道路蔓延到每一座聚落。人們跪在地上向天空哭喊。',
      options: [
        { label: '降下治癒', cost: 40, desc: '瘟疫消散，只有少數人喪命。', effects: [{ t: 'pop', pct: [0.03, 0.06], scope: 'all', cause: 'plague' }, { t: 'devotion', v: 0.15, scope: 'all' }, { t: 'myth', pool: ['plague_holy_water', 'plague_sin'], chance: 0.7, scope: 'each' }], result: '瘟疫在一夜之間消失了。' },
        { label: '草藥治療', req: 'nat3', cost: 5, desc: '【草藥】醫者們早有準備，損失不到一成。', effects: [{ t: 'pop', pct: [0.05, 0.09], scope: 'all', cause: 'plague' }, { t: 'myth', pool: ['plague_healers'], chance: 0.4, scope: 'tribe' }], result: '藥草的苦味飄滿了每一條街。' },
        { label: '啟發他們隔離病人', cost: 15, desc: '損失約兩成人口，但醫學知識會進步。', effects: [{ t: 'pop', pct: [0.15, 0.25], scope: 'all', cause: 'plague' }, { t: 'research', pct: 0.3 }, { t: 'myth', pool: ['plague_healers'], chance: 0.6, scope: 'tribe' }], result: '他們把病人關進城外的帳篷。很殘忍，但有效。' },
        { label: '袖手旁觀', cost: 0, desc: '可能失去一半以上的人口，約一成五機會全滅。', effects: [{ t: 'pop', pct: [0.4, 0.75], scope: 'all', cause: 'plague' }, passive(0.15, 'plague'), { t: 'devotion', v: -0.1, scope: 'all' }], result: '神沒有回應。屍體堆滿了街道。' },
      ],
    },
    {
      id: 'famine', name: '大饑荒', icon: '🥀',
      prob: (i) => (i.nature < 35 ? 0.004 : i.overFrac > 0.4 ? 0.0025 : 0.0003) * i.m('famine'),
      text: '連年歉收，{tribe}的糧倉已經見底。母親們把最後一口食物餵給孩子。',
      options: [
        { label: '降下天糧', cost: 35, desc: '食物從天而降，幾乎沒有人餓死。', effects: [{ t: 'pop', pct: [0.02, 0.05], scope: 'all', cause: 'famine' }, { t: 'myth', pool: ['manna_wait'], chance: 0.6, scope: 'each' }], result: '清晨，大地鋪滿了白色的麵餅。' },
        { label: '開倉放糧', req: 'farm4', cost: 0, desc: '【糧倉】打開儲備，幾乎沒有損失。', effects: [{ t: 'pop', pct: [0.02, 0.04], scope: 'all', cause: 'famine' }], result: '糧倉的門打開了，隊伍排了三天三夜。' },
        { label: '引導他們遷徙', cost: 15, desc: '一部分人在路上倒下，倖存者會找到新土地。', effects: [{ t: 'pop', pct: [0.12, 0.2], scope: 'all', cause: 'famine' }, { t: 'migrate', n: 3 }], result: '長長的隊伍往遠方移動，路邊留下了許多墳墓。' },
        { label: '袖手旁觀', cost: 0, desc: '大量人口餓死，倖存者會為了食物互相爭奪。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.35, 0.65], scope: 'all', cause: 'famine' }, passive(0.1, 'famine'), { t: 'tension', v: 20 }], result: '人們開始為了最後一點糧食互相殘殺。' },
      ],
    },
    {
      id: 'locust', name: '蝗災', icon: '🦗',
      prob: (i) => (i.era >= 2 ? 0.0003 * i.m('famine') : 0),
      text: '遮天蔽日的蝗蟲從{place}的方向飛來，所到之處寸草不生。',
      options: [
        { label: '降下鳥群', cost: 25, desc: '飛鳥把蝗蟲吃得一乾二淨。', effects: [{ t: 'pop', pct: [0.01, 0.03], scope: 'all', cause: 'famine' }], result: '天空先是被蝗蟲遮住，然後被鳥群遮住。' },
        { label: '讓家禽吃掉蝗蟲', req: 'nat2', cost: 0, desc: '【馴化】雞鴨大軍出動，損失很小。', effects: [{ t: 'pop', pct: [0.02, 0.05], scope: 'all', cause: 'famine' }], result: '家家戶戶把雞鴨趕進田裡，牠們吃得很開心。' },
        { label: '啟發他們改種別的作物', cost: 10, desc: '損失約一成，之後一段時間成長變慢。', effects: [{ t: 'pop', pct: [0.08, 0.12], scope: 'all', cause: 'famine' }, { t: 'mod', k: 'growth', mult: 0.8, dur: 30 }], result: '他們改種了蝗蟲不吃的苦根。' },
        { label: '袖手旁觀', cost: 0, desc: '作物全毀。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.2, 0.4], scope: 'all', cause: 'famine' }, passive(0.08, 'famine')], result: '蝗蟲飛走之後，田裡只剩下泥土。' },
      ],
    },
    {
      id: 'war', name: '大戰爭', icon: '⚔️', needsTwo: true,
      prob: (i) => (i.tribes >= 2 && i.tension >= 70 ? 0.04 : 0),
      text: '{tribe}和{tribeB}之間的仇恨終於爆發，戰火燒遍了邊境。',
      options: [
        { label: '天罰雙方', cost: 30, desc: '用雷霆嚇停戰爭。死傷不多，但他們會開始怕你。', effects: [{ t: 'pop', pct: [0.08, 0.15], scope: 'all', cause: 'war' }, { t: 'tensionSet', v: 10 }, { t: 'devotion', v: 0.2, scope: 'all' }, { t: 'myth', pool: ['wrath_fear'], chance: 0.6, scope: 'each' }], result: '雷霆劈在兩軍之間，所有人都丟下武器跪了下來。' },
        { label: '帝國鎮壓', req: 'war4', cost: 0, desc: '【帝國】帝國軍迅速平定戰亂，統一所有部族。', effects: [{ t: 'conquerAll' }, { t: 'pop', pct: [0.05, 0.1], scope: 'all', cause: 'war' }, { t: 'tensionSet', v: 5 }], result: '帝國的旗幟插遍了每一座城。' },
        { label: '託夢給和平使者', cost: 20, desc: '大約六成機會談和成功；失敗的話戰爭會繼續。', effects: [{ t: 'chance', p: 0.65, then: [{ t: 'log', text: '一位使者帶著神諭走進敵營，雙方放下了武器。', kind: 'good' }, { t: 'tensionSet', v: 25 }, { t: 'culture', v: 5, sc: 1 }, { t: 'myth', pool: ['peace_dove'], chance: 0.5, scope: 'tribe' }], else: [{ t: 'log', text: '使者被殺了，戰爭繼續了好幾十年。', kind: 'bad' }, { t: 'pop', pct: [0.2, 0.35], scope: 'all', cause: 'war' }, { t: 'tension', v: -30 }] }], result: '你在一個人的夢裡說了話。' },
        { label: '讓強者統一', cost: 0, desc: '較強的一方吞併另一方。死傷慘重，但從此少一個國家。', effects: [{ t: 'conquer' }, { t: 'pop', pct: [0.15, 0.3], scope: 'all', cause: 'war' }, { t: 'tensionSet', v: 5 }, { t: 'culture', v: -3, sc: 1 }], result: '勝利者改寫了歷史。' },
        { label: '袖手旁觀', cost: 0, desc: '戰爭會打到雙方都打不下去為止，城市會被毀。約一成機會同歸於盡。', effects: [{ t: 'pop', pct: [0.3, 0.6], scope: 'all', cause: 'war' }, passive(0.1, 'war'), { t: 'destroy', n: 3, cause: 'war' }, { t: 'tension', v: -35 }], result: '戰爭結束了，因為已經沒有人能再打下去。' },
      ],
    },
    {
      id: 'volcano', name: '火山爆發', icon: '🌋',
      prob: (i) => 0.0001 + (i.volcNear ? 0.0007 : 0),
      text: '{place}附近的火山開始冒煙，大地每天都在顫抖。',
      options: [
        { label: '平息大地', cost: 45, desc: '火山重新沉睡。', effects: [{ t: 'myth', pool: ['quake_dragon'], chance: 0.4, scope: 'tribe' }], result: '大地安靜了下來。人們不知道是誰救了他們。' },
        { label: '託夢預警', cost: 15, desc: '大部分人來得及逃走。', effects: [{ t: 'pop', pct: [0.08, 0.15], scope: 'all', cause: 'disaster' }, { t: 'myth', pool: ['doom_prophecy'], chance: 0.4, scope: 'tribe' }], result: '有人夢見大火，帶著家人連夜逃走。' },
        { label: '袖手旁觀', cost: 0, desc: '火山灰會吞沒一大片土地。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.3, 0.6], scope: 'all', cause: 'disaster' }, passive(0.1, 'disaster'), { t: 'burn', n: 10 }, { t: 'myth', pool: ['quake_dragon'], chance: 0.6, scope: 'each' }], result: '天空黑了整整三年。' },
      ],
    },
    {
      id: 'earthquake', name: '大地震', icon: '🏚️',
      prob: () => 0.0003,
      text: '大地裂開了一道口子，{settlement}的房子像積木一樣倒塌。',
      options: [
        { label: '縫合大地', cost: 40, desc: '裂縫闔上，幾乎沒有傷亡。', effects: [{ t: 'pop', pct: [0.01, 0.03], scope: 'all', cause: 'disaster' }], result: '裂縫像傷口一樣慢慢癒合了。' },
        { label: '讓他們逃到空地', cost: 15, desc: '損失約一成。', effects: [{ t: 'pop', pct: [0.08, 0.14], scope: 'all', cause: 'disaster' }, { t: 'myth', pool: ['quake_dragon'], chance: 0.4, scope: 'tribe' }], result: '一隻狗把全村的人吵醒，大家跑到了田裡。' },
        { label: '袖手旁觀', cost: 0, desc: '城市會倒塌。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.2, 0.4], scope: 'all', cause: 'disaster' }, passive(0.08, 'disaster'), { t: 'destroy', n: 1, cause: 'disaster' }, { t: 'myth', pool: ['quake_dragon'], chance: 0.6, scope: 'each' }], result: '大地停止搖晃的時候，很多城已經不在了。' },
      ],
    },
    {
      id: 'tsunami', name: '海嘯', icon: '🌊',
      prob: (i) => (i.coastal > 0.3 ? 0.0003 : 0),
      text: '海水突然退到看不見的地方，接著一道比山還高的浪撲向了{settlement}。',
      options: [
        { label: '擋下巨浪', cost: 45, desc: '海浪在岸邊碎成泡沫。', effects: [{ t: 'myth', pool: ['sea_mother'], chance: 0.5, scope: 'tribe' }], result: '巨浪在半空中停住，然後碎成了雨。' },
        { label: '船隊出海避難', req: 'sea4', cost: 0, desc: '【星圖航行】船隊載著人往外海逃，損失很小。', effects: [{ t: 'pop', pct: [0.04, 0.08], scope: 'all', cause: 'disaster' }], result: '浪頭從船底下滑了過去。' },
        { label: '託夢叫他們上山', cost: 15, desc: '損失約一成。', effects: [{ t: 'pop', pct: [0.08, 0.15], scope: 'all', cause: 'disaster' }], result: '他們跟著一隻白鳥爬上了山頂。' },
        { label: '袖手旁觀', cost: 0, desc: '沿海城市會被沖走。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.25, 0.5], scope: 'all', cause: 'disaster' }, passive(0.08, 'disaster'), { t: 'myth', pool: ['flood_wrath'], chance: 0.6, scope: 'each' }], result: '海水退去之後，海岸線變了樣子。' },
      ],
    },
    {
      id: 'hurricane', name: '颶風', icon: '🌀',
      prob: () => 0.0003,
      text: '一團巨大的風暴在海上成形，正往{place}移動。',
      options: [
        { label: '驅散風暴', cost: 30, desc: '風暴消散。', effects: [], result: '風暴在靠岸前散成了一片晴空。' },
        { label: '預警託夢', cost: 10, desc: '損失約一成，部分森林被吹倒。', effects: [{ t: 'pop', pct: [0.05, 0.1], scope: 'all', cause: 'disaster' }, { t: 'burn', n: 5 }], result: '他們躲進了地窖。' },
        { label: '袖手旁觀', cost: 0, desc: '損失慘重。小機會全滅。', effects: [{ t: 'pop', pct: [0.15, 0.35], scope: 'all', cause: 'disaster' }, passive(0.05, 'disaster'), { t: 'burn', n: 10 }], result: '風停的時候，連山的形狀都變了。' },
      ],
    },
    {
      id: 'flood', name: '大洪水', icon: '🌧️',
      prob: () => 0.0003,
      text: '暴雨連下了一百天，河水漫過了{settlement}的城牆。',
      options: [
        { label: '分開洪水', cost: 40, desc: '洪水退去，損失很小。', effects: [{ t: 'pop', pct: [0.02, 0.04], scope: 'all', cause: 'disaster' }, { t: 'devotion', v: 0.1, scope: 'all' }], result: '洪水在城門前分成兩半。' },
        { label: '指引他們到高地', cost: 15, desc: '損失約一成，倖存者會在高地建立新家園。', effects: [{ t: 'pop', pct: [0.1, 0.15], scope: 'all', cause: 'disaster' }, { t: 'migrate', n: 2 }], result: '他們跟著一隻白鳥爬上了山頂。' },
        { label: '袖手旁觀', cost: 0, desc: '洪水會帶走很多人。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.25, 0.55], scope: 'all', cause: 'disaster' }, passive(0.1, 'disaster'), { t: 'tension', v: 10 }, { t: 'myth', pool: ['flood_wrath'], chance: 0.7, scope: 'each' }], result: '水退之後，世界安靜得可怕。' },
      ],
    },
    {
      id: 'meteor', name: '隕石', icon: '☄️',
      prob: (i) => (i.era >= 1 ? 0.00015 : 0),
      text: '夜空裡出現一顆越來越亮的星星，而且它正在往下掉。',
      options: [
        { label: '擊碎隕石', cost: 50, desc: '隕石在空中化成流星雨。', effects: [{ t: 'faith', v: 10 }, { t: 'myth', pool: ['comet_omen'], chance: 0.5, scope: 'each' }], result: '那一晚的流星雨，人們記了一千年。' },
        { label: '預知墜落點', req: 'mys2', cost: 0, desc: '【解夢】占卜師算出了墜落點，人們提早撤離，還得到了水晶。', effects: [{ t: 'pop', pct: [0.02, 0.05], scope: 'all', cause: 'disaster' }, { t: 'crystal', n: 6 }], result: '隕石落在了空蕩蕩的山谷裡。' },
        { label: '讓它落在無人之地', cost: 20, desc: '大地會留下一片水晶荒原。', effects: [{ t: 'crystal', n: 7 }, { t: 'research', pct: 0.3 }], result: '隕石砸出一個大坑，坑裡長滿了水晶。' },
        { label: '袖手旁觀', cost: 0, desc: '隕石會落在人群裡。約一成五機會全滅。', effects: [{ t: 'pop', pct: [0.3, 0.6], scope: 'all', cause: 'disaster' }, passive(0.15, 'disaster'), { t: 'crystal', n: 6 }, { t: 'burn', n: 12 }], result: '天空亮得像白天，然後一切都暗了。' },
      ],
    },
    {
      id: 'pollution', name: '黑色天空', icon: '🏭',
      prob: (i) => (i.era >= 5 && i.pollution >= 70 ? 0.05 : 0),
      text: '工廠的黑煙遮住了太陽，河水發出惡臭，孩子們咳個不停。',
      options: [
        { label: '淨化天空', cost: 50, desc: '污染大幅下降。但他們可能從此覺得污染不是問題。', effects: [{ t: 'pollution', v: -60 }, { t: 'myth', pool: ['sky_clean'], chance: 0.7, scope: 'each' }], result: '一陣大風吹過，天空藍得不可思議。' },
        { label: '量子淨化', req: 'craft5', cost: 0, desc: '【量子】用新科技把污染分解掉。', effects: [{ t: 'pollution', v: -45 }], result: '巨大的淨化塔在一夜之間把天空洗乾淨了。' },
        { label: '啟發綠色科技', cost: 30, desc: '之後的污染減半，但研究會暫時變慢。', effects: [{ t: 'flag', k: 'green' }, { t: 'pollution', v: -25 }, { t: 'mod', k: 'tech', mult: 0.8, dur: 40 }, { t: 'myth', pool: ['green_faith'], chance: 0.6, scope: 'tribe' }], result: '一位發明家看著陽光，想到了新的能源。' },
        { label: '袖手旁觀', cost: 0, desc: '人口和自然都會受到重創。約一成機會全滅。', effects: [{ t: 'pop', pct: [0.25, 0.45], scope: 'all', cause: 'pollution' }, passive(0.1, 'pollution'), { t: 'pollution', v: -30 }, { t: 'mod', k: 'growth', mult: 0.7, dur: 60 }], result: '城市裡的人一個接一個病倒了。' },
      ],
    },
    {
      id: 'doom', name: '末日武器', icon: '☢️', needsTwo: true, flag: 'doom',
      prob: (i) => (i.era >= 6 && i.tribes >= 2 && i.tension >= 40 && !i.flags.doom ? 0.02 * i.m('doom') : 0),
      text: '{tribe}和{tribeB}都造出了能毀滅世界的武器。某個深夜，雙方的手指都放在了按鈕上。',
      options: [
        { label: '讓所有武器失靈', cost: 60, desc: '危機解除。', effects: [{ t: 'tensionSet', v: 0 }, { t: 'myth', pool: ['weapons_fail'], chance: 0.8, scope: 'each' }], result: '所有螢幕同時熄滅，按鈕再也按不下去。' },
        { label: '威懾平衡', req: 'war5', cost: 0, desc: '【威懾】雙方都知道先動手就會一起毀滅。八成五機會平安。', effects: [{ t: 'chance', p: 0.85, then: [{ t: 'log', text: '雙方對峙了一整夜，最後都把手收了回去。', kind: 'good' }, { t: 'tension', v: -40 }], else: [{ t: 'log', text: '有一個人的手抖了一下。', kind: 'bad' }, { t: 'pop', pct: [0.8, 0.95], scope: 'all', cause: 'doom' }, { t: 'pollution', v: 60 }] }], result: '冷戰開始了。' },
        { label: '讓領袖做噩夢', cost: 25, desc: '七成機會讓他們收手；三成機會反而刺激他們先動手。', effects: [{ t: 'chance', p: 0.7, then: [{ t: 'log', text: '領袖從噩夢中驚醒，下令拆除所有武器。', kind: 'good' }, { t: 'tension', v: -40 }, { t: 'myth', pool: ['doom_prophecy'], chance: 0.6, scope: 'tribe' }], else: [{ t: 'log', text: '噩夢讓他以為對方要先動手了。', kind: 'bad' }, { t: 'pop', pct: [0.8, 0.95], scope: 'all', cause: 'doom' }, { t: 'burn', n: 30 }, { t: 'pollution', v: 60 }] }], result: '你走進了一個人的夢裡。' },
        { label: '袖手旁觀', cost: 0, desc: '一半一半。', effects: [{ t: 'chance', p: 0.5, then: [{ t: 'log', text: '最後一刻，有人沒有按下按鈕。', kind: 'good' }, { t: 'tension', v: -30 }], else: [{ t: 'extinct', cause: 'doom' }] }], result: '你閉上了眼睛。' },
      ],
    },
  ];

  // ── 結局（由上往下判斷，第一個符合的成立）────────────
  // x = { nature, culture, tech, tension, pollution, devotion, tribes, oddSeen, paths: {farm:n,...} }
  const ENDINGS = [
    { id: 'beyond', name: '帷幕之外', icon: '🌀', hidden: true, cond: (x) => x.paths.mys >= 5 && x.oddSeen >= 5, text: '他們終於看穿了世界的帷幕，也看見了你。那一刻，他們沒有跪下，而是向你伸出了手。你第一次聽懂了他們的語言，他們也第一次真正懂了你。' },
    { id: 'iron', name: '鋼鐵荒原', icon: '🏗️', cond: (x) => x.nature < 15, text: '他們抵達了未來，代價是整個世界。最後一棵樹被種在博物館的玻璃櫃裡，孩子們排隊參觀，就像參觀恐龍化石。' },
    { id: 'empire', name: '永恆帝國', icon: '👑', cond: (x) => x.paths.war >= 4 && x.tribes === 1, text: '整個世界只剩下一面旗幟。帝國沒有敵人，也沒有邊界。皇帝在登基儀式上說：「我們的神，就是秩序。」' },
    { id: 'ocean', name: '海洋文明', icon: '🐋', cond: (x) => x.paths.sea >= 5 && x.pollution < 50, text: '他們把城市建在海上，和鯨魚一起遷徙。陸地成了度假的地方，大海才是家。' },
    { id: 'gaia', name: '蓋亞之歌', icon: '🌿', cond: (x) => x.nature >= 55 && x.pollution < 30, text: '他們沒有去征服星空，而是選擇留在地上，和森林、獸群一起生活。城市長在樹上，河水清澈見底。這是一個不需要神的樂園，但他們每天還是會對天空說聲謝謝。' },
    { id: 'muse', name: '藝術大同', icon: '🎭', cond: (x) => x.culture >= x.tech * 0.9 && x.tension < 35, text: '他們發現，比起更快的機器，更想要的是更美的東西。戰爭成了只存在於戲劇裡的情節，每個人都是藝術家。' },
    { id: 'theocracy', name: '神之國度', icon: '⛪', cond: (x) => x.devotion >= 0.6, text: '他們把整個文明獻給了你。每座城都是神殿，每項科技都用來讚美你。他們很完美，也完全依賴你。你不確定這是不是你想要的。' },
    { id: 'godless', name: '無神的黃金時代', icon: '🌅', cond: (x) => x.devotion <= 0.08, text: '他們早就忘了你。他們靠自己走到了這一步，在歷史書裡，你只是一則古老的傳說。你看著他們，覺得驕傲，也有一點寂寞。' },
    { id: 'stars', name: '星海遠航', icon: '🚀', cond: () => true, text: '第一艘殖民船駛離了母星。他們帶著你從沒教過的知識，飛向你從未創造過的星空。' },
  ];

  // ── 滅亡方式 ────────────────────────────────────────
  const DOOMS = {
    cold: { name: '凍死於寒冬', icon: '❄️' },
    plague: { name: '死於瘟疫', icon: '☠️' },
    famine: { name: '餓死', icon: '🥀' },
    war: { name: '自相殘殺', icon: '⚔️' },
    disaster: { name: '毀於天災', icon: '🌋' },
    pollution: { name: '窒息於污染', icon: '🏭' },
    doom: { name: '核戰末日', icon: '☢️' },
    wrath: { name: '被你親手毀滅', icon: '⚡' },
    wolves: { name: '被野獸吞噬', icon: '🐺' },
    kraken: { name: '被海怪拖進深淵', icon: '🐙' },
    collapse: { name: '離奇消失', icon: '🕯️' },
  };

  // ── 名字 ────────────────────────────────────────────
  const NAMES = {
    world1: ['蒼', '翠', '赤', '玄', '霜', '曦', '渺', '綾', '嵐', '澄', '琥', '靛', '霧', '晴'],
    world2: ['原', '洲', '域', '界', '土', '陸', '野', '海'],
    tribe: ['赤石', '風語', '白鹿', '黑羽', '灰狼', '月牙', '青藤', '鐵角', '霧谷', '金沙', '雷鳴', '火眼', '長河', '星落', '苔衣', '霜牙', '紅土', '碧泉', '鷹嘯', '暮鼓'],
    place1: ['鹿', '石', '風', '河', '松', '雪', '火', '鷹', '月', '柳', '雲', '泉', '岩', '霧', '晨', '黑', '白', '青', '赤', '金', '銀', '翠', '雷', '星'],
    place2: ['鳴', '谷', '原', '灘', '岡', '坡', '林', '渡', '丘', '湖', '崖', '野', '嶺', '灣', '城', '莊', '堡', '寨', '港', '關'],
    colors: ['#e5484d', '#f5a524', '#a970ff', '#3ec1f3', '#f2e94e', '#f25fbf', '#2bd98b', '#ff8a3d'],
  };

  globalThis.DATA = {
    MAP_W, MAP_H, YEARS_PER_TICK, TERRAIN, ERAS, END_TECH, ANIMALS, TRAITS, FOUNDER_NAMES, FOUNDER_FACES,
    REROLLS_PER_CARD, PATHS, NODES, BELIEFS, MIRACLES, EVENTS, ODDITIES, CRISES, ENDINGS, DOOMS, NAMES,
  };
})();
