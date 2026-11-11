/* Chairlift Climb — a single-screen climbing platformer.
   Fixed 120 Hz simulation, delta-time rendering. Test hooks on window.__T. */
(function () {
  'use strict';
  const { W, H, STAGES } = window.CC_STAGES;
  const ART = window.CC_ART, A = window.CC_AUDIO, PAL = ART.PAL;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  let rng = Math.random;
  const rnd = (a, b) => a + rng() * (b - a);         // gameplay randomness (seedable: tests + Daily Climb)
  const cr = Math.random, crnd = (a, b) => a + cr() * (b - a); // cosmetic only: particles, blinks, shake
  function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- tuning (world units = 1/240 of the play width)
  const DT = 1 / 120;
  const GRAV = 600, JUMP_V = 182, RUN = 62, CLIMB = 48, AIR_ACC = 560, MAXFALL = 330;
  const JUMP_PTS = 200, TIME_PTS = 50, CLOSE_PTS = 150, TOK_VAL = [200, 400, 600], ALL_TOKS = 1000, GOLD_X = 2, GOLD_SPEED = 1.55;
  const EXTRA_LIVES = [10000, 30000, 60000, 100000, 150000, 225000, 300000];
  // the streak has to be fed: from stage 3 (and on every later lap) the multiplier drops a tier when you go too long without a jump, smash, close shave or maple
  const decayTime = (m) => Math.max(2.5, (G.loop > 0 ? 5 : 6.5) - ((m || streakMult()) - 2)); // x2 6.5 s ... x5 3.5 s (5 s ... 2.5 s on later laps)
  const decayOn = () => G.stageIdx >= 1 || G.loop > 0;
  // every lap past the first adds one rule (and the clock keeps tightening)
  const LAP_RULE = ['', 'MIRRORED · FASTER · GOLD BARRELS', 'DOUBLE THROWS: TWO TO JUMP AT ONCE', 'WIND GUSTS ON EVERY STAGE', 'BOUNCING BARRELS EVERYWHERE', 'SLICK ICE ON EVERY CATWALK', 'GOLD RUSH: HALF THE BARRELS ARE GOLD', 'TRIPLE THROWS: THREE TO JUMP IN A ROW'];
  const LAP_CHIP = ['', '◆ MIRROR', '◆ DOUBLES', '◆ WINDY', '◆ BOUNCY', '◆ SLICK', '◆ GOLD', '◆ TRIPLES'];
  const lapRule = (L) => LAP_RULE[L] || 'THE CLOCK TIGHTENS AGAIN';
  const lapChip = (L) => LAP_CHIP[L] || '◆ LAP ' + (L + 1);
  const streakMult = () => Math.min(5, 1 + Math.floor(Math.max(0, G.streak - 1) / 2)); // x1, x2 at a 3-streak, x3 at 5, x4 at 7, x5 at 9
  const CLOSE_GAP = 4; // units of daylight between boots and barrel hitbox that count as a near miss
  const COYOTE = 0.12, JBUF = 0.14, LADDER_SNAP = 8, SEAM = 3.6;
  const B_GRAV = 520, POLES_TIME = 7.5;

  // ---- save
  const SAVE_KEY = 'chairliftClimb.v1';
  let save = { best: 0, reached: 1, sound: true, music: true, tut: 0, bestStreak: 0, tix: [0, 0, 0, 0, 0, 0], dDay: '', dBest: 0, dPlays: 0, sLast: '', sN: 0, bt: {}, lap: [0, 0], laps: 0, dMed: 0, tipTok: 0, tipGold: 0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) save = Object.assign(save, s); } catch (e) {}
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  A.sound = save.sound; A.music = save.music;
  if (!Array.isArray(save.tix) || save.tix.length !== 6) save.tix = [0, 0, 0, 0, 0, 0];
  if (!save.bt || typeof save.bt !== 'object') save.bt = {};
  if (!Array.isArray(save.lap) || save.lap.length !== 2) save.lap = [0, 0];

  // ---- Daily Climb: one date-seeded run a day with a twist. Same twist and starting seed for everyone that day.
  const MODS = [
    { id: 'snow', name: 'Snowball Day', desc: 'The moose only rolls snowballs. They split!', snow: 0.8 },
    { id: 'ice', name: 'Black Ice', desc: 'Every catwalk is slick today', ice: true },
    { id: 'moon', name: 'Moon Boots', desc: 'Higher, floatier jumps', jump: 1.1, grav: 0.86 },
    { id: 'bouncy', name: 'Bouncy Barrels', desc: 'Lots of bouncers. Watch the markers', bouncer: 0.32 },
    { id: 'hurry', name: 'Moose in a Hurry', desc: 'Faster throws, more to jump', every: 0.8 },
    { id: 'poles', name: 'Ski Pole Day', desc: 'Ski poles last twice as long', poles: 2 },
    { id: 'gold', name: 'Gold Rush', desc: 'Fast gold barrels pay double', sprint: 0.4 }
  ];
  const NOMOD = { id: '', jump: 1, grav: 1 };
  function dayKey(off) { const d = new Date(Date.now() + (off || 0) * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function todayMod() { const k = dayKey(), seed = hashStr('cc-day-' + k); return Object.assign({}, NOMOD, MODS[hashStr('cc-mod-' + k) % MODS.length], { day: k, seed, mirror: seed % 2 === 1 }); }
  // Daily medals: bronze / silver / gold by score, kept for the day
  const DMEDALS = [5000, 12000, 22000, 40000], DMED_NAMES = ['', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'], DMED_ICON = ['', '🥉', '🥈', '🥇', '💎'];
  const medalOf = (sc) => DMEDALS.filter((v) => sc >= v).length;
  function dailyBest() { return save.dDay === dayKey() ? save.dBest : 0; }
  function streakNow() { return save.sLast === dayKey() || save.sLast === dayKey(-1) ? save.sN : 0; }
  // lift tickets: 4 per stage. bit 1 = reached the lodge, 2 = beat par time, 4 = no falls on the stage, 8 = all three maple tokens, 16 = reach the lodge with a x3+ streak still burning
  const PAR = 0.45; // fraction of the stage clock you must still have left
  const stageTime = (st) => st.time - Math.min(10, 2 * G.loop); // later laps run a tighter clock
  const parFor = (st) => Math.ceil(stageTime(st) * PAR);
  const tixCount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1);
  const TIX_MAX = 30, TIX_NAMES = ['LODGE', 'SPEEDY', 'NO FALL', 'MAPLES', 'HOT ×3'];
  const STAMP_AT = (k) => 0.5 + k * 0.27;
  const fmtT = (sec) => { const t = Math.round(sec * 10) / 10, m = Math.floor(t / 60); return m + ':' + (t - m * 60 < 9.95 ? '0' : '') + (t - m * 60).toFixed(1); };
  const btKey = (idx, mir) => idx + (mir ? 6 : 0);
  const totalTix = () => save.tix.reduce((a, m) => a + tixCount(m), 0);
  // outfits: every 3 lift tickets unlocks a new jacket + hat for the skier (equipped automatically when earned)
  const OUTFITS = [
    { name: 'Teal Classic', need: 0, c: { jacket: '#1fb5a8', jacketD: '#127a73', jacketL: '#6fe0d4', trim: '#ffd23f', hat: '#ffd23f', hatD: '#d9a514', pom: '#ffffff' } },
    { name: 'Sugarhouse Red', need: 3, c: { jacket: '#d8402c', jacketD: '#8e2216', jacketL: '#ff7a5c', trim: '#fff3c0', hat: '#f4f6ff', hatD: '#b9c0ea', pom: '#d8402c' } },
    { name: 'Lake Blue', need: 6, c: { jacket: '#2f7fd6', jacketD: '#1b4f8f', jacketL: '#7fb8ff', trim: '#ff8a2a', hat: '#ff8a2a', hatD: '#c45a12', pom: '#ffffff' } },
    { name: 'Night Patrol', need: 9, c: { jacket: '#34374f', jacketD: '#16172a', jacketL: '#5f6390', trim: '#ffe600', hat: '#ffe600', hatD: '#b8a400', pom: '#ff5a3a' } },
    { name: 'Maple Gold', need: 12, c: { jacket: '#e0a21f', jacketD: '#9a6a0c', jacketL: '#ffd36a', trim: '#7a2a00', hat: '#c43a1a', hatD: '#7e1e16', pom: '#ffd36a' } },
    { name: 'Aurora', need: 15, c: { jacket: '#7a4fd6', jacketD: '#4a2a90', jacketL: '#b49cff', trim: '#7dffb0', hat: '#7dffb0', hatD: '#3aa874', pom: '#ffffff' } },
    { name: 'Moose Vest', need: 18, c: { jacket: '#ff7a1a', jacketD: '#c9560a', jacketL: '#ffb26b', trim: '#fff07a', hat: '#6b4228', hatD: '#4a2c1a', pom: '#e2c48a' } },
    { name: 'Black Diamond', need: 30, c: { jacket: '#23232e', jacketD: '#0e0e16', jacketL: '#5a5a74', trim: '#ffffff', hat: '#23232e', hatD: '#0e0e16', pom: '#e8ecff' } }
  ];
  const unlockedOutfits = () => OUTFITS.filter((o) => totalTix() >= o.need).length;
  function wearOutfit(i) { save.outfit = clamp(i | 0, 0, unlockedOutfits() - 1); Object.assign(PAL, OUTFITS[save.outfit].c); }
  wearOutfit(save.outfit || 0);

  // ---- DOM
  const stage = $('stage'), canvas = $('c'), ctx = canvas.getContext('2d');
  const ctl = $('ctl'), padEl = $('pad'), jumpEl = $('jump');
  const arms = { l: padEl.querySelector('.l'), r: padEl.querySelector('.r'), u: padEl.querySelector('.u'), d: padEl.querySelector('.d') };

  // ---------------------------------------------------------------- state
  const G = {
    mode: 'title', stageIdx: 0, startStage: 0, loop: 0, score: 0, lives: 3, timeLeft: 0, timeMax: 0, lastSec: 0, t: 0, st: null,
    plats: [], ladders: [], movers: [], barrels: [], parts: [], pops: [], items: [], moose: null, p: null,
    shake: 0, hitStop: 0, modeT: 0, banner: 0, streak: 0, stats: null, extra: EXTRA_LIVES.slice(), mist: null, wind: null,
    god: false, noBarrels: false, toks: [], tokN: 0, boardB: false, lapT: 0, lapValid: false, runLoop: 0, pickLoop: 0, daily: null, mod: NOMOD, stageFalls: 0, tixNew: 0, tixGot: 0, testSeed: false, goalT: 0, flakes: null, smoke: [], dbg: { fallThrough: 0, maxBarrelAge: 0 }, hint: null, hintT: 0, demo: false, clearCount: 0, closedFlash: 0
  };
  function newStats() { return { jumped: 0, smashed: 0, bestStreak: 0, stages: 0, time: 0 }; }

  // ---------------------------------------------------------------- stage building
  function mkPlat(a) {
    const p = { x1: a[0], y1: a[1], x2: a[2], y2: a[3], f: a[4] || '' };
    p.ground = p.f.includes('g'); p.ice = p.f.includes('i'); p.deck = p.f.includes('d'); p.goal = p.f.includes('G');
    p.slope = (p.y2 - p.y1) / (p.x2 - p.x1);
    return p;
  }
  const surf = (p, x) => p.y1 + (x - p.x1) * p.slope;
  function platAt(x, y, tol, skip) {
    let best = null, bd = tol;
    for (const p of G.plats) {
      if (p === skip || x < p.x1 - 0.01 || x > p.x2 + 0.01) continue;
      const d = Math.abs(surf(p, x) - y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }
  function resolveLadder(l) {
    const x = l[0], a = Math.min(l[1], l[2]), b = Math.max(l[1], l[2]);
    const topP = platAt(x, a, 12), botP = platAt(x, b, 12);
    if (!topP || !botP) { console.warn('bad ladder', l); return null; }
    return { x, top: surf(topP, x), bot: surf(botP, x), topP, botP };
  }
  function buildStage(idx) {
    const base = STAGES[idx % STAGES.length];
    G.mirror = !!(G.forceMirror || G.loop % 2 === 1 || (G.daily && G.daily.mirror));
    const st = G.mirror ? mirrorStage(base) : base;
    G.st = st; G.stageIdx = idx;
    G.plats = st.plats.map(mkPlat);
    if (G.mod.ice || G.loop >= 5) for (const q of G.plats) if (!q.ground && !q.deck && !q.goal) q.ice = true;
    G.ladders = st.ladders.map(resolveLadder).filter(Boolean);
    G.goalP = G.plats.find((p) => p.goal);
    G.deckP = G.plats.find((p) => p.deck);
    G.boardB = G.daily ? ((G.daily.seed >>> 1) % 2 === 1) : (Math.floor(G.loop / 2) % 2 === 1);
    G.toks = ((G.boardB && st.toksB) || st.toks || []).map((q, i) => { const pl = platAt(q[0], q[1], 20); return { x: q[0], y: (pl ? surf(pl, q[0]) : q[1]) - q[2], lift: q[2], taken: false, ph: i * 1.7, val: TOK_VAL[i] || 300 }; });
    G.tokN = 0;
    G.items = (st.poles || []).map((q) => { const pl = platAt(q[0], q[1], 20); return { x: q[0], y: pl ? surf(pl, q[0]) : q[1], taken: false }; });
    G.movers = (st.movers || []).map((m) => Object.assign({}, m, { cars: [], s: 0, phase: 'dwell', timer: m.dwell || 0, side: 1, spawnT: 0 }));
    for (const m of G.movers) {
      if (m.type === 'chair') { m.x = m.x2; m.top = m.y; m.px = m.x; m.dx = 0; m.dy = 0; m.vx = 0; }
      if (m.type === 'gondola') {
        m.len = 0; m.segs = [];
        for (let i = 0; i < m.path.length - 1; i++) { const a = m.path[i], b = m.path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); m.segs.push({ a, b, L, s0: m.len }); m.len += L; }
        // pre-fill the line with cars so the stage starts alive
        for (let s = m.len - m.speed * 1.2; s > 0; s -= m.speed * m.every) addCar(m, s);
        m.spawnT = 0.6;
      }
    }
    G.bgDirty = true;
  }
  // every layout flipped left-to-right: a second set of six climbs (odd loops, odd-day dailies)
  function mirrorStage(st) {
    const M = (x) => W - x, flip = (f) => (f || '').replace(/[<>]/g, (c) => (c === '<' ? '>' : '<'));
    return Object.assign({}, st, {
      mirrored: true,
      start: { x: M(st.start.x) },
      plats: st.plats.map((q) => [M(q[2]), q[3], M(q[0]), q[1], flip(q[4])]),
      ladders: st.ladders.map((l) => [M(l[0]), l[1], l[2]]),
      moose: Object.assign({}, st.moose, { x: M(st.moose.x), dirs: st.moose.dirs.map((d) => -d), patrol: st.moose.patrol && [M(st.moose.patrol[1]), M(st.moose.patrol[0])] }),
      lodge: { x: M(st.lodge.x) - 36, door: M(st.lodge.door) },
      movers: st.movers && st.movers.map((m) => (m.type === 'chair' ? Object.assign({}, m, { x1: M(m.x2), x2: M(m.x1) }) : Object.assign({}, m, { path: m.path.map((q) => [M(q[0]), q[1]]) }))),
      mist: st.mist && st.mist.map((b) => Object.assign({}, b, { side: -b.side })),
      poles: st.poles && st.poles.map((q) => [M(q[0]), q[1]]),
      toks: st.toks && st.toks.map((q) => [M(q[0]), q[1], q[2]]),
      toksB: st.toksB && st.toksB.map((q) => [M(q[0]), q[1], q[2]]),
      guide: st.guide && st.guide.map(M)
    });
  }
  function gondolaPos(m, s) {
    for (const g of m.segs) if (s <= g.s0 + g.L) { const t = (s - g.s0) / g.L; return [lerp(g.a[0], g.b[0], t), lerp(g.a[1], g.b[1], t)]; }
    const l = m.path[m.path.length - 1]; return [l[0], l[1]];
  }
  function addCar(m, s) { const p = gondolaPos(m, s); m.cars.push({ s, x: p[0], top: p[1], dx: 0, dy: 0, vx: 0, hw: m.hw, sway: crnd(0, 6), id: Math.random() }); }

  function resetActors(fresh) {
    const st = G.st;
    G.barrels = []; G.parts = []; G.pops = [];
    // the first-ever climb gets 10 extra seconds while you learn
    if (fresh) G.timeMax = stageTime(st) + (save.tut < 1 && G.stageIdx === 0 && G.loop === 0 ? 10 : 0);
    G.timeLeft = G.timeMax; G.lastSec = Math.ceil(G.timeLeft);
    jumpPressed = false; G.streakT = decayTime();
    const fp = platAt(st.start.x, 318, 2) || G.plats[0];
    G.p = {
      x: st.start.x, y: surf(fp, st.start.x), vx: 0, vy: 0, face: st.start.x > 120 ? -1 : 1, ground: fp, mover: null, climb: null,
      coyote: 0, jbuf: 0, jumpId: 0, jumpCleared: 0, fromY: 0, carry: 0, sx: 1, sy: 1, anim: 0, stepT: 0, climbT: 0,
      minGap: 99, poles: 0, swing: 0, inv: 1.2, blinkT: 2, hurt: false, rot: 0, airT: 0, onIce: false
    };
    const mx = st.moose.x, dp = G.deckP;
    G.moose = { x: mx, y: dp ? surf(dp, mx) : 100, plat: dp, face: st.moose.dirs[0], state: 'idle', k: 0, t: 0, timer: G.stageIdx === 0 && G.loop === 0 && save.tut < 1 ? 1.8 : 0.5, throws: 0, blinkT: 3, patrolT: 2, target: mx, chargeT: 8, mode: 'idle' };
    for (const it of G.items) it.taken = false;
    if (!G.noBarrels && G.deckP) {
      // two barrels already rolling high up, so there's something coming at you in the first seconds
      const cands = G.plats.filter((q) => !q.deck && !q.goal && !q.ground && (q.x2 - q.x1) > 40 && Math.max(q.y1, q.y2) < 250);
      for (let i = 0; i < 2 && cands.length; i++) {
        const q = cands.splice((rng() * cands.length) | 0, 1)[0], x = rnd(q.x1 + 10, q.x2 - 10), d = diff();
        G.barrels.push({ type: 'barrel', x, y: surf(q, x), r: 6.1, dir: slopeDir(q, rng() < 0.5 ? -1 : 1), speed: d.speed * rnd(0.94, 1.06), state: 'roll', plat: q, rot: 0, age: 0, jumpedId: -1, lastLadder: null, fallFrom: 0, hops: 0 });
      }
    }
    G.mist = st.mist ? { t: 5, phase: 'idle', band: 0, a: 0, k: 0 } : null;
    G.wind = st.wind || G.loop >= 3 ? { t: 5, phase: 'idle', dir: 1, v: 0, k: 0 } : null;
    G.banner = 2.2; G.hint = null;
  }

  // ---------------------------------------------------------------- input
  const kb = { l: 0, r: 0, u: 0, d: 0 };
  const tp = { l: 0, r: 0, u: 0, d: 0, j: 0 };
  const bot = { on: false, l: 0, r: 0, u: 0, d: 0, j: 0 };
  let jumpPressed = false;
  const inp = () => (bot.on ? bot : { l: kb.l || tp.l, r: kb.r || tp.r, u: kb.u || tp.u, d: kb.d || tp.d });
  function pressJump() { jumpPressed = true; }

  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  window.addEventListener('keydown', (e) => {
    A.unlock();
    const k = KEYMAP[e.code];
    if (k) { kb[k] = 1; e.preventDefault(); return; }
    if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyK') {
      e.preventDefault(); if (e.repeat) return;
      if (G.mode === 'play' || G.mode === 'clear') pressJump();
      else if (G.mode === 'title') startGame(G.startStage, false, G.pickLoop);
      else if (G.mode === 'over' && G.modeT > 0.8) startGame(G.startStage, !!G.daily, G.runLoop);
      return;
    }
    if (e.code === 'Enter') { if (G.mode === 'title') startGame(G.startStage, false, G.pickLoop); else if (G.mode === 'over' && G.modeT > 0.8) startGame(G.startStage, !!G.daily, G.runLoop); else if (G.mode === 'paused') resumeGame(); }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'play') pauseGame(); else if (G.mode === 'paused') resumeGame(); }
    if (e.code === 'KeyM') { save.sound = A.sound = !A.sound; persist(); A.applyMusic(); syncToggles(); }
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) kb[k] = 0; });
  window.addEventListener('blur', clearInputs);
  function clearInputs() { kb.l = kb.r = kb.u = kb.d = 0; pointers.clear(); recomputeTouch(); }

  // Touch: the whole control strip is the zone. Left side = direction pad (slide-friendly), right side = jump.
  const pointers = new Map();
  let padC = { x: 0, y: 0, r: 70 }, splitX = 0;
  function padDir(px, py) {
    const dx = px - padC.x, dy = py - padC.y, d = Math.hypot(dx, dy);
    const o = { l: 0, r: 0, u: 0, d: 0 };
    if (d < padC.r * 0.16) return o;
    const cx = dx / d, cy = dy / d;
    if (Math.abs(cx) > 0.45) { if (cx < 0) o.l = 1; else o.r = 1; }
    if (Math.abs(cy) > 0.66) { if (cy < 0) o.u = 1; else o.d = 1; } // ~41°: rolling up from ▶ toward ▲ counts
    return o;
  }
  function recomputeTouch() {
    tp.l = tp.r = tp.u = tp.d = 0; let jumpHeld = false;
    for (const p of pointers.values()) {
      if (p.role === 'pad') { const o = padDir(p.x, p.y); tp.l |= o.l; tp.r |= o.r; tp.u |= o.u; tp.d |= o.d; }
      else jumpHeld = true;
    }
    tp.j = jumpHeld ? 1 : 0;
    for (const k in arms) arms[k].classList.toggle('on', !!tp[k]);
    jumpEl.classList.toggle('on', jumpHeld);
  }
  function localXY(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  ctl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); A.unlock();
    const q = localXY(e);
    const role = q.x < splitX ? 'pad' : 'jump';
    if (role === 'pad') for (const [id, p] of pointers) if (p.role === 'pad') pointers.delete(id); // newest pad finger wins
    pointers.set(e.pointerId, { role, x: q.x, y: q.y });
    try { ctl.setPointerCapture(e.pointerId); } catch (err) {}
    if (role === 'jump') { if (G.mode === 'play' || G.mode === 'clear') pressJump(); vibe(8); }
    recomputeTouch();
  });
  ctl.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    e.preventDefault(); const q = localXY(e); p.x = q.x; p.y = q.y; if (p.role === 'pad') recomputeTouch();
  });
  const endPtr = (e) => { if (pointers.delete(e.pointerId)) recomputeTouch(); };
  ctl.addEventListener('pointerup', endPtr); ctl.addEventListener('pointercancel', endPtr); ctl.addEventListener('lostpointercapture', endPtr);
  // safety net: when the OS reports no fingers at all, nothing can be held
  document.addEventListener('touchend', (e) => { if (e.touches.length === 0 && pointers.size) { pointers.clear(); recomputeTouch(); } }, { passive: true });
  document.addEventListener('touchcancel', () => { pointers.clear(); recomputeTouch(); }, { passive: true });
  ['contextmenu', 'selectstart', 'dblclick', 'gesturestart'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) { document.body.classList.add('touch'); layout(); } A.unlock(); }, true);

  let userActed = false;
  window.addEventListener('pointerdown', () => { userActed = true; }, true);
  window.addEventListener('keydown', () => { userActed = true; }, true);
  function vibe(ms) { if (!userActed || G.mode === 'title') return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ---------------------------------------------------------------- layout
  let cw = 390, ch = 844, dpr = 1, S = 1, OX = 0, OY = 0, camY = 0, hudY = 0, hudH = 40, insets = { t: 0, r: 0, b: 0, l: 0 }, lastW = 0, lastH = 0, portrait = true;
  let bgCanvas = null, structCanvas = null;
  function readInsets() { const cs = getComputedStyle($('probe')); insets = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; }
  function layout() {
    readInsets();
    cw = Math.max(300, window.innerWidth); ch = Math.max(300, window.innerHeight); lastW = window.innerWidth; lastH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const touch = document.body.classList.contains('touch');
    portrait = ch >= cw * 1.15;
    hudH = 40; hudY = insets.t + 4;
    const top = hudY + hudH;
    if (portrait) {
      const ctrlH = touch ? clamp(Math.round(ch * 0.25), 168, 236) : 0;
      const availH = ch - top - ctrlH - insets.b - 6, availW = cw - insets.l - insets.r;
      S = Math.min(availW / W, availH / H);
      OX = insets.l + (availW - W * S) / 2;
      OY = top + Math.max(0, (availH - H * S) / 2);
      if (touch) {
        const y0 = OY + H * S + 2, hgt = ch - y0;
        ctl.style.left = '0px'; ctl.style.top = y0 + 'px'; ctl.style.width = cw + 'px'; ctl.style.height = (hgt + 240) + 'px';
        const cy = (hgt - insets.b) / 2 + 2, R = clamp(Math.min(hgt - insets.b, cw * 0.46) * 0.46, 56, 82);
        placePad(insets.l + 16 + R, cy, R, 0, y0);
        const jr = clamp(R * 0.82, 46, 64);
        placeJump(cw - insets.r - 22 - jr, cy, jr);
        splitX = cw * 0.5;
      }
    } else {
      const side = touch ? clamp(Math.round(cw * 0.22), 150, 230) : 0;
      // the HUD lives over the side columns here, so the playfield can use the full height (its top is empty sky)
      const top2 = touch ? insets.t + 4 : top;
      const availW = cw - 2 * side - insets.l - insets.r, availH = ch - top2 - insets.b - 6;
      S = Math.min(availW / W, availH / H);
      OX = insets.l + side + (availW - W * S) / 2;
      OY = top2 + (availH - H * S) / 2;
      if (touch) {
        ctl.style.left = '0px'; ctl.style.top = top + 'px'; ctl.style.width = cw + 'px'; ctl.style.height = (ch - top) + 'px';
        const R = clamp(side * 0.4, 52, 76), cy = (ch - top) * 0.62;
        placePad(insets.l + 14 + R, cy, R, 0, top);
        const jr = clamp(R * 0.85, 44, 62);
        placeJump(cw - insets.r - 18 - jr, cy, jr);
        splitX = cw * 0.5;
      }
    }
    camY = G.mode === 'title' ? titleCam() : 0;
    const pb = $('pauseBtn'); pb.style.right = (insets.r + 8) + 'px'; pb.style.top = (hudY + 1) + 'px';
    G.bgDirty = true;
  }
  function placePad(cx, cy, R, ox, oy) {
    padC = { x: cx, y: cy + oy, r: R };
    padEl.style.left = (cx - R) + 'px'; padEl.style.top = (cy - R) + 'px'; padEl.style.width = 2 * R + 'px'; padEl.style.height = 2 * R + 'px';
    const aw = R * 0.74, ah = R * 0.66; // horizontal arms are larger: they're used most
    const set = (el, x, y, w, h) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; };
    set(arms.l, 0, R - ah / 2, aw, ah); set(arms.r, 2 * R - aw, R - ah / 2, aw, ah);
    const vw = R * 0.56, vh = R * 0.6;
    set(arms.u, R - vw / 2, 0, vw, vh); set(arms.d, R - vw / 2, 2 * R - vh, vw, vh);
    const hub = padEl.querySelector('.hub'); set(hub, R - R * 0.28, R - R * 0.28, R * 0.56, R * 0.56);
  }
  function placeJump(cx, cy, r) { jumpEl.style.left = (cx - r) + 'px'; jumpEl.style.top = (cy - r) + 'px'; jumpEl.style.width = jumpEl.style.height = 2 * r + 'px'; }
  function onResize() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const flip = (window.innerWidth > window.innerHeight) !== (lastW > lastH);
    if (coarse) { if (flip || Math.abs(window.innerWidth - lastW) > 8 || window.innerHeight < lastH - 8) { layout(); setTimeout(layout, 320); } } // never resize on growth (toolbar hiding), but never clip either
    else { clearTimeout(onResize.t); onResize.t = setTimeout(layout, 80); }
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(layout, 350));

  // ---------------------------------------------------------------- game flow
  function startGame(stageIdx, daily, loop) {
    A.unlock(); setTimeout(A.start, 60); A.musicFromTop && A.musicFromTop();
    G.daily = daily ? todayMod() : null; G.mod = G.daily || NOMOD; G.passedBest = false;
    if (G.daily) {
      rng = mulberry(G.daily.seed); stageIdx = 0;
      if (save.sLast !== G.daily.day) { save.sN = save.sLast === dayKey(-1) ? save.sN + 1 : 1; save.sLast = G.daily.day; }
      if (save.dDay !== G.daily.day) { save.dDay = G.daily.day; save.dBest = 0; save.dPlays = 0; save.dMed = 0; }
      save.dPlays++; persist();
    } else if (!G.testSeed) rng = Math.random;
    camY = 0; G.bgDirty = true; G.demo = false; G.score = 0; G.lives = 3; G.loop = daily ? 0 : (loop | 0); G.runLoop = G.loop; G.streak = 0; G.stats = newStats(); G.extra = EXTRA_LIVES.slice();
    G.startStage = stageIdx || 0;
    G.clearCount = 0; G.lapT = 0; G.lapValid = G.startStage === 0;
    enterStage(G.startStage, true);
    showScreen(null);
  }
  function enterStage(idx, fresh) {
    if (G.daily) rng = mulberry(G.daily.seed + idx * 7919 + G.loop * 104729);
    G.stageFalls = 0; G.goalT = 4;
    A.key = [1, 1, 1.1225, 1.1225, 1.3348, 1.4983][idx % 6] * (G.mirror ? 0.9439 : 1); // G G A A C D (a half-step down when mirrored)
    buildStage(idx);
    resetActors(true);
    G.mode = 'play'; G.modeT = 0;
    $('pauseBtn').hidden = false;
  }
  function showScreen(id) { for (const s of ['title', 'pause', 'over']) $(s).hidden = s !== id; document.body.classList.toggle('menu', id === 'title'); }
  function pauseGame() {
    if (G.mode !== 'play' || (window.__T && window.__T.noPause)) return;
    G.pausedFrom = G.mode; G.mode = 'paused'; showScreen('pause'); clearInputs(); A.setRumble(0); A.setWind(0); A.suspend(); syncToggles();
  }
  function resumeGame() { if (G.mode !== 'paused') return; A.resume(); A.unlock(); G.mode = 'play'; showScreen(null); clearInputs(); if (G.p) G.p.inv = Math.max(G.p.inv, 1.0); }
  function titleCam() { return ch > 560 ? Math.round(clamp(ch * 0.2, 90, 190)) : 0; }
  function toTitle() { camY = titleCam(); G.mode = 'title'; G.demo = true; buildStage(0); resetActors(true); G.p = null; $('pauseBtn').hidden = true; showScreen('title'); renderTitle(); A.setRumble(0); A.setWind(0); }
  function loseLife(reason) {
    G.lives--; G.streak = 0; G.stageFalls++;
    if (G.lives <= 0) return gameOver(reason);
    if (G.daily) rng = mulberry(G.daily.seed + G.stageIdx * 7919 + G.loop * 104729 + G.stageFalls * 131);
    resetActors(false); G.mode = 'play'; G.modeT = 0; G.banner = 0; G.goalT = 2;
  }
  function gameOver(reason) {
    G.mode = 'over'; G.modeT = 0; A.gameOver(); A.setRumble(0); A.setWind(0);
    let nb;
    if (G.daily) { nb = G.score > dailyBest(); if (nb) save.dBest = G.score; save.dDay = G.daily.day; save.dMed = Math.max(save.dMed || 0, medalOf(G.score)); }
    else { nb = G.score > save.best; if (nb) save.best = G.score; }
    save.bestStreak = Math.max(save.bestStreak || 0, G.stats.bestStreak); persist();
    $('ovHead').textContent = reason === 'closed' ? 'LIFT CLOSED' : 'WIPEOUT!';
    $('ovSub').textContent = (G.daily ? 'Daily Climb · ' + G.daily.name + ' · ' : 'Reached ') + stageLabel(G.stageIdx, G.loop) + (G.daily ? '' : ' · ' + STAGES[G.stageIdx].name);
    $('ovScore').textContent = G.score.toLocaleString();
    const bestNow = G.daily ? dailyBest() : save.best;
    const ob = $('ovBest'); ob.textContent = nb && G.score > 0 ? (G.daily ? "NEW BEST TODAY!" : 'NEW BEST!') : bestNow > 0 ? (G.daily ? "Today's best " : 'Best ') + bestNow.toLocaleString() : ''; ob.classList.toggle('yes', nb && G.score > 0);
    const gap = bestNow - G.score;
    G.medalNow = G.daily ? medalOf(G.score) : 0;
    const nextMed = G.daily && G.medalNow < DMEDALS.length ? ' · ' + DMED_NAMES[G.medalNow + 1] + ' at ' + DMEDALS[G.medalNow].toLocaleString() : '';
    $('ovExtra').textContent = (G.daily && G.medalNow > 0 ? DMED_ICON[G.medalNow] + ' ' + DMED_NAMES[G.medalNow] + ' MEDAL' + nextMed + '\n' : G.daily ? 'No medal yet · BRONZE at ' + DMEDALS[0].toLocaleString() + '\n' : '') + (!nb && gap > 0 && G.score > 0 ? gap.toLocaleString() + ' short of ' + (G.daily ? "today's best" : 'your best') + ' · one more climb?' : G.daily ? '🔥 ' + streakNow() + '-day streak · new twist tomorrow' : '🎟 ' + totalTix() + ' / ' + TIX_MAX + ' lift tickets');
    $('ovStats').innerHTML = '<div><b>' + G.stats.jumped + '</b><span>Jumped</span></div><div><b>' + (G.stats.toks || 0) + '</b><span>Maples</span></div><div><b>' + (G.stats.close || 0) + '</b><span>Close</span></div><div><b>x' + G.stats.bestStreak + '</b><span>Streak</span></div>';
    $('btnShare').hidden = !G.daily; $('btnShare').textContent = 'Copy result';
    G.shareText = G.daily ? 'Chairlift Climb · Daily ' + G.daily.day + ' · ' + G.daily.name + (G.medalNow ? ' ' + DMED_ICON[G.medalNow] : '') + '\n' + G.score.toLocaleString() + ' pts · ' + stageLabel(G.stageIdx, G.loop) + ' · best streak x' + G.stats.bestStreak + ' · ' + (G.stats.toks || 0) + ' maples · ' + (G.stats.close || 0) + ' close shaves' : '';
    { const by = G.stats.by || {}, names = [['barrels', 'barrels'], ['time', 'clock'], ['maples', 'maples'], ['close', 'close shaves'], ['poles', 'poles'], ['laps', 'laps']]; $('ovBreak').textContent = names.filter((q) => by[q[0]] > 0).map((q) => q[1] + ' ' + by[q[0]].toLocaleString()).join('  ·  '); }
    $('pauseBtn').hidden = true; G.overT = 0;
    if (nb && G.score > 0) { setTimeout(() => { A.oneUp(); vibe([10, 40, 10, 40, 30]); }, 520); }
    setTimeout(() => { if (G.mode === 'over') showScreen('over'); }, 420);
  }
  function stageLabel(idx, loop) { return (loop > 0 ? '◆ ' : '') + 'Stage ' + (loop * STAGES.length + idx + 1); }
  function stageClear() {
    G.clearDusk = duskLevel(); // read before switching mode: in 'clear' mode duskLevel() reads clearDusk itself
    G.newOutfit = null; G.mode = 'clear'; G.modeT = 0; G.clearMult = streakMult(); G.countLeft = Math.ceil(G.timeLeft) * TIME_PTS * G.clearMult; G.clearBonus = G.countLeft; G.stats.stages++;
    G.p.vx = 0; G.p.state = 'celebrate'; A.stageClear(); A.setRumble(0); A.setWind(0); vibe([20, 40, 20]);
    G.moose.state = 'sulk'; G.moose.mode = 'sulk';
    burst(G.p.x, G.p.y - 10, 26, ['#ffd23f', '#fff', '#ff7a1a', '#1fb5a8'], 90, 'conf');
    // convert barrels to snow puffs
    for (const b of G.barrels) burst(b.x, b.y - b.r, 6, ['#fff'], 40, 'snow');
    G.barrels = [];
    const nextAbs = G.loop * STAGES.length + G.stageIdx + 2;
    if (G.loop === 0) { save.reached = Math.max(save.reached, Math.min(STAGES.length, G.stageIdx + 2)); persist(); }
    if (save.tut < 1) { save.tut = 1; persist(); }
    // lift tickets (regular climbs only, so daily twists can't hand them out)
    const got = 1 | (G.timeLeft >= parFor(G.st) ? 2 : 0) | (G.stageFalls === 0 ? 4 : 0) | (G.tokN >= 3 ? 8 : 0) | (streakMult() >= 3 ? 16 : 0);
    // personal best time on this stage (a single attempt: dying restarts the clock)
    G.clearTime = G.timeMax - G.timeLeft; G.pbNew = false; G.pbOld = 0;
    G.lapMsg = null;
    if (!G.daily) {
      const k = btKey(G.stageIdx, G.mirror), old = save.bt[k] || 0; G.pbOld = old;
      if (!old || G.clearTime < old - 0.05) { save.bt[k] = Math.round(G.clearTime * 10) / 10; G.pbNew = !!old; }
    }
    // finishing stage 6 completes a lap: bonus, lap time, best-lap record
    if (G.stageIdx === STAGES.length - 1) {
      const bonus = 1000 * (G.loop + 1); G.lapBonus = bonus; addScore(bonus, 'laps');
      G.lapMsg = { time: G.lapT, bonus, rec: false, valid: G.lapValid && !G.daily, diamond: G.loop > 0, old: 0 };
      if (G.lapMsg.valid) { const kk = G.loop > 0 ? 1 : 0, o = save.lap[kk] || 0; G.lapMsg.old = o; if (!o || G.lapT < o) { save.lap[kk] = Math.round(G.lapT * 10) / 10; G.lapMsg.rec = !!o || true; } }
      if (!G.daily) save.laps = Math.max(save.laps || 0, G.loop + 1);
      persist();
    }
    G.tixGot = got; G.tixNew = 0;
    if (!G.daily) {
      const old = save.tix[G.stageIdx] || 0, before = unlockedOutfits(); G.tixNew = got & ~old; save.tix[G.stageIdx] = old | got;
      const after = unlockedOutfits();
      if (after > before) { wearOutfit(after - 1); G.newOutfit = OUTFITS[after - 1].name; G.newOutfitT = 2.6; burst(G.p.x, G.p.y - 14, 30, [PAL.jacket, PAL.jacketL, PAL.hat, '#fff'], 80, 'conf'); setTimeout(() => A.oneUp(), 1300); }
      persist();
    }
    G.clearCount++;
  }
  function nextStage() {
    let idx = G.stageIdx + 1;
    if (idx >= STAGES.length) {
      idx = 0; G.loop++; G.lapT = 0; G.lapValid = true;
      const msg = ['', '◆ LAP 2: MIRRORED & FASTER', '◆ LAP 3: DOUBLE THROWS', '◆ LAP 4: WIND EVERYWHERE', '◆ LAP 5: BOUNCING BARRELS', '◆ LAP 6: SLICK ICE', '◆ LAP 7: GOLD RUSH', '◆ LAP 8: TRIPLE THROWS'][G.loop] || '◆ LAP ' + (G.loop + 1) + ': CLOCK TIGHTENS';
      setTimeout(() => { if (G.mode === 'play') pop(120, 112, msg, '#ffd23f', 2.6, 0.9); }, 60);
    }
    enterStage(idx, true);
  }
  function feedStreak() { G.streakT = decayTime(); }
  function dropStreak() {
    const m = streakMult(); if (m < 2) return;
    G.streak = 2 * m - 3; G.streakT = decayTime(); G.streakPulse = 0.6; A.streakDrop();
    if (G.p) pop(G.p.x, G.p.y - 34, 'STREAK FADING ×' + (m - 1), '#ff9a8a', 1.1, 0.95);
  }
  function addScore(n, cat) {
    if (cat && G.stats) { const by = G.stats.by || (G.stats.by = {}); by[cat] = (by[cat] || 0) + n; }
    const bestBefore = G.daily ? dailyBest() : save.best;
    G.score += n;
    if (!G.passedBest && bestBefore > 0 && G.score > bestBefore && G.p) {
      G.passedBest = true; A.oneUp(); vibe([10, 40, 10, 40, 20]);
      pop(120, 64, G.daily ? "NEW BEST TODAY!" : 'NEW BEST!', '#ffd23f', 1.8, 1.7); burst(120, 70, 30, ['#ffd23f', '#fff', '#ff7a5a', '#7dffb0'], 90, 'conf');
    }
    if (G.extra.length && G.score >= G.extra[0]) { G.extra.shift(); G.lives = Math.min(6, G.lives + 1); A.oneUp(); pop(G.p.x, G.p.y - 30, '1UP!', '#7dffb0', 1.3); }
  }

  // difficulty for the current stage
  function diff() {
    const st = G.st, L = G.loop;
    return {
      every: st.throwEvery * Math.pow(0.86, L), speed: st.speed * (1 + 0.12 * Math.min(L, 3)), snow: st.snowball,
      bouncer: G.stageIdx >= 3 || L > 0 ? Math.max(st.bouncer, L > 0 ? 0.12 : 0, L >= 4 ? 0.3 : 0) : st.bouncer, lob: L > 0 ? Math.max(st.lob, 0.15) : st.lob,
      sprint: L >= 6 ? 0.5 : Math.min(0.4, Math.max(st.sprint || 0, G.mod.sprint || 0) + (L > 0 ? 0.1 + 0.04 * (L - 1) : 0))
    };
  }

  // ---------------------------------------------------------------- particles + popups
  function burst(x, y, n, cols, sp, kind) {
    for (let i = 0; i < n; i++) {
      const a = crnd(0, TAU), v = crnd(0.3, 1) * (sp || 50);
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'conf' ? 60 : 20), life: crnd(0.4, 0.9) * (kind === 'conf' ? 1.8 : 1), t: 0, c: cols[(Math.random() * cols.length) | 0], k: kind || 'snow', r: kind === 'chip' ? crnd(1, 2.2) : crnd(0.6, 1.6), rot: crnd(0, 6), vr: crnd(-12, 12), g: kind === 'mist' ? -10 : kind === 'steam' ? -30 : 220 });
    }
  }
  function spray(x, y, dir, n) { for (let i = 0; i < n; i++) G.parts.push({ x, y, vx: -dir * crnd(10, 45) + crnd(-10, 10), vy: crnd(-45, -10), life: crnd(0.25, 0.5), t: 0, c: '#fff', k: 'snow', r: crnd(0.5, 1.3), g: 200 }); }
  function pop(x, y, text, col, life, big) { G.pops.push({ x, y, text, col: col || '#fff', life: life || 0.9, t: 0, big: big || 1 }); }

  // ---------------------------------------------------------------- moose
  function spawnBarrel(m, dir, kind, lob) {
    const d = diff();
    const plat = m.plat;
    const sx = clamp(m.x + dir * 14, plat.x1 + 1, plat.x2 - 1);
    const gold = kind === 'sprint'; if (gold) kind = 'barrel';
    const b = { type: kind, gold, x: sx, y: surf(plat, sx), r: kind === 'snow' ? 5.8 : 6.1, dir, speed: d.speed * (kind === 'snow' ? 1.08 : gold ? Math.min(GOLD_SPEED, 84 / d.speed) : 1) * rnd(0.94, 1.06), state: 'roll', plat, rot: 0, age: 0, jumpedId: -1, lastLadder: null, fallFrom: 0, hops: 0 };
    if (kind === 'bouncer') { b.state = 'bounce'; b.vx = dir * d.speed * 0.8; b.vy = -120; b.y -= 1; b.glow = 0.01; }
    if (lob) {
      // lob into the middle of a random lower platform; the landing spot is marked
      const cands = G.plats.filter((p) => !p.deck && !p.goal && !p.ground && p !== plat && (p.x2 - p.x1) > 40 && surf(p, (p.x1 + p.x2) / 2) > b.y + 30);
      if (cands.length) {
        const mine = G.p && G.p.ground && cands.includes(G.p.ground) && rng() < 0.6 ? G.p.ground : null, tp2 = mine || cands[(rng() * cands.length) | 0];
        let tx = rnd(tp2.x1 + 14, tp2.x2 - 14); if (mine && Math.abs(tx - G.p.x) < 34) tx = clamp(G.p.x + (tx < G.p.x ? -1 : 1) * rnd(34, 60), tp2.x1 + 10, tp2.x2 - 10); if (mine && Math.abs(tx - G.p.x) < 30) tx = clamp(G.p.x + (G.p.x < (tp2.x1 + tp2.x2) / 2 ? 1 : -1) * 40, tp2.x1 + 10, tp2.x2 - 10);
        // on a catwalk that drains one way, land the barrel uphill of you so it rolls into you head-on (marked, whistled, jumpable)
        if (mine) { const sd = slopeDir(mine, 0); if (sd) { const want = G.p.x - sd * rnd(36, 64); if (want > mine.x1 + 10 && want < mine.x2 - 10) tx = want; } }
        const ty = surf(tp2, tx), T = 1.05;
        b.state = 'fall'; b.vx = (tx - b.x) / T; b.vy = (ty - b.y - 0.5 * B_GRAV * T * T) / T; b.y -= 4; b.fallFrom = b.y; b.lob = true; b.dir = Math.sign(b.vx) || dir;
        predictMark(b);
      }
    }
    G.barrels.push(b);
    return b;
  }
  function predictMark(b) {
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy; const h = 1 / 60;
    for (let i = 0; i < 240; i++) {
      const py = y; vy += B_GRAV * h; x += vx * h; y += vy * h;
      if (vy > 0) { const p = landPlat(x, py, y, null); if (p) { b.mark = { x, y: surf(p, x) }; return; } }
      if (y > H + 10) break;
    }
    b.mark = null;
  }
  function updateMoose(dt) {
    const m = G.moose, st = G.st; if (!m) return;
    m.t += dt; m.k += dt;
    m.blinkT -= dt; if (m.blinkT < 0) { m.blink = m.blinkT > -0.12; if (m.blinkT < -0.12) m.blinkT = crnd(2, 4.5); }
    if (m.mode === 'sulk' || m.mode === 'laugh') { m.state = m.mode; return; }
    const d = diff();
    // patrol (summit): walk inside the patrol window, sometimes charge left
    if (st.moose.patrol && m.mode === 'idle') {
      m.chargeT -= dt;
      if (st.moose.charge && m.chargeT <= 0 && G.mode === 'play') { m.mode = 'paw'; m.state = 'paw'; m.k = 0; A.stomp(); }
      else if (Math.abs(m.target - m.x) > 1) { m.x = approach(m.x, m.target, 20 * dt); m.walking = true; }
      else { m.walking = false; m.patrolT -= dt; if (m.patrolT <= 0) { m.target = rnd(st.moose.patrol[0], st.moose.patrol[1]); m.patrolT = rnd(1, 2.5); } }
      m.y = surf(m.plat, m.x);
    }
    if (m.mode === 'paw') {
      if (cr() < dt * 12) burst(m.x - 18, m.y - 26, 1, ['rgba(255,255,255,.8)'], 12, 'steam');
      if (m.k > 1.1) { m.mode = 'charge'; m.state = 'charge'; m.k = 0; A.moose(false); }
      return;
    }
    if (m.mode === 'charge') {
      const cx = st.moose.charge;
      if (!m.back) { m.x -= 95 * dt; if (m.x <= cx) { m.x = cx; m.back = true; G.shake = Math.max(G.shake, 2.5); A.stomp(); spray(m.x - 16, m.y, 1, 10); } }
      else { m.x += 34 * dt; m.state = 'idle'; if (m.x >= st.moose.patrol[0] + 8) { m.back = false; m.mode = 'idle'; m.chargeT = rnd(8, 12); m.target = rnd(st.moose.patrol[0] + 10, st.moose.patrol[1]); } }
      m.y = surf(m.plat, m.x);
      return;
    }
    if (G.mode !== 'play' && !G.demo) { m.state = 'idle'; return; }
    if (G.noBarrels) { m.state = 'idle'; return; }
    if (m.mode === 'idle') {
      m.state = 'idle'; m.timer -= dt;
      if (m.timer <= 0 && m.pair) { m.pair = false; m.secondThrow = true; m.mode = 'windup'; m.k = 0; m.kind = 'barrel'; m.lob = false; }
      else if (m.timer <= 0) {
        m.throws++;
        m.dir = st.moose.dirs[(rng() * st.moose.dirs.length) | 0];
        if (st.moose.dirs.length > 1 && G.p && (G.stageIdx + G.loop > 0 || m.throws > 2) && rng() < 0.7) m.dir = G.p.x < m.x ? -1 : 1; // lean toward the player's side (stage 1: after two warm-up throws)
        m.face = m.dir;
        const r = rng();
        m.kind = r < d.bouncer ? 'bouncer' : r < d.bouncer + d.sprint ? 'sprint' : r < d.bouncer + d.sprint + d.snow ? 'snow' : 'barrel';
        m.lob = m.kind !== 'bouncer' && m.kind !== 'sprint' && rng() < d.lob;
        m.mode = m.throws % 4 === 0 && !st.moose.patrol ? 'stomp' : 'windup'; m.k = 0;
        if (m.mode === 'stomp') { m.state = 'stomp'; }
        if (m.kind === 'bouncer' || m.lob) A.whistle();
        if (m.kind === 'sprint') { A.zip(); if (!save.tipGold && G.p) { save.tipGold = 1; persist(); pop(120, 126, 'GOLD BARREL = FAST. PAYS DOUBLE!', '#ffd23f', 2.2, 1.0); } }
      }
    } else if (m.mode === 'stomp') {
      m.state = 'stomp';
      if (m.k > 0.25 && !m.stomped) { m.stomped = true; G.shake = Math.max(G.shake, 1.8); A.stomp(); spray(m.x + m.face * 10, m.y, -m.face, 8); spray(m.x + m.face * 10, m.y, m.face, 8); vibe(10); }
      if (m.k > 0.55) { m.stomped = false; m.mode = 'windup'; m.k = 0; }
    } else if (m.mode === 'windup') {
      m.state = 'windup';
      const wl = m.kind === 'bouncer' || m.lob ? 0.85 : m.kind === 'sprint' ? 0.8 : m.secondThrow ? 0.42 : 0.45;
      if (m.k >= wl) {
        m.mode = 'shove'; m.k = 0; m.state = 'shove';
        spawnBarrel(m, m.dir, m.kind, m.lob);
        if (cr() < 0.4) A.moose(true); else A.thump(0.6);
      }
    } else if (m.mode === 'shove') {
      m.state = 'shove';
      if (m.k > 0.35) {
        m.mode = 'idle'; m.secondThrow = false;
        if (m.pairLeft > 0) { m.pairLeft--; m.pair = true; m.timer = 0.1; } // lap 8+: sometimes a third
        else if (!m.inPair && G.loop >= 2 && (m.kind === 'barrel' || m.kind === 'sprint') && !st.moose.patrol && rng() < Math.min(0.4, 0.18 + 0.07 * (G.loop - 2))) { m.inPair = true; m.pairLeft = G.loop >= 7 && rng() < 0.5 ? 1 : 0; m.pair = true; m.timer = 0.1; } // a pair, spaced for a double jump
        else { m.inPair = false; m.timer = d.every * rnd(0.75, 1.25) * (G.p && G.p.y - m.y < 70 && G.p.y > m.y ? 0.72 : 1); }
      } // the moose throws faster once you're close to its deck
    }
  }

  // ---------------------------------------------------------------- movers
  function updateMovers(dt) {
    for (const m of G.movers) {
      if (m.type === 'chair') {
        const px = m.x;
        if (m.phase === 'dwell') { m.timer -= dt; if (m.timer <= 0) { m.phase = 'move'; m.s = 0; m.from = m.x; m.to = m.x === m.x2 ? m.x1 : m.x2; if (nearPlayer(m.x, m.top, 80)) A.clack(); } }
        else {
          const dist = Math.abs(m.to - m.from), dur = dist / m.speed;
          m.s = Math.min(1, m.s + dt / dur);
          const e = m.s < 0.5 ? 2 * m.s * m.s : 1 - Math.pow(-2 * m.s + 2, 2) / 2;
          m.x = lerp(m.from, m.to, e);
          if (m.s >= 1) { m.x = m.to; m.phase = 'dwell'; m.timer = m.dwell; if (nearPlayer(m.x, m.top, 80)) A.clack(); }
        }
        m.dx = m.x - px; m.dy = 0; m.vx = m.dx / dt;
      } else if (m.type === 'gondola') {
        m.spawnT -= dt;
        if (m.spawnT <= 0) { m.spawnT += m.every; addCar(m, 0); }
        for (const c of m.cars) {
          const ox = c.x, oy = c.top;
          c.s += m.speed * dt; const p = gondolaPos(m, c.s); c.x = p[0]; c.top = p[1];
          c.dx = c.x - ox; c.dy = c.top - oy; c.vx = c.dx / dt;
          if (c.s >= m.len) c.dead = true;
        }
        for (const c of m.cars) if (c.dead && G.p && G.p.mover === c) detachMover();
        m.cars = m.cars.filter((c) => !c.dead);
      }
    }
  }
  function nearPlayer(x, y, r) { return G.p && Math.hypot(G.p.x - x, G.p.y - y) < r; }
  function allMovers() { const out = []; for (const m of G.movers) { if (m.type === 'chair') out.push(m); else for (const c of m.cars) out.push(c); } return out; }
  function moverAt(x, y, tol) { for (const m of allMovers()) if (x >= m.x - m.hw && x <= m.x + m.hw && Math.abs(m.top - y) <= tol) return m; return null; }
  function detachMover() {
    const p = G.p; if (!p || !p.mover) return;
    const pl = platAt(p.x, p.y, 5);
    p.mover = null;
    if (pl) { p.ground = pl; p.y = surf(pl, p.x); } else { p.ground = null; p.coyote = COYOTE; p.fromY = p.y; }
  }

  // ---------------------------------------------------------------- player
  function landPlat(x, py, y, skip) {
    let best = null, by = Infinity;
    for (const p of G.plats) {
      if (p === skip || x < p.x1 - 0.01 || x > p.x2 + 0.01) continue;
      const s = surf(p, x);
      if (py <= s + 0.8 && y >= s && s < by) { by = s; best = p; }
    }
    return best;
  }
  function updatePlayer(dt) {
    const p = G.p, I = inp();
    p.anim += dt; p.inv = Math.max(0, p.inv - dt);
    p.blinkT -= dt; if (p.blinkT < 0) { p.blink = p.blinkT > -0.1; if (p.blinkT < -0.1) p.blinkT = crnd(2, 5); }
    p.sx = lerp(p.sx, 1, 1 - Math.exp(-14 * dt)); p.sy = lerp(p.sy, 1, 1 - Math.exp(-14 * dt));
    if (p.poles > 0) { p.poles -= dt; p.swing = Math.sin(p.anim * 16) * 1.2; if (Math.sin(p.anim * 16) > 0.97 && Math.sin((p.anim - dt) * 16) <= 0.97) A.swish(); if (p.poles <= 0) { p.poles = 0; pop(p.x, p.y - 24, 'poles away', '#ffd0dc', 0.8); } }
    if (jumpPressed) { p.jbuf = JBUF; jumpPressed = false; }
    else p.jbuf = Math.max(0, p.jbuf - dt);
    const wind = G.wind && G.wind.v ? G.wind.v : 0;

    // ---- on a ladder
    if (p.climb) {
      const L = p.climb;
      p.x = lerp(p.x, L.x, 1 - Math.exp(-25 * dt));
      let dir = (I.d ? 1 : 0) - (I.u ? 1 : 0);
      // duck: a barrel rolling across the ladder top makes you tuck your head under the catwalk
      p.duck = false;
      const duckY = Math.min(L.top + 27, L.bot - 2); // deep enough that the hat is under the planks
      if (p.y < duckY + 1) for (const b of G.barrels) {
        // looks ~0.3 s ahead, so you never pop out right in front of one
        if (b.state === 'roll' && b.plat === L.topP && Math.abs(b.x - L.x) < 12 + b.speed * 0.3 && (b.x - L.x) * b.dir < 3) { p.duck = true; break; }
      }
      if (p.duck && !p.wasDuck) pop(L.x, L.top - 3, 'DUCK!', '#bfe9ff', 0.7, 0.75);
      p.wasDuck = p.duck;
      if (p.duck) { if (dir < 0) dir = 0; p.y = approach(p.y, Math.max(p.y, duckY), 170 * dt); }
      if (dir) {
        p.y += dir * CLIMB * dt; p.climbT += dt;
        if (Math.floor(p.climbT * 7) !== Math.floor((p.climbT - dt) * 7)) A.climb(Math.floor(p.climbT * 7) & 1);
      }
      p.state = 'climb';
      if (p.jbuf > 0 && L.bot - p.y > 4) {
        // hop off sideways
        const side = (I.r ? 1 : 0) - (I.l ? 1 : 0) || p.face || 1;
        p.climb = null; p.jbuf = 0; p.vx = side * RUN * 0.8; p.vy = -110; p.face = side; p.fromY = p.y; p.jumpId++; p.jumpCleared = 0; p.jumpT = 1; p.airT = 0;
        A.jump(); return;
      }
      if (p.y <= L.top) { p.y = L.top; p.climb = null; p.ground = L.topP; p.x = L.x; p.sy = 0.85; p.sx = 1.1; spray(p.x, p.y, 0, 3); }
      else if (p.y >= L.bot) { p.y = L.bot; p.climb = null; p.ground = L.botP; p.x = L.x; }
      else if ((I.l || I.r) && !dir && !p.duck) { // never step out in front of a barrel you're ducking
        // step off at either end if close enough
        if (p.y - L.top < 7) { p.y = L.top; p.x = L.x; p.climb = null; p.ground = L.topP; }
        else if (L.bot - p.y < 7) { p.y = L.bot; p.x = L.x; p.climb = null; p.ground = L.botP; }
      }
      p.vx = 0; p.vy = 0; p.anim = p.climbT;
      return;
    }

    // ---- grab a ladder
    if (I.u || I.d) {
      const canClimb = p.poles <= 0;
      let grabbed = false;
      for (const L of G.ladders) {
        if (Math.abs(L.x - p.x) > LADDER_SNAP) continue;
        if (I.u && p.y > L.top + 1.5 && p.y <= L.bot + 3 && (p.ground || p.mover || p.vy > -60)) {
          if (!canClimb) { noClimbHint(); break; }
          p.climb = L; p.ground = null; p.mover = null; p.y = Math.min(p.y, L.bot); grabbed = true; break;
        }
        if (I.d && !I.u && (p.ground || p.mover) && Math.abs(p.y - L.top) < 3) {
          if (!canClimb) { noClimbHint(); break; }
          p.climb = L; p.ground = null; p.mover = null; p.y = L.top + 1; grabbed = true; break;
        }
      }
      if (grabbed) { p.vx = 0; p.vy = 0; p.climbT = 0; p.jumpT = 0; p.state = 'climb'; return; }
    }

    // ---- horizontal
    const want = (I.r ? 1 : 0) - (I.l ? 1 : 0);
    const onIce = !!(p.ground && p.ground.ice);
    p.onIce = onIce;
    if (p.ground || p.mover) {
      if (onIce) {
        if (want) p.vx += want * 190 * dt; else p.vx = approach(p.vx, 0, 48 * dt);
        p.vx = clamp(p.vx, -80, 80);
        if (Math.abs(p.vx) > 30 && cr() < dt * 30) spray(p.x, p.y, Math.sign(p.vx), 1);
      } else p.vx = approach(p.vx, want * RUN, 1500 * dt);
    } else {
      p.vx = approach(p.vx, want * RUN, (want ? AIR_ACC : 90) * dt);
      if (want === 0 && Math.abs(p.vx) > RUN) p.vx = approach(p.vx, Math.sign(p.vx) * RUN, 200 * dt);
    }
    if (want) p.face = want;

    // ---- jump
    if (p.jbuf > 0 && (p.ground || p.mover || p.coyote > 0)) {
      p.carry = p.mover ? p.mover.vx || 0 : 0;
      p.vy = -JUMP_V * (G.mod.jump || 1); p.fromY = p.y; p.ground = null; p.mover = null; p.coyote = 0; p.jbuf = 0;
      p.jumpId++; p.jumpCleared = 0; p.minGap = 99; p.sx = 0.8; p.sy = 1.25; p.airT = 0; p.jumpT = 1;
      A.jump(); spray(p.x, p.y, p.face, 5);
    }

    // ---- integrate
    // wind shoves harder in the air than on your feet; standing still you only creep
    const dx = (p.vx + wind * (p.ground || p.mover ? (want ? 0.45 : 0.25) : 0.8)) * dt;
    if (p.mover) {
      const m = p.mover;
      p.x += m.dx + dx; p.y = m.top;
      if (p.x < m.x - m.hw || p.x > m.x + m.hw) {
        const pl = platAt(p.x, p.y, SEAM);
        if (pl) { p.mover = null; p.ground = pl; p.y = surf(pl, p.x); }
        else { p.mover = null; p.coyote = COYOTE; p.fromY = p.y; p.carry = m.vx || 0; p.vy = 0; }
      }
    } else if (p.ground) {
      const g = p.ground;
      p.x += dx;
      if (p.x >= g.x1 && p.x <= g.x2) p.y = surf(g, p.x);
      else {
        const pl = platAt(p.x, p.y, SEAM, g);
        if (pl) { p.ground = pl; p.y = surf(pl, p.x); }
        else {
          const mv = moverAt(p.x, p.y, SEAM);
          if (mv) { p.ground = null; p.mover = mv; p.y = mv.top; }
          else { p.ground = null; p.coyote = COYOTE; p.fromY = p.y; p.vy = 0; p.carry = 0; }
        }
      }
      // step onto a mover that is level with us (gondola boarding)
      if (p.ground && p.ground.ground) { const mv = moverAt(p.x, p.y, 1.6); if (mv) { p.mover = mv; p.ground = null; p.y = mv.top; } }
    } else {
      p.airT += dt;
      if (cr() < dt * 26) G.parts.push({ x: p.x - p.face * 2 + crnd(-1, 1), y: p.y - crnd(0, 2), vx: -p.vx * 0.15, vy: crnd(-4, 4), life: crnd(0.25, 0.4), t: 0, c: 'rgba(255,255,255,.9)', k: 'snow', r: crnd(0.5, 1.1), g: 20 });
      p.coyote = Math.max(0, p.coyote - dt);
      // floaty apex: gravity eases off near the top of the arc (more time over the barrel)
      p.vy = Math.min(MAXFALL, p.vy + GRAV * (G.mod.grav || 1) * (Math.abs(p.vy) < 55 && p.jumpT > 0 ? 0.5 : 1) * dt);
      const py = p.y;
      p.x += dx + p.carry * dt; p.y += p.vy * dt;
      if (p.vy > 0) {
        let landed = landPlat(p.x, py, p.y, null), mv = null;
        for (const m of allMovers()) {
          if (p.x < m.x - m.hw - 1 || p.x > m.x + m.hw + 1) continue;
          const mprev = m.top - (m.dy || 0);
          if (py <= mprev + 1 && p.y >= m.top && (!landed || m.top < surf(landed, p.x))) { mv = m; }
        }
        if (mv) { p.mover = mv; p.y = mv.top; onLand(p); }
        else if (landed) { p.ground = landed; p.y = surf(landed, p.x); onLand(p); }
      }
    }
    if (p.x < 5) { p.x = 5; if (p.vx < 0) p.vx = 0; }
    if (p.x > W - 5) { p.x = W - 5; if (p.vx > 0) p.vx = 0; }
    if (p.ground && p.x >= p.ground.x1 && p.x <= p.ground.x2) p.y = surf(p.ground, p.x);
    if (p.y > 318.5) { G.dbg.fallThrough++; p.y = 318; p.ground = G.plats[0]; p.vy = 0; }

    // ---- state + footsteps
    if (p.ground || p.mover) {
      const moving = Math.abs(p.vx) > 8;
      p.state = moving ? 'run' : 'stand';
      if (moving && !onIce) { p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; A.step(cr() < 0.5); if (cr() < 0.6) spray(p.x - p.face * 2, p.y, p.face, 1); } }
    } else p.state = 'jump';

    // ---- items
    for (const it of G.items) {
      if (!it.taken && Math.abs(it.x - p.x) < 9 && Math.abs(it.y - 6 - (p.y - 8)) < 14) {
        it.taken = true; p.poles = POLES_TIME * (G.mod.poles || 1); A.poles(); pop(p.x, p.y - 26, 'SKI POLES!', '#ff9ab5', 1.1, 1.2); burst(it.x, it.y - 8, 14, ['#ffd23f', '#fff', '#ff6b8a'], 60, 'spark'); vibe(15);
      }
    }
    // ---- maple tokens: jump for the high ones, take the detour for the far ones, and the danger ones sit where the barrels land
    for (const tk of G.toks) {
      if (!tk.taken && Math.abs(tk.x - p.x) < 9 && Math.abs(tk.y - (p.y - 8)) < 12) {
        tk.taken = true; G.tokN++; G.stats.toks = (G.stats.toks || 0) + 1; feedStreak();
        const mult = streakMult(), pts = tk.val * mult;
        addScore(pts, 'maples'); A.token(G.tokN); vibe(8);
        pop(tk.x, tk.y - 10, '+' + pts, '#ffd23f', 1.0, 1.15);
        burst(tk.x, tk.y, 12, ['#ffd23f', '#ff9a3a', '#fff'], 55, 'spark');
        if (G.tokN === 3) { addScore(ALL_TOKS, 'maples'); pop(p.x, p.y - 40, 'ALL 3 MAPLES! +' + ALL_TOKS.toLocaleString(), '#ffb347', 1.4, 1.2); G.hitStop = Math.max(G.hitStop, 0.04); burst(p.x, p.y - 12, 18, ['#ffd23f', '#ff9a3a', '#fff'], 80, 'conf'); }
      }
    }
    // ---- goal
    const gp = G.goalP;
    if ((p.ground === gp) && Math.abs(p.x - G.st.lodge.door) < 10 && G.mode === 'play') stageClear();
  }
  function onLand(p) {
    const fall = p.airT;
    p.vy = 0; p.carry = 0; p.coyote = 0; p.jumpT = 0;
    const s = clamp(fall * 1.4, 0.15, 0.6);
    p.sy = 1 - s * 0.55; p.sx = 1 + s * 0.45;
    A.land(0.5 + s); spray(p.x, p.y, 1, 3 + (s * 8) | 0); spray(p.x, p.y, -1, 3 + (s * 8) | 0);
    if (s > 0.3) G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.32, t: 0, c: '#fff', k: 'ring', r: 3, g: 0 });
    // a close shave (boots skimmed the barrel) pays extra once you land safely: late, brave jumps are worth it
    if (p.jumpCleared > 0 && p.minGap < CLOSE_GAP && G.mode === 'play') {
      feedStreak(); addScore(CLOSE_PTS * streakMult(), 'close'); G.stats.close = (G.stats.close || 0) + 1; A.clear(p.jumpCleared + 2, G.streak); vibe([6, 30, 10]);
      pop(p.x, p.y - 30, 'CLOSE! +' + CLOSE_PTS * streakMult(), '#8fe3ff', 0.9, 1.05); burst(p.x, p.y - 2, 10, ['#8fe3ff', '#fff'], 60, 'spark');
    }
    p.minGap = 99; p.jumpCleared = 0;
  }
  let noClimbT = 0;
  function noClimbHint() { if (G.t - noClimbT > 1.6) { noClimbT = G.t; pop(G.p.x, G.p.y - 26, "can't climb with poles", '#ffd0dc', 1.0, 0.8); } }

  function hurtPlayer(reason) {
    const p = G.p;
    if (G.god || G.mode !== 'play') return;
    G.mode = 'dying'; G.modeT = 0; G.reason = reason;
    p.hurt = true; p.climb = null; p.ground = null; p.mover = null; p.state = 'tumble';
    p.vy = -150; p.vx = -p.face * 34; p.rot = 0;
    G.hitStop = 0.14; G.shake = 4; A.hit(); vibe([30, 30, 60]);
    burst(p.x, p.y - 10, 10, ['#ffd23f', '#fff'], 70, 'star');
    G.moose.mode = 'laugh'; setTimeout(() => A.laugh(), 350);
    A.setRumble(0); A.setWind(0);
    if (reason === 'closed') pop(120, 150, 'LIFT CLOSED!', '#ff8a6a', 1.8, 1.6);
  }
  function updateDying(dt) {
    const p = G.p;
    p.anim += dt; p.rot += dt * 14 * (p.vx < 0 ? -1 : 1);
    if (G.modeT < 1.25) {
      const py = p.y; p.vy = Math.min(MAXFALL, p.vy + GRAV * dt); p.y += p.vy * dt; p.x = clamp(p.x + p.vx * dt, 5, W - 5);
      if (p.vy > 0) { const pl = landPlat(p.x, py, p.y, null); if (pl && G.modeT > 0.35) { p.y = surf(pl, p.x); p.vy = -p.vy * 0.35; p.vx *= 0.6; A.thump(0.7); spray(p.x, p.y, 1, 4); spray(p.x, p.y, -1, 4); if (Math.abs(p.vy) < 30) p.vy = 0; } }
      if (cr() < dt * 10) burst(p.x, p.y - 20, 1, ['#ffd23f'], 20, 'star');
    } else { p.rot = lerp(p.rot, Math.round(p.rot / TAU) * TAU, 0.2); }
    if (G.modeT > 1.9) { G.moose.mode = 'idle'; G.moose.timer = 1.5; loseLife(G.reason); }
  }

  // ---------------------------------------------------------------- barrels
  function slopeDir(p, fallback) { return p.slope > 0.001 ? 1 : p.slope < -0.001 ? -1 : p.f.includes('>') ? 1 : p.f.includes('<') ? -1 : fallback; } // '>'/'<' flags: flat but drains that way
  function updateBarrels(dt) {
    const d = diff(), p = G.p;
    const windK = G.wind && G.wind.v ? G.wind.v / 30 : 0;
    let rumble = 0;
    for (const b of G.barrels) {
      if (b.sq) b.sq = Math.max(0, b.sq - dt * 4);
      b.age += dt; G.dbg.maxBarrelAge = Math.max(G.dbg.maxBarrelAge, b.age);
      if (b.glow) b.glow += dt;
      const r = b.r;
      if (b.state === 'roll') {
        const sp = b.speed * (b.plat.ice ? (b.gold ? 1.1 : 1.3) : 1) * (1 + 0.22 * windK * b.dir);
        const px = b.x;
        b.x += b.dir * sp * dt; b.rot += b.dir * sp * dt / r;
        if (b.x >= b.plat.x1 && b.x <= b.plat.x2) b.y = surf(b.plat, b.x);
        else {
          const pl = platAt(b.x, b.y, SEAM, b.plat);
          if (pl) { b.plat = pl; b.y = surf(pl, b.x); }
          else { b.state = 'fall'; b.vx = b.dir * sp * 0.7; b.vy = 8; b.fallFrom = b.y; }
        }
        if (b.state === 'roll') {
          rumble += 1;
          if (b.plat.ice && cr() < dt * 20) spray(b.x, b.y, b.dir, 1);
          // drop down a ladder sometimes
          for (const L of G.ladders) {
            if (L.topP !== b.plat || b.lastLadder === L) continue;
            if ((px - L.x) * (b.x - L.x) <= 0) {
              b.lastLadder = L;
              const below = p && p.y > b.y + 8;
              if (rng() < (below ? 0.24 : 0.15) * (G.st.ladderDrop || 1) && b.type !== 'mini' && !b.gold) { b.state = 'teeter'; b.x = L.x; b.lad = L; b.tt = 0; A.rattle && A.rattle(vol(b)); }
              break;
            }
          }
        }
      } else if (b.state === 'teeter') {
        // wobbles at the ladder top for a moment so a climber can see it coming
        b.tt += dt; b.rot = Math.sin(b.tt * 40) * 0.25;
        if (b.tt > 0.6) { b.state = 'ladder'; A.thump(0.3 * vol(b)); }
      } else if (b.state === 'ladder') {
        b.y += 58 * dt; b.x = b.lad.x; b.rot += dt * 3;
        if (b.y >= b.lad.bot) {
          b.y = b.lad.bot; b.plat = b.lad.botP; b.state = 'roll'; b.lastLadder = b.lad;
          b.dir = slopeDir(b.plat, rng() < 0.5 ? -1 : 1); A.thump(0.5 * vol(b));
        }
        rumble += 0.5;
      } else if (b.state === 'fall' || b.state === 'bounce') {
        const py = b.y;
        b.vy += B_GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += (b.vx / r) * dt;
        if (b.vy > 0) {
          const pl = landPlat(b.x, py, b.y, null);
          if (pl) {
            const drop = b.y - b.fallFrom;
            b.y = surf(pl, b.x); b.plat = pl; b.mark = null;
            if (b.type === 'bouncer') {
              b.dir = slopeDir(pl, Math.sign(b.vx) || b.dir);
              b.vx = b.dir * d.speed * 0.85; b.vy = -rnd(130, 175); b.fallFrom = b.y; b.hops++;
              predictMark(b); A.boing(); spray(b.x, b.y, 1, 3); spray(b.x, b.y, -1, 3);
              if (b.x < -10 || b.x > W + 10) b.dead = true;
            } else if (b.type === 'snow' && drop > 14) {
              // snowball splits into two minis on impact
              b.dead = true; A.poof(); burst(b.x, b.y - 4, 12, ['#fff', '#dfe9ff'], 50, 'snow');
              for (const s of [-1, 1]) G.barrels.push({ type: 'mini', x: b.x + s * 2, y: b.y, r: 3.8, dir: s, speed: d.speed * 1.15, state: 'fall', vx: s * 40, vy: -70, fallFrom: b.y, plat: pl, rot: 0, age: 0, jumpedId: b.jumpedId, lastLadder: null, hops: 1 });
            } else if (drop > 18 && b.hops < 1) {
              b.hops++; b.vy = -Math.min(95, drop * 0.85); b.fallFrom = b.y; b.y -= 0.5;
              b.dir = slopeDir(pl, Math.sign(b.vx) || b.dir); b.vx = b.dir * Math.abs(b.vx) * 0.6;
              A.thump(0.8 * vol(b)); spray(b.x, b.y, 1, 3); spray(b.x, b.y, -1, 3);
              if (drop > 50 && vol(b) > 0.5) G.shake = Math.max(G.shake, 0.8);
            } else {
              b.state = 'roll'; b.hops = 0; b.dir = slopeDir(pl, Math.sign(b.vx) || b.dir); b.vy = 0; b.lastLadder = null;
              A.thump(0.4 * vol(b));
            }
          }
        }
      }
      if (b.x < -14 || b.x > W + 14 || b.y > H + 20 || b.age > 60) b.dead = true;
    }
    G.barrels = G.barrels.filter((b) => !b.dead);
    // rumble: louder with more barrels and when one is near the player
    let near = 0; if (p) for (const b of G.barrels) if (b.state === 'roll') near = Math.max(near, 1 - Math.min(1, Math.hypot(b.x - p.x, b.y - p.y) / 70));
    A.setRumble(G.mode === 'play' ? Math.min(0.08 + 0.05 * rumble, 0.22) * (rumble > 0 ? 1 : 0) + near * 0.25 : 0);
  }
  function vol(b) { return G.p ? clamp(1 - Math.hypot(b.x - G.p.x, b.y - G.p.y) / 160, 0.15, 1) : 0.3; }

  function collide() {
    const p = G.p; if (!p || G.mode !== 'play') return;
    // a climber's head can peek over the top: barrels rolling across the catwalk above pass over it
    const px0 = p.x - 3, px1 = p.x + 3, py0 = p.climb ? Math.max(p.y - 9.5, p.climb.top - 1) : p.y - 13, py1 = p.y - 1.8;
    for (const b of G.barrels) {
      const cx = b.x, cy = b.y - b.r, rr = b.r * 0.68;
      // ski poles: smack anything close
      if (p.poles > 0) {
        const sx = p.x + p.face * 4, sy = p.y - 9;
        if (Math.hypot(cx - sx, cy - sy) < b.r + 10) {
          b.dead = true; G.streak++; G.streakPulse = 1; G.stats.bestStreak = Math.max(G.stats.bestStreak, G.streak); feedStreak(); if (streakMult() > 1 && G.streak === 2 * streakMult() - 1) A.streakUp(streakMult());
          const pts = (b.type === 'barrel' || b.type === 'bouncer' ? 250 : 150) * (b.gold ? GOLD_X : 1) * streakMult();
          addScore(pts, 'poles'); G.stats.smashed++; pop(cx, cy - 6, '+' + pts, '#ff9ab5', 0.9, 1.1);
          A.smash(); G.hitStop = Math.max(G.hitStop, 0.05); G.shake = Math.max(G.shake, 1.4); vibe(12);
          burst(cx, cy, 14, b.type.startsWith('snow') || b.type === 'mini' ? ['#fff', '#dfe9ff'] : ['#a8683c', '#6d3f21', '#cf8f5a', '#ffcf6a'], 80, b.type === 'barrel' || b.type === 'bouncer' ? 'chip' : 'snow');
          continue;
        }
      }
      // riding the chairlift is a breather: barrels dropping past fall behind the seat
      if (p.mover && p.mover.type === 'chair' && b.state !== 'roll') { b.pdx = cx - p.x; continue; }
      // body hit (hazard hitbox is smaller than the barrel)
      const qx = clamp(cx, px0, px1), qy = clamp(cy, py0, py1);
      if ((qx - cx) * (qx - cx) + (qy - cy) * (qy - cy) < rr * rr && p.inv <= 0) { hurtPlayer('barrel'); return; }
      // near-miss tracking: smallest gap between boots and the barrel's hitbox while passing over it
      if (!p.ground && !p.mover && !p.climb && Math.abs(cx - p.x) < 3 + rr) p.minGap = Math.min(p.minGap, (cy - rr) - py1);
      // jumped over it? Pays out the moment the barrel passes under you.
      const dxp = cx - p.x, pdx = b.pdx; b.pdx = dxp;
      if (!p.ground && !p.mover && !p.climb && b.jumpedId !== p.jumpId && pdx != null && (pdx === 0 || Math.sign(pdx) !== Math.sign(dxp)) && p.y < b.y - b.r * 2 + 2 && b.y - p.fromY < 12 && b.y - p.fromY > -16 && b.state !== 'ladder') {
        b.jumpedId = p.jumpId; b.sq = 1; p.jumpCleared++; G.streak++; G.streakPulse = 1; feedStreak(); G.stats.jumped++; G.stats.bestStreak = Math.max(G.stats.bestStreak, G.streak);
        // jumping is how you score: 200 a barrel, times a streak multiplier that climbs x1 -> x5 until you fall
        const mult = streakMult(), pts = JUMP_PTS * (b.gold ? GOLD_X : 1) * p.jumpCleared * mult;
        addScore(pts, 'barrels'); A.clear(p.jumpCleared, G.streak); A.whoosh(); vibe(6);
        if (b.gold) G.stats.gold = (G.stats.gold || 0) + 1;
        pop(p.x, p.y - 22, '+' + pts, b.gold ? '#ffd23f' : p.jumpCleared > 1 ? '#7dffb0' : mult >= 3 ? '#ffb37a' : '#ffe27a', 1.0, Math.min(1.7, (p.jumpCleared > 1 ? 1.35 : 1.1) + (mult - 1) * 0.1));
        if (p.jumpCleared > 1) pop(p.x, p.y - 40, p.jumpCleared === 2 ? 'DOUBLE!' : 'TRIPLE!', '#7dffb0', 1.0, 1.15 + 0.1 * p.jumpCleared);
        if (mult > 1 && G.streak === Math.round((mult - 1) * 2) + 1) A.streakUp(mult);
        if (mult > 1 && G.streak === Math.round((mult - 1) * 2) + 1) pop(p.x, p.y - 48, 'x' + mult + ' STREAK!', '#ffb37a', 0.9, 1.0 + mult * 0.06);
        burst(p.x, p.y - 4, 6 + mult * 2, ['#ffe27a', '#fff', mult >= 3 ? '#ff9a3a' : '#ffe27a'], 40 + mult * 6, 'spark');
      }
    }
    G.barrels = G.barrels.filter((b) => !b.dead);
    // the moose itself
    const m = G.moose;
    if (m && p.inv <= 0 && Math.abs(m.x - p.x) < 12 && p.y > m.y - 27 && p.y < m.y + 4) hurtPlayer('moose');
  }

  // ---------------------------------------------------------------- mist + wind
  function updateMist(dt) {
    const M = G.mist; if (!M) return;
    M.t -= dt;
    if (M.phase === 'idle' && M.t <= 0) { M.phase = 'warn'; M.t = 1.3; M.band = (M.band + 1) % G.st.mist.length; A.sputter(); }
    else if (M.phase === 'warn') { if (cr() < dt * 14) mistPuff(true); if (M.t <= 0) { M.phase = 'on'; M.t = 2.6; A.hiss(2.4); } }
    else if (M.phase === 'on') { if (cr() < dt * 30) mistPuff(false); if (M.t <= 0) { M.phase = 'fade'; M.t = 0.9; } }
    else if (M.phase === 'fade' && M.t <= 0) { M.phase = 'idle'; M.t = rnd(5, 7.5); }
    const target = M.phase === 'on' ? 1 : M.phase === 'fade' ? 0 : 0;
    M.a = approach(M.a, target, dt * (M.phase === 'on' ? 2.4 : 1.2));
  }
  function mistPuff(small) {
    const b = G.st.mist[G.mist.band], side = b.side, x = side < 0 ? 18 : W - 18, y = (b.y1 + b.y2) / 2 + crnd(-8, 8);
    G.parts.push({ x, y, vx: -side * crnd(40, small ? 70 : 140), vy: crnd(-8, 8), life: crnd(0.6, 1.2), t: 0, c: '#fff', k: 'mist', r: crnd(3, small ? 5 : 9), g: -6 });
  }
  function updateWind(dt) {
    const Wd = G.wind; if (!Wd) return;
    Wd.t -= dt;
    if (Wd.phase === 'idle' && Wd.t <= 0) { Wd.phase = 'warn'; Wd.t = 1.4; Wd.dir = rng() < 0.5 ? -1 : 1; }
    else if (Wd.phase === 'warn' && Wd.t <= 0) { Wd.phase = 'on'; Wd.t = 2.4; }
    else if (Wd.phase === 'on' && Wd.t <= 0) { Wd.phase = 'idle'; Wd.t = rnd(5, 8); }
    const target = Wd.phase === 'on' ? Wd.dir * 30 * (G.st.wind ? 1 : 1.6) : 0;
    Wd.v = approach(Wd.v, target, dt * 60);
    const streaks = Wd.phase === 'warn' ? 8 : Wd.phase === 'on' ? 40 : 0;
    if (cr() < dt * streaks) { const d = Wd.phase === 'on' ? Wd.dir : Wd.dir; G.parts.push({ x: d > 0 ? -4 : W + 4, y: crnd(20, 310), vx: d * crnd(160, 260), vy: crnd(-6, 10), life: 1.6, t: 0, c: 'rgba(255,255,255,.7)', k: 'streak', r: crnd(4, 10), g: 0 }); }
    A.setWind(G.mode === 'play' ? (Wd.phase === 'warn' ? 0.06 : 0) + Math.abs(Wd.v) / 30 * 0.22 : 0);
  }

  // ---------------------------------------------------------------- tutorial hints
  function updateHints() {
    if (save.tut >= 1 || G.stageIdx !== 0 || G.loop !== 0 || !G.p) { G.hint = null; return; }
    const p = G.p;
    let h = null;
    if (Math.abs(p.x - G.st.start.x) < 6 && p.ground && p.ground.ground) {
      const gx = G.st.guide ? G.st.guide[0] : (G.ladders.filter((L) => L.botP === p.ground).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || { x: 120 }).x;
      const right = gx >= p.x; h = { text: right ? 'hold ▶ to run' : 'hold ◀ to run', x: p.x + (right ? 18 : -18), y: p.y - 30 };
    }
    for (const L of G.ladders) if (Math.abs(L.x - p.x) < 14 && p.ground && Math.abs(L.bot - p.y) < 3 && !p.climb) h = { text: '▲ climb', x: L.x, y: L.bot - 26 };
    const t0 = G.toks[0]; if (t0 && !t0.taken && p.ground && p.ground.ground && Math.abs(t0.x - p.x) < 34 && !h) h = { text: 'JUMP for the maple leaf!', x: t0.x, y: t0.y - 16 };
    for (const b of G.barrels) if (b.state === 'roll' && p.ground && Math.abs(b.y - p.y) < 5 && Math.abs(b.x - p.x) < 40 && Math.sign(p.x - b.x) === b.dir) h = { text: 'JUMP!', x: p.x, y: p.y - 30, hot: true };
    G.hint = h;
  }

  // ---------------------------------------------------------------- main step
  function step(dt) {
    G.t += dt; G.modeT += dt;
    if (G.hitStop > 0) { G.hitStop -= dt; return; }
    G.shake = Math.max(0, G.shake - dt * 12);
    if (G.streakPulse > 0) G.streakPulse = Math.max(0, G.streakPulse - dt * 5);
    if (G.closedFlash > 0) G.closedFlash -= dt;
    if (G.mode === 'play') {
      G.stats.time += dt; G.lapT += dt;
      if (G.banner > 0) G.banner -= dt;
      // the lift-closing clock
      G.timeLeft = Math.max(0, G.timeLeft - dt);
      const sec = Math.ceil(G.timeLeft);
      if (sec !== G.lastSec) { G.lastSec = sec; if (sec <= 10 && sec > 0) A.tick(sec <= 5); }
      if (G.timeLeft <= 0) { G.closedFlash = 1; A.closed(); hurtPlayer('closed'); }
      A.intensity = G.timeLeft <= 10 ? 1 : 0; if (G.goalT > 0) G.goalT -= dt;
      updateMovers(dt); updatePlayer(dt); updateMoose(dt); updateBarrels(dt); collide(); updateMist(dt); updateWind(dt); updateHints();
      if (decayOn() && streakMult() > 1 && G.mode === 'play' && !(G.p && G.p.mover) && !(G.p && G.p.ground && G.p.ground.ground && G.movers.some((mv) => mv.type === 'gondola'))) { G.streakT -= dt; if (G.streakT <= 0) dropStreak(); }
    } else if (G.mode === 'dying') {
      A.intensity = 0;
      updateMovers(dt); updateDying(dt); updateMoose(dt);
    } else if (G.mode === 'clear') {
      updateMovers(dt); updateMoose(dt);
      G.p.anim += dt; G.p.sx = lerp(G.p.sx, 1, 0.2); G.p.sy = lerp(G.p.sy, 1, 0.2); G.p.state = 'celebrate'; G.p.face = 1;
      if (G.modeT > 0.9 && G.countLeft > 0) {
        const n = Math.min(G.countLeft, Math.max(100, Math.ceil(G.clearBonus / 60)));
        G.countLeft -= n; addScore(n, 'time'); if (((G.modeT * 60) | 0) % 2 === 0) A.count((G.modeT * 30) | 0);
      }
      for (let k = 0; k < 5; k++) { const at = STAMP_AT(k); if (G.modeT >= at && G.modeT - dt < at) { const on = G.tixGot & (1 << k); if (on) { A.stamp(k, !!(G.tixNew & (1 << k))); vibe(10); } else A.thump(0.3); } }
      if (G.newOutfitT > 0) G.newOutfitT -= dt;
      if (G.modeT > 1.2 && cr() < dt * 6) burst(G.p.x + crnd(-30, 30), G.p.y - crnd(20, 50), 8, ['#ffd23f', '#ff7a1a', '#7dffb0', '#fff'], 50, 'conf');
      if (G.modeT > 3.4 && G.countLeft <= 0) nextStage();
    } else if (G.mode === 'title') {
      updateMovers(dt); updateMoose(dt); updateBarrels(dt);
    } else if (G.mode === 'over') {
      updateMoose(dt);
    }
    // sky life: falling snow + lodge chimney smoke (cosmetic only)
    if (!G.flakes) { G.flakes = []; for (let i = 0; i < 46; i++) G.flakes.push({ x: crnd(-20, 260), y: crnd(-40, 330), z: crnd(0.35, 1), ph: crnd(0, 6) }); }
    const wv = G.wind && G.wind.v ? G.wind.v : 0;
    for (const f of G.flakes) { f.y += (8 + 14 * f.z) * dt; f.x += (Math.sin(G.t * 0.9 + f.ph) * 4 + wv * 2.2) * f.z * dt; if (f.y > 335) { f.y = -8; f.x = crnd(-20, 260); } if (f.x > 270) f.x = -25; if (f.x < -30) f.x = 265; }
    if (G.goalP && cr() < dt * 2.2) { const lg = G.st.lodge, y0 = surf(G.goalP, lg.x + 18); G.smoke.push({ x: lg.x + 27.7, y: y0 - 36, t: 0, life: crnd(2.2, 3.2), r: crnd(1.4, 2.2), vx: crnd(2, 5) + wv * 0.15 }); }
    for (const q of G.smoke) { q.t += dt; q.y -= 7 * dt; q.x += q.vx * dt; q.r += 1.4 * dt; }
    G.smoke = G.smoke.filter((q) => q.t < q.life);
    // particles
    for (const q of G.parts) { q.t += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.k === 'mist') { q.vx *= 1 - dt * 1.5; q.r += dt * 6; } if (q.vr) q.rot += q.vr * dt; }
    G.parts = G.parts.filter((q) => q.t < q.life);
    if (G.parts.length > 420) G.parts.splice(0, G.parts.length - 420);
    for (const q of G.pops) q.t += dt;
    G.pops = G.pops.filter((q) => q.t < q.life);
  }

  // ---------------------------------------------------------------- rendering
  const SKY_DUSK = ['#2a1f58', '#6b3a72', '#d9666a', '#ffb070'];
  const SKY_NIGHT = ['#070a24', '#141a46', '#2b2d64', '#4a3a6e'];
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function duskLevel() {
    if (G.mode === 'title' || !G.timeMax) return 0.18 + 0.1 * Math.sin(G.t * 0.2);
    if (G.mode === 'clear') return Math.min(1, G.clearDusk + G.modeT * 0.08); // the lodge lights up as you celebrate
    const f = 1 - G.timeLeft / G.timeMax;
    return clamp(f * 1.15, 0, 1);
  }
  const lightsLevel = (dk) => clamp((dk - 0.4) / 0.4, 0, 1);

  let stars = null, townLights = null;
  function seedScenery() {
    const r = mulberry(7);
    stars = []; for (let i = 0; i < 70; i++) stars.push({ x: r() * 400 - 80, y: r() * 170 - 40, s: r() * 0.8 + 0.3, ph: r() * 6 });
    townLights = []; for (let i = 0; i < 60; i++) townLights.push({ x: r() * 400 - 80, y: 0, dy: r(), ph: r() * 6, c: r() < 0.7 ? '#ffd38a' : '#fff1c9' });
  }

  function worldTransform(g, sx, sy) { g.setTransform(dpr * S, 0, 0, dpr * S, dpr * (OX + (sx || 0)), dpr * (OY + camY + (sy || 0))); }
  function viewBounds() { return { x0: -OX / S - 2, x1: (cw - OX) / S + 2, y0: -(OY + camY) / S - 2, y1: (ch - OY - camY) / S + 2 }; }

  function paintBackground() {
    bgCanvas = bgCanvas || document.createElement('canvas'); bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    const g = bgCanvas.getContext('2d'); g.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    worldTransform(g);
    const v = viewBounds(), st = G.st, r = mulberry(31 + G.stageIdx * 11);
    // far range (Adirondack-ish blue-purple) with warm rim light
    const ridge = (base, amp, n, seedOff, fill, cap) => {
      g.beginPath(); g.moveTo(v.x0, v.y1);
      const pts = [];
      for (let x = v.x0; x <= v.x1 + 20; x += 20) { const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.021 + seedOff) * Math.cos(x * 0.013 + seedOff * 2)) - r() * amp * 0.25; pts.push([x, y]); g.lineTo(x, y); }
      g.lineTo(v.x1 + 20, v.y1); g.closePath(); g.fillStyle = fill; g.fill();
      if (cap) { g.strokeStyle = cap; g.lineWidth = 1.2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
      return pts;
    };
    const lake = st.id !== 'snowmaking';
    const bd = ART.asset('backdrop');
    if (bd) { g.drawImage(bd, 0, 0, W, H); for (const tl of townLights) tl.y = 182 + tl.dy * 6; }
    else {
    ridge(st.id === 'summit' ? 210 : 150, 60, 0, 1.3 + G.stageIdx, '#5a4a86', 'rgba(255,190,170,.55)');
    if (lake) {
      // a long lake (with the city's lights along its near shore) far below
      const ly = st.id === 'summit' ? 222 : 168;
      const gr = g.createLinearGradient(0, ly, 0, ly + 14); gr.addColorStop(0, '#f2a27a'); gr.addColorStop(1, '#7d5f9a');
      g.fillStyle = gr; g.fillRect(v.x0, ly, v.x1 - v.x0, 16);
      g.fillStyle = 'rgba(255,230,190,.5)'; for (let i = 0; i < 18; i++) g.fillRect(r() * 300 - 30, ly + 2 + r() * 10, r() * 16 + 4, 0.5);
      for (const tl of townLights) tl.y = ly + 15 + tl.dy * 6;
    }
    const mid = ridge(st.id === 'summit' ? 250 : 215, 50, 0, 3.1 + G.stageIdx * 0.7, '#3b3466', null);
    // ski trails on the mid ridge
    g.strokeStyle = 'rgba(230,225,255,.22)'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { const x = r() * 260 - 10; g.beginPath(); g.moveTo(x, 190 + r() * 20); g.quadraticCurveTo(x + 20 - r() * 40, 250, x + r() * 40 - 20, 300); g.stroke(); }
    // near slope with spruce
    ridge(285, 26, 0, 5.2, '#2a2650', null);
    for (let i = 0; i < 46; i++) {
      const x = v.x0 + r() * (v.x1 - v.x0), y = 268 + r() * 40, h = 10 + r() * 14;
      g.fillStyle = r() < 0.5 ? '#1c2440' : '#212b4a';
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h * 0.32, y); g.lineTo(x + h * 0.32, y); g.closePath(); g.fill();
      g.fillStyle = 'rgba(230,235,255,.35)'; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h * 0.12, y - h * 0.62); g.lineTo(x + h * 0.1, y - h * 0.66); g.closePath(); g.fill();
    }
    }
    // background lift tower lattice + cable for character
    const tx = st.id === 'chair' ? 106 : st.id === 'gondola' ? 210 : 196;
    g.strokeStyle = 'rgba(30,26,60,.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(tx - 4, 330); g.lineTo(tx - 1.5, 40); g.moveTo(tx + 4, 330); g.lineTo(tx + 1.5, 40); g.stroke();
    g.lineWidth = 0.6; g.beginPath(); for (let y = 320; y > 50; y -= 10) { const w1 = lerp(4, 1.5, (330 - y) / 290), w2 = lerp(4, 1.5, (330 - y + 10) / 290); g.moveTo(tx - w1, y); g.lineTo(tx + w2, y - 10); g.moveTo(tx + w1, y); g.lineTo(tx - w2, y - 10); } g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(tx - 14, 42); g.lineTo(tx + 14, 42); g.stroke();
    g.strokeStyle = 'rgba(30,26,60,.4)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(v.x0, 60); g.quadraticCurveTo(tx - 40, 50, tx - 13, 43); g.moveTo(tx + 13, 43); g.quadraticCurveTo(tx + 60, 34, v.x1, 30); g.stroke();
    // the ground snowfield
    const gp = G.plats.find((p) => p.ground);
    if (gp) {
      const gr = g.createLinearGradient(0, 318, 0, v.y1); gr.addColorStop(0, '#e9ecff'); gr.addColorStop(0.025, '#aab2e0'); gr.addColorStop(0.1, '#4c4884'); gr.addColorStop(0.4, '#2a2456'); gr.addColorStop(1, '#17122e');
      g.fillStyle = gr; g.fillRect(v.x0, 318, v.x1 - v.x0, v.y1 - 318);
      g.fillStyle = '#fff'; g.fillRect(v.x0, 317.2, v.x1 - v.x0, 1.4);
    }
    paintStructures();
  }

  function paintStructures() {
    structCanvas = structCanvas || document.createElement('canvas'); structCanvas.width = canvas.width; structCanvas.height = canvas.height;
    const g = structCanvas.getContext('2d'); g.clearRect(0, 0, structCanvas.width, structCanvas.height);
    worldTransform(g);
    const r = mulberry(99 + G.stageIdx);
    // support posts down to whatever is below
    for (const p of G.plats) {
      if (p.ground) continue;
      for (const x of [p.x1 + 3, p.x2 - 3]) {
        const y0 = surf(p, x) + 4; let y1 = 318;
        for (const q of G.plats) if (q !== p && x >= q.x1 && x <= q.x2) { const s = surf(q, x); if (s > y0 && s < y1) y1 = s; }
        g.strokeStyle = 'rgba(28,24,56,.75)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
        g.strokeStyle = 'rgba(28,24,56,.35)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y0 + 4); g.lineTo(x + (x < (p.x1 + p.x2) / 2 ? 5 : -5), y0); g.stroke();
      }
    }
    // ladders (behind the catwalks)
    for (const L of G.ladders) drawLadder(g, L);
    // catwalks
    for (const p of G.plats) {
      if (p.ground) continue;
      const len = p.x2 - p.x1, th = 4.2;
      g.save();
      // beam body
      g.beginPath(); g.moveTo(p.x1, p.y1); g.lineTo(p.x2, p.y2); g.lineTo(p.x2, p.y2 + th); g.lineTo(p.x1, p.y1 + th); g.closePath();
      let gr = g.createLinearGradient(0, Math.min(p.y1, p.y2), 0, Math.max(p.y1, p.y2) + th);
      if (p.ice) { gr.addColorStop(0, '#e8f8ff'); gr.addColorStop(0.5, PAL.ice); gr.addColorStop(1, PAL.iceD); }
      else { gr.addColorStop(0, PAL.woodL); gr.addColorStop(0.55, PAL.wood); gr.addColorStop(1, PAL.woodD); }
      g.fillStyle = gr; g.fill();
      g.strokeStyle = p.ice ? '#3d6f9a' : '#3a1f10'; g.lineWidth = 0.6; g.stroke();
      // plank seams / ice glints
      g.lineWidth = 0.45;
      if (p.ice) {
        g.strokeStyle = 'rgba(255,255,255,.9)';
        for (let x = p.x1 + 4; x < p.x2 - 4; x += 9 + r() * 10) { const y = surf(p, x); g.beginPath(); g.moveTo(x, y + 1.6); g.lineTo(x + 4, y + 1.2); g.stroke(); }
        // icicles
        g.fillStyle = 'rgba(210,240,255,.9)';
        for (let x = p.x1 + 3; x < p.x2 - 2; x += 5 + r() * 6) { const y = surf(p, x) + th, h = 2 + r() * 4.5; g.beginPath(); g.moveTo(x - 1, y); g.lineTo(x + 1, y); g.lineTo(x, y + h); g.closePath(); g.fill(); }
      } else {
        g.strokeStyle = 'rgba(50,25,10,.55)';
        for (let x = p.x1 + 8; x < p.x2 - 2; x += 8) { const y = surf(p, x); g.beginPath(); g.moveTo(x, y + 0.6); g.lineTo(x, y + th); g.stroke(); }
        g.strokeStyle = 'rgba(255,220,180,.35)'; g.beginPath(); g.moveTo(p.x1, p.y1 + 1.2); g.lineTo(p.x2, p.y2 + 1.2); g.stroke();
      }
      // underside steel truss
      if (len > 50 && !p.deck) {
        g.strokeStyle = 'rgba(40,46,80,.8)'; g.lineWidth = 0.6; g.beginPath();
        for (let x = p.x1 + 4; x < p.x2 - 6; x += 8) { const y = surf(p, x) + th, y2 = surf(p, x + 8) + th; g.moveTo(x, y); g.lineTo(x + 4, y + 3); g.lineTo(x + 8, y2); }
        g.moveTo(p.x1 + 4, p.y1 + th + 3); g.lineTo(p.x2 - 4, p.y2 + th + 3);
        g.stroke();
      }
      // snow cap on top with soft drips (thinner on ice)
      g.fillStyle = PAL.snow;
      g.beginPath(); g.moveTo(p.x1 - 0.5, p.y1 + 0.4);
      for (let x = p.x1; x <= p.x2 + 0.01; x += 3) { const y = surf(p, Math.min(x, p.x2)); g.lineTo(Math.min(x, p.x2), y - (p.ice ? 0.4 : 1.1) - (Math.sin(x * 1.7) * 0.25)); }
      g.lineTo(p.x2 + 0.5, p.y2 + 0.4);
      for (let x = p.x2; x >= p.x1; x -= 4) { const y = surf(p, x); g.lineTo(x, y + 0.7 + (r() < 0.3 && !p.ice ? 1.4 : 0)); }
      g.closePath(); g.fill();
      // railing on decks / goal / long catwalks
      if (p.deck || p.goal) {
        g.strokeStyle = p.deck ? 'rgba(60,32,16,.9)' : 'rgba(60,32,16,.9)'; g.lineWidth = 0.8; g.beginPath();
        for (let x = p.x1 + 2; x <= p.x2 - 1; x += 7) { const y = surf(p, x); g.moveTo(x, y - 1); g.lineTo(x, y - 6); }
        g.moveTo(p.x1 + 2, p.y1 - 6); g.lineTo(p.x2 - 1, p.y2 - 6); g.stroke();
        g.strokeStyle = PAL.snow; g.lineWidth = 0.7; g.beginPath(); g.moveTo(p.x1 + 2, p.y1 - 6.4); g.lineTo(p.x2 - 1, p.y2 - 6.4); g.stroke();
      }
      g.restore();
    }
    // moose's barrel stack
    const m = G.st.moose, dp = G.plats.find((p) => p.deck);
    if (dp && !m.patrol) { const sx = clamp(m.x - (m.dirs.length > 1 ? 0 : m.dirs[0] * 24), dp.x1 + 8, dp.x2 - 8); if (m.dirs.length === 1) ART.drawBarrelStack(g, sx, surf(dp, sx)); }
    // gondola base / top stations, chairlift towers
    for (const mv of G.st.movers || []) {
      if (mv.type === 'chair') {
        for (const tx of [mv.x1 - mv.hw - 6, mv.x2 + mv.hw + 2]) { g.fillStyle = '#3a4561'; g.fillRect(tx - 1.5, mv.cableY - 4, 3, 318 - mv.cableY + 4); g.fillStyle = '#5d6b8f'; g.fillRect(tx - 6, mv.cableY - 5, 12, 2.5); }
      }
      if (mv.type === 'gondola') {
        const a = mv.path[0], z = mv.path[mv.path.length - 1];
        const mr = !!G.st.mirrored; // huts stay on the outside ends of the line when the stage is flipped
        stationHut(g, mr ? a[0] + 4 : a[0] - 30, a[1], 26, 24, '#6a3f9c', mr);
        stationHut(g, mr ? z[0] - 6 : z[0] - 14, z[1] - 1, 20, 26, '#6a3f9c', !mr);
      }
    }
  }
  function stationHut(g, x, y, w, h, c, right) {
    g.fillStyle = '#2a2250'; g.fillRect(x, y - h, w, h);
    g.fillStyle = c; g.fillRect(x + 1, y - h + 1, w - 2, h * 0.32);
    g.fillStyle = PAL.snow; g.beginPath(); g.moveTo(x - 2, y - h); g.lineTo(x + w + 2, y - h); g.lineTo(x + w, y - h - 2.5); g.lineTo(x, y - h - 2.5); g.fill();
    g.fillStyle = 'rgba(255,200,90,.6)'; g.fillRect(x + 4, y - h * 0.55, 6, 5);
    g.fillStyle = '#120e26'; g.fillRect(right ? x : x + w - 9, y - 18, 9, 18);
  }
  function drawLadder(g, L) {
    const x = L.x, y0 = L.top - 5, y1 = L.bot + 0.5, hw = 3.4;
    g.strokeStyle = '#2a2a48'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - hw, y0); g.lineTo(x - hw, y1); g.moveTo(x + hw, y0); g.lineTo(x + hw, y1); g.stroke();
    g.strokeStyle = '#c9cfe6'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - hw - 0.3, y0); g.lineTo(x - hw - 0.3, y1); g.moveTo(x + hw - 0.3, y0); g.lineTo(x + hw - 0.3, y1); g.stroke();
    g.strokeStyle = '#ffb347'; g.lineWidth = 0.9; g.beginPath();
    for (let y = L.top + 2; y < L.bot; y += 4.2) { g.moveTo(x - hw, y); g.lineTo(x + hw, y); }
    g.stroke();
    g.fillStyle = PAL.snow; g.fillRect(x - hw - 0.8, y0 - 0.8, 1.6, 1.2); g.fillRect(x + hw - 0.8, y0 - 0.8, 1.6, 1.2);
  }

  function render(alpha) {
    const g = ctx;
    if (G.bgDirty) { G.bgDirty = false; paintBackground(); }
    const dk = duskLevel(), lt = lightsLevel(dk);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // sky
    const gr = g.createLinearGradient(0, 0, 0, canvas.height);
    for (let i = 0; i < 4; i++) gr.addColorStop([0, 0.35, 0.62, 0.8][i], mixHex(SKY_DUSK[i], SKY_NIGHT[i], dk));
    g.fillStyle = gr; g.fillRect(0, 0, canvas.width, canvas.height);
    const sh = G.shake > 0 ? G.shake : 0, sx = sh ? crnd(-sh, sh) * 0.6 : 0, sy = sh ? crnd(-sh, sh) * 0.6 : 0;
    worldTransform(g, sx, sy);
    // stars + moon
    if (dk > 0.2) {
      for (const s of stars) { const a = clamp((dk - 0.2) * 1.6, 0, 1) * (0.5 + 0.5 * Math.sin(G.t * 2 + s.ph)); g.fillStyle = 'rgba(255,250,230,' + a.toFixed(3) + ')'; g.fillRect(s.x, s.y, s.s, s.s); }
    }
    const ma = clamp((dk - 0.15) * 1.6, 0, 1);
    if (ma > 0) {
      const my = lerp(120, 30, clamp(dk * 1.2, 0, 1));
      const hg = g.createRadialGradient(52, my, 6, 52, my, 26); hg.addColorStop(0, 'rgba(255,245,220,' + (0.22 * ma).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,245,220,0)');
      g.fillStyle = hg; ART.ell(g, 52, my, 26, 26); g.fill();
      g.fillStyle = 'rgba(255,246,222,' + (0.95 * ma).toFixed(3) + ')'; ART.ell(g, 52, my, 8, 8); g.fill();
      g.fillStyle = 'rgba(210,200,190,' + (0.5 * ma).toFixed(3) + ')'; ART.ell(g, 49.5, my - 2, 1.8, 1.6); g.fill(); ART.ell(g, 54.5, my + 2.4, 1.3, 1.1); g.fill(); ART.ell(g, 55, my - 3, 0.9, 0.9); g.fill();
    }
    // aurora ribbons in the empty sky band as night falls
    if (dk > 0.45) {
      const a = clamp((dk - 0.45) / 0.4, 0, 1) * 0.5;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const base = 26 + k * 16, gr2 = g.createLinearGradient(0, base - 18, 0, base + 14);
        gr2.addColorStop(0, 'rgba(120,255,200,0)'); gr2.addColorStop(0.55, k ? 'rgba(140,120,255,' + (a * 0.55).toFixed(3) + ')' : 'rgba(110,255,190,' + (a * 0.6).toFixed(3) + ')'); gr2.addColorStop(1, 'rgba(120,255,200,0)');
        g.fillStyle = gr2; g.beginPath(); g.moveTo(-20, base + 14);
        for (let x = -20; x <= 262; x += 12) g.lineTo(x, base - 6 + Math.sin(x * 0.03 + G.t * (0.25 + k * 0.1) + k * 2) * 7 + Math.sin(x * 0.011 - G.t * 0.17) * 5);
        for (let x = 262; x >= -20; x -= 12) g.lineTo(x, base + 14 + Math.sin(x * 0.025 + G.t * 0.2 + k) * 4);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    // cached scenery
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bgCanvas, sx * dpr, sy * dpr);
    worldTransform(g, sx, sy);
    // town lights across the valley
    if (lt > 0 && G.st.id !== 'snowmaking') for (let i = 0; i < townLights.length; i++) { const tl = townLights[i]; if (i / townLights.length > lt) continue; g.fillStyle = tl.c; g.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 3 + tl.ph); g.fillRect(tl.x, tl.y, 0.8, 0.8); }
    g.globalAlpha = 1;
    // dusk overlay over the scenery
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(16,10,50,' + (dk * 0.32).toFixed(3) + ')'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(structCanvas, sx * dpr, sy * dpr);
    worldTransform(g, sx, sy);
    drawMoverBack(g);
    // lodge
    const lg = G.st.lodge, gp = G.goalP;
    for (const q of G.smoke) { const a = Math.min(1, q.t * 3) * (1 - q.t / q.life) * 0.45; g.fillStyle = 'rgba(225,220,240,' + a.toFixed(3) + ')'; ART.ell(g, q.x, q.y, q.r, q.r * 0.85); g.fill(); }
    if (gp) ART.drawLodge(g, lg.x, surf(gp, lg.x + 18), lt, lg.door - lg.x);
    // string lights along goal + deck railings
    stringLights(g, lt);
    // pickups
    for (const it of G.items) if (!it.taken) ART.drawPoles(g, it.x, it.y, G.t);
    for (const tk of G.toks) if (!tk.taken) { if (tk.lift > 14) { g.fillStyle = 'rgba(20,10,40,.2)'; ART.ell(g, tk.x, tk.y + tk.lift, 4.2, 1.1); g.fill(); } ART.drawToken(g, tk.x, tk.y, G.t + tk.ph); const lab = '+' + (tk.val * streakMult()); g.font = '900 6px Nunito, sans-serif'; g.textAlign = 'center'; g.lineWidth = 2; g.strokeStyle = 'rgba(26,18,58,.85)'; g.strokeText(lab, tk.x, tk.y + 14.5); g.fillStyle = tk.val >= 600 ? '#ff9a5a' : tk.val >= 400 ? '#ffd23f' : '#fff'; g.fillText(lab, tk.x, tk.y + 14.5); }
    // moose
    const m = G.moose;
    if (m) {
      const mo = { x: m.x, y: m.y, face: m.face, state: m.walking && m.state === 'idle' ? 'idle' : m.state, k: m.k, t: G.t, blink: m.blink };
      ART.drawMoose(g, mo);
      if ((m.mode === 'windup') && (m.kind === 'bouncer' || m.lob)) { g.fillStyle = '#ff5a3a'; g.font = '900 12px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('!', m.x + m.face * 8, m.y - 48 - Math.abs(Math.sin(G.t * 12)) * 2); }
      if ((m.mode === 'idle' && m.pair) || (m.mode === 'windup' && m.secondThrow)) { g.fillStyle = '#ffd23f'; g.strokeStyle = '#2a1844'; g.lineWidth = 1.6; g.font = '900 12px Nunito, sans-serif'; g.textAlign = 'center'; const yy = m.y - 49 - Math.abs(Math.sin(G.t * 14)) * 2.5; g.strokeText('!!', m.x + m.face * 10, yy); g.fillText('!!', m.x + m.face * 10, yy); }
      if (m.mode === 'windup' && m.kind === 'sprint') { g.fillStyle = '#ffd23f'; g.strokeStyle = '#2a1844'; g.lineWidth = 1.6; g.font = '900 13px Nunito, sans-serif'; g.textAlign = 'center'; const yy = m.y - 49 - Math.abs(Math.sin(G.t * 14)) * 2.5; g.strokeText('»»', m.x + m.face * 10, yy); g.fillText('»»', m.x + m.face * 10, yy); }
      if (m.mode === 'windup') { const b = { x: m.x + m.face * 14, y: m.y - 6 - Math.min(1, m.k * 3) * 3, r: m.kind === 'snow' ? 5.8 : 6.1, rot: 0, gold: m.kind === 'sprint', glow: m.kind === 'bouncer' ? G.t : 0 }; if (m.kind === 'snow') ART.drawSnowball(g, b); else ART.drawBarrel(g, b); }
    }
    // barrels
    for (const b of G.barrels) {
      if (b.mark) { const a = 0.5 + 0.3 * Math.sin(G.t * 14); g.strokeStyle = 'rgba(255,90,60,' + a.toFixed(3) + ')'; g.lineWidth = 0.9; ART.ell(g, b.mark.x, b.mark.y - 0.5, 6, 1.8); g.stroke(); g.fillStyle = 'rgba(255,90,60,' + (a * 0.35).toFixed(3) + ')'; g.fill(); }
      g.fillStyle = 'rgba(20,10,40,.22)'; if (b.state === 'roll') { ART.ell(g, b.x, b.y + 0.3, b.r * 0.9, 1); g.fill(); }
      if ((b.state === 'fall' || b.state === 'ladder') && !b.mark) {
        // a shadow where it will land, so drops from above are readable
        let sy = Infinity; for (const q of G.plats) if (b.x >= q.x1 && b.x <= q.x2) { const s2 = surf(q, b.x); if (s2 > b.y + 1 && s2 < sy) sy = s2; }
        if (sy < Infinity) { const k = clamp(1 - (sy - b.y) / 160, 0.25, 1); g.fillStyle = 'rgba(20,10,40,' + (0.45 * k).toFixed(3) + ')'; ART.ell(g, b.x, sy + 0.2, b.r * (0.5 + 0.6 * k), 1.3); g.fill();
          if (sy >= 316 && b.y < sy - 14) { const a = 0.5 + 0.3 * Math.sin(G.t * 14); g.strokeStyle = 'rgba(255,90,60,' + a.toFixed(3) + ')'; g.lineWidth = 0.9; ART.ell(g, b.x, sy - 0.5, 6, 1.8); g.stroke(); g.fillStyle = 'rgba(255,90,60,' + (a * 0.3).toFixed(3) + ')'; g.fill(); } }
      }
      if (b.gold && (b.state === 'roll' || b.state === 'fall')) { // speed streaks trail behind a gold barrel
        const dx = b.state === 'roll' ? b.dir : Math.sign(b.vx || b.dir) || 1; g.strokeStyle = 'rgba(255,226,120,.75)'; g.lineWidth = 0.9; g.lineCap = 'round'; g.beginPath();
        for (let i = 0; i < 3; i++) { const yy = b.y - 3 - i * 3.2, l = 9 - i * 1.6; g.moveTo(b.x - dx * (b.r + 1), yy); g.lineTo(b.x - dx * (b.r + 1 + l), yy); } g.stroke(); g.lineCap = 'butt';
      }
      if (b.type === 'snow' || b.type === 'mini') ART.drawSnowball(g, b); else ART.drawBarrel(g, b);
      // about to come down a ladder: a bouncing "!" and a glow on the ladder below
      if (b.state === 'teeter') {
        const a = 0.6 + 0.4 * Math.sin(G.t * 20); g.fillStyle = 'rgba(255,90,60,' + (0.22 * a).toFixed(3) + ')'; g.fillRect(b.lad.x - 4.5, b.lad.top, 9, b.lad.bot - b.lad.top);
        g.fillStyle = '#ff5a3a'; g.strokeStyle = '#2a1844'; g.lineWidth = 1.6; g.font = '900 11px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        const yy = b.y - 15 - Math.abs(Math.sin(G.t * 12)) * 2; g.strokeText('!', b.x, yy); g.fillText('!', b.x, yy);
      }
    }
    drawMoverFront(g);
    // mist band hides barrels (player is drawn on top so you never lose yourself)
    if (G.mist && G.mist.a > 0.01) {
      drawMist(g);
      // ghosts of the barrels inside the mist: hidden, but not invisible
      const band = G.st.mist[G.mist.band];
      g.globalAlpha = 0.28 * G.mist.a;
      for (const b of G.barrels) if (b.y > band.y1 - 6 && b.y - 2 * b.r < band.y2 + 6) { if (b.type === 'snow' || b.type === 'mini') ART.drawSnowball(g, b); else ART.drawBarrel(g, b); }
      g.globalAlpha = 1;
      // landing spots of falling barrels show through the mist as red markers, so a drop is never invisible
      for (const b of G.barrels) {
        if (b.state !== 'fall' || b.mark) continue;
        let sy = Infinity; for (const q of G.plats) if (b.x >= q.x1 && b.x <= q.x2) { const s2 = surf(q, b.x); if (s2 > b.y + 1 && s2 < sy) sy = s2; }
        if (sy < Infinity && sy > band.y1 - 6 && sy < band.y2 + 6) { const a = (0.45 + 0.3 * Math.sin(G.t * 14)) * G.mist.a; g.strokeStyle = 'rgba(255,90,60,' + a.toFixed(3) + ')'; g.lineWidth = 0.9; ART.ell(g, b.x, sy - 0.5, 6, 1.8); g.stroke(); }
      }
    }
    if (G.mist) drawGuns(g);
    // player
    const p = G.p;
    if (p) {
      const flick = p.inv > 0 && G.mode === 'play' && Math.floor(G.t * 12) % 2 === 0;
      if (flick) g.globalAlpha = 0.45; // ghosted, never invisible
      ART.drawSkier(g, { x: p.x, y: p.y, face: p.face, state: p.state, t: p.anim, sx: p.sx, sy: p.sy, poles: p.poles > 0 && (p.poles > 2 || Math.floor(G.t * 10) % 2 === 0), swing: p.swing, rot: G.mode === 'dying' ? p.rot : 0, blink: p.blink, hurt: p.hurt });
      g.globalAlpha = 1;
      // ladder hint arrow when a ladder is in reach
      if (G.mode === 'play' && !p.climb && (p.ground || p.mover) && p.poles <= 0) {
        for (const L of G.ladders) if (Math.abs(L.x - p.x) <= LADDER_SNAP && (Math.abs(L.bot - p.y) < 3 || Math.abs(L.top - p.y) < 3)) {
          const up = Math.abs(L.bot - p.y) < 3, a = 0.55 + 0.35 * Math.sin(G.t * 8);
          g.fillStyle = 'rgba(255,226,122,' + a.toFixed(3) + ')'; g.beginPath();
          const yy = up ? p.y - 25 : p.y + 4, d = up ? -1 : 1;
          g.moveTo(L.x - 3, yy); g.lineTo(L.x + 3, yy); g.lineTo(L.x, yy + d * 3.5); g.closePath(); g.fill();
          break;
        }
      }
    }
    // particles
    for (const q of G.parts) {
      const a = 1 - q.t / q.life;
      if (q.k === 'ring') { const e = q.t / q.life; g.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - e)).toFixed(3) + ')'; g.lineWidth = 0.8; ART.ell(g, q.x, q.y, 3 + e * 12, 0.8 + e * 2.2); g.stroke(); continue; }
      if (q.k === 'mist') { g.fillStyle = 'rgba(240,246,255,' + (a * 0.5).toFixed(3) + ')'; ART.ell(g, q.x, q.y, q.r, q.r * 0.7); g.fill(); continue; }
      if (q.k === 'streak') { g.strokeStyle = 'rgba(255,255,255,' + (0.45 * Math.min(1, a * 2)).toFixed(3) + ')'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - Math.sign(q.vx) * q.r, q.y - q.vy * 0.02); g.stroke(); continue; }
      g.globalAlpha = Math.min(1, a * 1.5); g.fillStyle = q.c;
      if (q.k === 'chip' || q.k === 'conf') { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); g.restore(); }
      else if (q.k === 'star' || q.k === 'spark') { star(g, q.x, q.y, q.r * 1.6, q.rot); }
      else if (q.k === 'steam') { ART.ell(g, q.x, q.y, q.r * (1 + q.t * 3), q.r * (1 + q.t * 3)); g.fill(); }
      else { ART.ell(g, q.x, q.y, q.r, q.r); g.fill(); }
      g.globalAlpha = 1;
    }
    // light glows on top (lodge windows, deck bulbs) when it gets dark
    if (lt > 0) glowLights(g, lt);
    // popups
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const q of G.pops) {
      const k = q.t / q.life, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, sc = q.big * (k < 0.15 ? 0.55 + easeOut(k / 0.15) * 0.7 : 1.25 - Math.min(0.25, (k - 0.15) * 1.2));
      g.font = '400 10px "Bowlby One", Impact, sans-serif'; const hw = g.measureText(q.text).width * sc / 2 + 3, px = clamp(q.x, Math.min(hw, W / 2), Math.max(W - hw, W / 2));
      g.save(); g.translate(px, q.y - easeOut(Math.min(1, k * 1.4)) * 14); g.scale(sc, sc);
      g.font = '400 10px "Bowlby One", Impact, sans-serif'; g.lineWidth = 2.6; g.strokeStyle = 'rgba(26,24,48,' + a + ')'; g.strokeText(q.text, 0, 0);
      g.fillStyle = q.col; g.globalAlpha = a; g.fillText(q.text, 0, 0); g.globalAlpha = 1; g.restore();
    }
    // first climb: point at the next ladder up from wherever you're standing
    if (G.mode === 'play' && save.tut < 1 && G.loop === 0 && p && p.ground && !p.climb) {
      const guide = G.st.guide; let best = null; for (const L of G.ladders) if (L.botP === p.ground && (!guide || guide.includes(L.x)) && (!best || Math.abs(L.x - p.x) < Math.abs(best.x - p.x))) best = L;
      if (best && Math.abs(best.x - p.x) > 10) {
        const bob = Math.abs(Math.sin(G.t * 6)) * 3, y = best.bot - 22 - bob;
        g.save(); g.fillStyle = 'rgba(255,226,122,.95)'; g.strokeStyle = '#2a1844'; g.lineWidth = 1;
        for (let i = 0; i < 2; i++) { const yy = y - i * 5; g.beginPath(); g.moveTo(best.x - 4.5, yy); g.lineTo(best.x, yy - 4.5); g.lineTo(best.x + 4.5, yy); g.lineTo(best.x + 4.5, yy + 1.8); g.lineTo(best.x, yy - 2.7); g.lineTo(best.x - 4.5, yy + 1.8); g.closePath(); g.stroke(); g.fill(); }
        g.restore();
      }
    }
    // tutorial hint bubble
    if (G.hint && G.mode === 'play') {
      const h = G.hint, bob = Math.sin(G.t * 6) * 1.2;
      g.font = '900 8.5px Nunito, sans-serif'; const w = g.measureText(h.text).width + 10;
      g.fillStyle = h.hot ? 'rgba(255,90,60,.92)' : 'rgba(26,20,58,.85)'; ART.rr(g, clamp(h.x - w / 2, 2, W - w - 2), h.y - 7 + bob, w, 13, 5); g.fill();
      g.fillStyle = '#fff'; g.fillText(h.text, clamp(h.x, w / 2 + 2, W - w / 2 - 2), h.y - 0.5 + bob);
    }
    // gentle snowfall over the whole scene (near flakes bigger and brighter)
    for (const f of G.flakes || []) { g.fillStyle = 'rgba(245,248,255,' + (0.25 + 0.5 * f.z).toFixed(3) + ')'; ART.ell(g, f.x, f.y, 0.35 + 0.65 * f.z, 0.35 + 0.65 * f.z); g.fill(); }
    // stage banner
    if (G.banner > 0 && G.mode === 'play') drawBanner(g);
    // where to go: a bobbing marker over the lodge door at the start of each stage (always on during a first climb)
    if (G.mode === 'play' && G.goalP && (G.goalT > 0 || save.tut < 1)) {
      const lg = G.st.lodge, gy = surf(G.goalP, lg.door) - 30 + Math.sin(G.t * 5) * 2, a = save.tut < 1 ? 1 : clamp(G.goalT / 0.6, 0, 1);
      g.save(); g.globalAlpha = a; g.fillStyle = '#ffd23f'; g.strokeStyle = '#2a1844'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(lg.door - 5, gy - 3); g.lineTo(lg.door + 5, gy - 3); g.lineTo(lg.door, gy + 3); g.closePath(); g.stroke(); g.fill();
      g.font = '900 7px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2.2; g.strokeText('GOAL', lg.door, gy - 9); g.fillText('GOAL', lg.door, gy - 9);
      g.restore();
    }
    if (G.mode === 'clear') drawClear(g);
    // vignette at night
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawHUD(g, dk);
  }
  function star(g, x, y, r, rot) { g.save(); g.translate(x, y); g.rotate(rot || 0); g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.restore(); }
  function stringLights(g, lt) {
    for (const p of G.plats) {
      if (!p.goal && !p.deck) continue;
      let i = 0;
      const lg = G.st.lodge;
      for (let x = p.x1 + 3; x < p.x2 - 1; x += 5, i++) {
        if (p.goal && x > lg.x - 2 && x < lg.x + 38) continue; // not across the lodge front
        const y = surf(p, x) - 6.5 + Math.sin(x * 0.6) * 0.8, on = lt * 30 > (i * 7) % 30;
        g.fillStyle = on ? ['#ffd23f', '#ff7a5a', '#7dffb0', '#8fd3ff'][i % 4] : 'rgba(60,50,80,.9)';
        ART.ell(g, x, y + 1.2, 0.8, 1); g.fill();
      }
    }
  }
  function glowLights(g, lt) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const p of G.plats) {
      if (!p.goal && !p.deck) continue;
      let i = 0;
      const lg = G.st.lodge;
      for (let x = p.x1 + 3; x < p.x2 - 1; x += 5, i++) {
        if (p.goal && x > lg.x - 2 && x < lg.x + 38) continue;
        if (!(lt * 30 > (i * 7) % 30)) continue;
        const y = surf(p, x) - 5.3 + Math.sin(x * 0.6) * 0.8;
        g.fillStyle = ['rgba(255,210,63,.22)', 'rgba(255,122,90,.22)', 'rgba(125,255,176,.2)', 'rgba(143,211,255,.22)'][i % 4]; ART.ell(g, x, y, 3, 3); g.fill();
      }
    }
    const lg = G.st.lodge, gp = G.goalP;
    if (gp) { const y = surf(gp, lg.x + 18); const gr = g.createRadialGradient(lg.x + 18, y - 10, 2, lg.x + 18, y - 10, 34); gr.addColorStop(0, 'rgba(255,190,90,' + (0.35 * lt).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gr; g.fillRect(lg.x - 20, y - 50, 76, 60); }
    g.restore();
  }
  function drawMoverBack(g) {
    for (const m of G.movers) {
      if (m.type === 'chair') {
        // haul cable across the gap
        const xl = m.x1 - m.hw - 6, xr = m.x2 + m.hw + 2;
        g.strokeStyle = '#1a1830'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(xl, m.cableY - 3); g.quadraticCurveTo((xl + xr) / 2, m.cableY + 3, xr, m.cableY - 3); g.stroke();
        g.fillStyle = '#c9cfe6'; ART.ell(g, xl, m.cableY - 3, 2.4, 2.4); g.fill(); ART.ell(g, xr, m.cableY - 3, 2.4, 2.4); g.fill();
      }
      if (m.type === 'gondola') {
        g.strokeStyle = '#1a1830'; g.lineWidth = 0.9; g.beginPath();
        m.path.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1] - 27) : g.moveTo(pt[0], pt[1] - 27))); g.stroke();
      }
    }
  }
  function drawMoverFront(g) {
    for (const m of G.movers) {
      if (m.type === 'chair') {
        const xl = m.x1 - m.hw - 6, xr = m.x2 + m.hw + 2, t = (m.x - xl) / (xr - xl), cy = m.cableY - 3 + 6 * t * (1 - t) * 1.0;
        const sway = m.phase === 'move' ? Math.sin(G.t * 5) * 0.03 : Math.sin(G.t * 2) * 0.015;
        g.save(); g.translate(m.x, cy); g.rotate(sway);
        g.fillStyle = '#c9cfe6'; ART.ell(g, 0, 0, 2, 2); g.fill();
        g.strokeStyle = '#2a2344'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, m.top - cy - 10); g.lineTo(-m.hw + 1, m.top - cy - 10); g.lineTo(-m.hw + 1, m.top - cy); g.stroke();
        // seat + back
        g.fillStyle = '#ff7a1a'; g.strokeStyle = '#2a2344'; g.lineWidth = 0.7;
        ART.rr(g, -m.hw, m.top - cy - 12, 3.4, 11.5, 1.4); g.fill(); g.stroke();
        g.fillStyle = '#c45a12'; g.fillRect(-m.hw + 1, m.top - cy - 9, 1.2, 6);
        g.strokeStyle = '#2a2344'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(m.hw - 1, m.top - cy - 0.2); g.lineTo(m.hw - 1, m.top - cy - 6); g.lineTo(m.hw - 6, m.top - cy - 6); g.stroke(); // armrest
        g.fillStyle = '#ff7a1a';
        g.fillStyle = '#ffd23f'; ART.rr(g, -m.hw, m.top - cy - 0.2, m.hw * 2, 3.2, 1.4); g.fill(); g.stroke();
        g.fillStyle = PAL.snow; g.fillRect(-m.hw + 2, m.top - cy - 0.9, m.hw * 2 - 4, 0.8);
        g.restore();
      }
      if (m.type === 'gondola') {
        for (const c of m.cars) {
          const sway = Math.sin(G.t * 2 + c.sway) * 0.03, top = c.top;
          g.save(); g.translate(c.x, top - 27); g.rotate(sway);
          g.strokeStyle = '#2a2344'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 6); g.stroke();
          g.fillStyle = '#c9cfe6'; ART.ell(g, 0, 0, 2.2, 2.2); g.fill();
          // open cable car: roof, two corner posts, floor
          g.fillStyle = '#6a3f9c'; g.strokeStyle = '#2a2344'; g.lineWidth = 0.7;
          ART.rr(g, -c.hw - 1, 5.5, c.hw * 2 + 2, 4, 2); g.fill(); g.stroke();
          g.fillStyle = PAL.snow; g.fillRect(-c.hw, 5, c.hw * 2, 1);
          // cabin back wall + glass (the rider is drawn in front, so they stand inside it)
          const cg = g.createLinearGradient(0, 9.5, 0, 26); cg.addColorStop(0, '#5b3690'); cg.addColorStop(1, '#3a2266');
          g.fillStyle = cg; g.fillRect(-c.hw + 1, 9.5, c.hw * 2 - 2, 16.5);
          g.fillStyle = 'rgba(170,215,255,.55)'; ART.rr(g, -c.hw + 2.5, 11, c.hw * 2 - 5, 7, 1.5); g.fill();
          g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-c.hw + 4, 12, 3, 5); g.fillRect(-c.hw + 9, 12, 1.2, 5);
          g.strokeStyle = '#2a2344'; g.lineWidth = 1; g.beginPath(); g.moveTo(-c.hw + 1, 9.5); g.lineTo(-c.hw + 1, 26); g.moveTo(c.hw - 1, 9.5); g.lineTo(c.hw - 1, 26); g.moveTo(0, 11); g.lineTo(0, 18); g.stroke();
          g.fillStyle = '#ffd23f'; ART.rr(g, -c.hw - 1, 26, c.hw * 2 + 2, 3, 1.2); g.fill(); g.stroke();
          g.strokeStyle = 'rgba(255,210,63,.8)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-c.hw + 1, 20); g.lineTo(c.hw - 1, 20); g.stroke();
          g.restore();
        }
      }
    }
  }
  function drawMist(g) {
    const M = G.mist, b = G.st.mist[M.band], a = M.a;
    const gr = g.createLinearGradient(0, b.y1 - 10, 0, b.y2 + 10);
    gr.addColorStop(0, 'rgba(236,242,255,0)'); gr.addColorStop(0.2, 'rgba(236,242,255,' + (0.9 * a).toFixed(3) + ')'); gr.addColorStop(0.8, 'rgba(236,242,255,' + (0.9 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(236,242,255,0)');
    g.fillStyle = gr; g.fillRect(-20, b.y1 - 10, W + 40, b.y2 - b.y1 + 20);
    g.fillStyle = 'rgba(255,255,255,' + (0.5 * a).toFixed(3) + ')';
    for (let i = 0; i < 9; i++) { const x = ((i * 31 + G.t * 14 * -b.side) % 280 + 280) % 280 - 20; ART.ell(g, x, b.y1 + (i % 3) * 18 + 10, 18, 9); g.fill(); }
  }
  function drawGuns(g) {
    for (let i = 0; i < G.st.mist.length; i++) {
      const b = G.st.mist[i], x = b.side < 0 ? 2 : W - 2, y = (b.y1 + b.y2) / 2, active = G.mist.band === i && G.mist.phase !== 'idle';
      const shake = active && G.mist.phase === 'warn' ? Math.sin(G.t * 60) * 0.6 : 0;
      g.save(); g.translate(x + shake, y); g.scale(b.side, 1); // nozzle points into the screen
      // wall bracket
      g.fillStyle = '#2a2a48'; g.fillRect(-1, -9, 3, 18);
      // fan housing: a stubby cylinder with a grille, tilted slightly up
      g.rotate(-0.12);
      const gr = g.createLinearGradient(0, -7, 0, 7); gr.addColorStop(0, '#9aa6c8'); gr.addColorStop(1, '#4a5578');
      g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
      ART.rr(g, -16, -6.5, 14, 13, 3); g.fill(); g.stroke();
      g.fillStyle = '#20223a'; ART.ell(g, -16, 0, 2.6, 6.2); g.fill();
      g.strokeStyle = 'rgba(200,210,240,.7)'; g.lineWidth = 0.4; g.beginPath(); for (let k = -4; k <= 4; k += 2) { g.moveTo(-17.5, k); g.lineTo(-14.5, k); } g.stroke();
      // warning light: blinks while it winds up, solid while blasting
      const lit = active && (G.mist.phase !== 'warn' || Math.floor(G.t * 10) % 2 === 0);
      g.fillStyle = lit ? '#ff5a3a' : '#5a3040'; ART.ell(g, -8, -7.6, 1.6, 1.4); g.fill();
      if (lit) { g.fillStyle = 'rgba(255,90,60,.35)'; ART.ell(g, -8, -7.6, 4, 4); g.fill(); }
      g.fillStyle = PAL.snow; g.fillRect(-15, -7.4, 12, 1.2);
      g.restore();
    }
  }
  function ticket(g, x, y, on, k, sc) {
    // a little lift ticket: notched pass with a punched hole
    g.save(); g.translate(x, y); g.scale(sc || 1, sc || 1); g.rotate(-0.08 + k * 0.08);
    g.beginPath(); g.moveTo(-15, -6); g.lineTo(15, -6); g.lineTo(15, -2); g.arc(15, 0, 2, -Math.PI / 2, Math.PI / 2, true); g.lineTo(15, 6); g.lineTo(-15, 6); g.lineTo(-15, 2); g.arc(-15, 0, 2, Math.PI / 2, -Math.PI / 2, true); g.closePath();
    g.fillStyle = on ? ['#ffd23f', '#7dffb0', '#8fd3ff', '#ff9a5a', '#ff7aa0'][k] : 'rgba(255,255,255,.12)'; g.fill();
    g.strokeStyle = on ? '#2a1844' : 'rgba(255,255,255,.35)'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = on ? '#2a1844' : 'rgba(255,255,255,.45)'; g.font = '900 5.6px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(TIX_NAMES[k], 0, 0.4);
    g.restore();
  }
  function drawBanner(g) {
    const t = G.banner, k = t > 1.8 ? (2.2 - t) / 0.4 : t < 0.4 ? t / 0.4 : 1, a = clamp(k, 0, 1);
    // lives in the empty sky band above the moose, so it never covers the catwalks you're on
    const bh = G.daily ? 54 : 72;
    g.save(); g.globalAlpha = a; g.translate(W / 2, 38 + (1 - easeOut(a)) * -8);
    g.fillStyle = 'rgba(26,18,58,.86)'; ART.rr(g, -104, -26, 208, bh, 10); g.fill();
    g.strokeStyle = 'rgba(255,210,150,.5)'; g.lineWidth = 0.8; ART.rr(g, -104, -26, 208, bh, 10); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd23f'; g.font = '900 7.5px Nunito, sans-serif'; g.fillText((G.mirror ? 'MIRRORED · ' : '') + (G.daily ? 'DAILY · ' + G.daily.name.toUpperCase() + ' · ' : '') + stageLabel(G.stageIdx, G.loop).toUpperCase() + (G.loop ? '  ·  LOOP ' + (G.loop + 1) : ''), 0, -16);
    g.fillStyle = '#fff'; g.font = '400 14px "Bowlby One", Impact, sans-serif'; g.fillText(G.st.name.toUpperCase(), 0, -3);
    g.fillStyle = '#ffd9c0'; g.font = '800 7.5px Nunito, sans-serif';
    if (G.loop > 0) { g.fillStyle = '#fff'; g.fillText('◆ LAP ' + (G.loop + 1) + ': ' + lapRule(G.loop), 0, 9); g.fillStyle = '#ffd9c0'; }
    else g.fillText(G.daily ? G.daily.desc : G.st.sub, 0, 9);
    if (G.daily) { g.fillStyle = '#ffe27a'; g.fillText('3 maple tokens hide on every stage: bonus points', 0, 19); }
    else {
      const par = parFor(G.st), bt = save.bt[btKey(G.stageIdx, G.mirror)];
      g.fillStyle = '#ffe27a'; g.fillText('PAR ' + Math.floor(par / 60) + ':' + String(par % 60).padStart(2, '0') + ' LEFT' + (bt ? '   ·   BEST TIME ' + fmtT(bt) : '') + '   ·   🍁 ×3', 0, 19);
      const m = save.tix[G.stageIdx] || 0; for (let i = 0; i < 5; i++) ticket(g, -76 + i * 38, 33.5, m & (1 << i), i, 0.58);
    }
    g.restore();
  }
  function drawClear(g) {
    const k = clamp(G.modeT / 0.4, 0, 1);
    // up in the sky band, like the stage banner, so the catwalks stay visible while the bonus counts
    const lm = G.lapMsg, extra = (G.newOutfit && !G.daily ? 11 : 0) + (lm ? 11 : 0);
    const ch2 = (G.daily ? 44 : 90) + extra;
    g.save(); g.translate(W / 2, G.daily ? 176 : 170); g.scale(0.6 + 0.4 * easeOut(k), 0.6 + 0.4 * easeOut(k)); g.globalAlpha = k;
    g.fillStyle = 'rgba(26,18,58,.88)'; ART.rr(g, -96, -28, 192, ch2, 12); g.fill();
    g.strokeStyle = 'rgba(255,210,150,.45)'; g.lineWidth = 0.8; ART.rr(g, -96, -28, 192, ch2, 12); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd23f'; g.font = '400 17px "Bowlby One", Impact, sans-serif'; g.fillText('MADE IT!', 0, -14);
    g.fillStyle = '#fff'; g.font = '900 9px Nunito, sans-serif'; g.fillText('TIME BONUS' + (G.clearMult > 1 ? ' ×' + G.clearMult : '') + '  +' + (G.clearBonus - Math.max(0, G.countLeft)).toLocaleString(), 0, 3);
    let yy = G.daily ? 17 : 16;
    if (!G.daily) {
      const e0 = clamp((G.modeT - 0.45) / 0.2, 0, 1); g.globalAlpha = k * e0;
      g.fillStyle = G.pbNew ? '#7dffb0' : '#ffd9c0'; g.font = '900 8px Nunito, sans-serif';
      g.fillText('TIME ' + fmtT(G.clearTime) + (G.pbNew ? '  ·  NEW BEST TIME!' : G.pbOld ? '  ·  best ' + fmtT(G.pbOld) : '  ·  first clear'), 0, yy);
      g.globalAlpha = k;
      for (let i = 0; i < 5; i++) {
        const at = STAMP_AT(i), e = clamp((G.modeT - at) / 0.18, 0, 1), on = !!(G.tixGot & (1 << i)), isNew = !!(G.tixNew & (1 << i)), tx = -74 + i * 37, ty = 41;
        const sc = e <= 0 ? 0 : on ? 1.9 - 0.9 * easeOut(e) : 1; // earned tickets slam down; missed ones just appear
        if (e <= 0) { ticket(g, tx, ty, false, i, 0.78); continue; }
        ticket(g, tx, ty, on, i, sc * 0.78);
        if (isNew && e >= 1) { g.fillStyle = '#ff7a5a'; g.font = '900 6px Nunito, sans-serif'; g.fillText('NEW!', tx + 8, 29 - Math.abs(Math.sin(G.t * 6)) * 1.5); }
      }
      yy = 58;
    } else yy = 31;
    if (G.newOutfit && !G.daily && G.modeT > 1.7) {
      const e = clamp((G.modeT - 1.7) / 0.25, 0, 1);
      g.globalAlpha = k * e; g.fillStyle = PAL.jacketL; g.font = '900 7.5px Nunito, sans-serif';
      g.fillText('NEW OUTFIT UNLOCKED: ' + G.newOutfit.toUpperCase(), 0, yy - (1 - easeOut(e)) * 4); yy += 11;
    }
    if (lm && G.modeT > 1.0) {
      const e = clamp((G.modeT - 1.0) / 0.25, 0, 1);
      g.globalAlpha = k * e; g.fillStyle = lm.rec && lm.valid ? '#7dffb0' : '#8fe3ff'; g.font = '900 7.5px Nunito, sans-serif';
      g.fillText('LAP DONE ' + fmtT(lm.time) + '  +' + lm.bonus.toLocaleString() + (lm.valid ? (lm.rec ? (lm.old ? '  ·  NEW LAP RECORD!' : '  ·  LAP RECORD SET') : '  ·  best ' + fmtT(lm.old)) : ''), 0, yy - (1 - easeOut(e)) * 4);
    }
    g.restore();
  }

  // goal chips under the clock: what's still on the table this climb (par pace, no fall, maple tokens)
  function drawGoals(g, y) {
    if (G.mode === 'title' || G.mode === 'over' || (G.banner > 0.2 && G.mode === 'play')) return;
    const xr = cw - insets.r - 56, yc = y + 46, par = parFor(G.st);
    g.font = '900 9px Nunito, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const chips = [];
    if (!G.daily) {
      const onPar = G.timeLeft >= par || G.mode === 'clear' && (G.tixGot & 2);
      chips.push({ t: 'SPEEDY ≥' + Math.floor(par / 60) + ':' + String(par % 60).padStart(2, '0'), on: onPar, hot: onPar && G.timeLeft - par < 4 && G.mode === 'play' });
      chips.push({ t: 'NO FALL', on: G.stageFalls === 0 });
    }
    chips.push({ t: G.tokN + '/3', on: G.tokN >= 3, leaf: true, prog: G.tokN > 0 });
    let w = 0; for (const c of chips) { c.w = g.measureText(c.t).width + 12 + (c.leaf ? 10 : 0); w += c.w + 4; }
    let x = xr - w + 4;
    if (G.loop > 0) { // the newest lap rule, always on screen: beside the boots if it fits, else on its own row
      const t = lapChip(G.loop), lw = g.measureText(t).width + 12, lx2 = insets.l + 10 + 104 - 4, fits = lx2 + lw < x - 3, ly = fits ? yc : yc + 19;
      g.fillStyle = 'rgba(16,14,32,.9)'; ART.rr(g, fits ? lx2 : cw - insets.r - 56 - lw, ly - 8, lw, 16, 8); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; ART.rr(g, fits ? lx2 : cw - insets.r - 56 - lw, ly - 8, lw, 16, 8); g.stroke();
      g.fillStyle = '#fff'; g.fillText(t, (fits ? lx2 : cw - insets.r - 56 - lw) + 6, ly + 0.5);
    }
    for (const c of chips) {
      const lit = c.on && (!c.leaf || c.on), flash = c.hot && Math.floor(G.t * 6) % 2 === 0;
      g.fillStyle = c.leaf && c.prog && !c.on ? 'rgba(120,70,20,.85)' : lit ? (flash ? 'rgba(255,255,255,.95)' : 'rgba(255,210,63,.95)') : 'rgba(40,24,80,.72)';
      ART.rr(g, x, yc - 8, c.w, 16, 8); g.fill();
      g.strokeStyle = lit ? 'rgba(42,18,6,.5)' : 'rgba(255,255,255,.18)'; g.lineWidth = 1; ART.rr(g, x, yc - 8, c.w, 16, 8); g.stroke();
      let tx = x + 6;
      if (c.leaf) { g.save(); g.translate(x + 11, yc); g.scale(0.62, 0.62); ART.mapleLeaf(g, lit ? '#a8301f' : '#ff9a3a'); g.restore(); tx = x + 19; }
      g.fillStyle = lit ? '#2a1206' : c.leaf && c.prog ? '#ffe9c0' : 'rgba(255,255,255,.45)';
      g.fillText(c.t, tx, yc + 0.5);
      if (!lit && !c.leaf) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tx - 1, yc + 0.5); g.lineTo(tx + c.w - 12 + 1, yc + 0.5); g.stroke(); }
      x += c.w + 4;
    }
    g.textBaseline = 'alphabetic';
  }

  function drawHUD(g, dk) {
    const sc = dpr; g.setTransform(sc, 0, 0, sc, 0, 0);
    if (G.mode === 'title') return;
    const y = hudY, x0 = insets.l + 10, wHud = cw - insets.l - insets.r;
    // backing strip
    const gr = g.createLinearGradient(0, 0, 0, y + hudH + 6); gr.addColorStop(0, 'rgba(12,8,30,.75)'); gr.addColorStop(1, 'rgba(12,8,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, cw, y + hudH + 6);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#cdb8ec'; g.font = '900 11px Nunito, sans-serif'; g.fillText('POINTS', x0, y + 13);
    g.fillStyle = '#fff'; g.font = '400 19px "Bowlby One", Impact, sans-serif'; g.fillText(G.score.toLocaleString(), x0, y + 34);
    // lives as little boots
    const lx = x0 + 104;
    g.fillStyle = '#cdb8ec'; g.font = '900 11px Nunito, sans-serif'; g.fillText(stageLabel(G.stageIdx, G.loop).toUpperCase(), lx, y + 13);
    for (let i = 0; i < Math.min(G.lives, 6); i++) { g.save(); g.translate(lx + 6 + i * 13, y + 31); g.scale(1.3, 1.3); g.fillStyle = PAL.boot; g.strokeStyle = PAL.ink; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3, -6); g.lineTo(2, -6); g.lineTo(2.4, -2.5); g.lineTo(4.6, -2); g.quadraticCurveTo(5.2, 0, 4, 0); g.lineTo(-3.4, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    // streak chip under the score: grows and pulses, and shows the multiplier you're earning
    if (G.streak >= 2 && (G.mode === 'play' || G.mode === 'clear')) {
      const n = G.streak, m = streakMult(), pulse = G.streakPulse > 0 ? G.streakPulse : 0, sc = 1 + Math.min(n, 12) * 0.018 + pulse * 0.2;
      const label = 'STREAK ' + n + (m > 1 ? '  ×' + m : ''); g.font = '400 11px "Bowlby One", Impact, sans-serif';
      const cw2 = Math.max(88, g.measureText(label).width + 22);
      g.save(); g.translate(x0 + (cw2 / 2) * sc, y + hudH + 14); g.scale(sc, sc);
      g.fillStyle = m >= 4 ? 'rgba(255,90,60,.92)' : m >= 2 ? 'rgba(255,140,30,.92)' : 'rgba(255,200,70,.88)'; ART.rr(g, -cw2 / 2, -10, cw2, 22, 11); g.fill();
      g.strokeStyle = 'rgba(42,18,6,.55)'; g.lineWidth = 1.2; ART.rr(g, -cw2 / 2, -10, cw2, 22, 11); g.stroke();
      g.fillStyle = '#2a1206'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 0);
      if (decayOn() && m > 1) { const f = clamp(G.streakT / decayTime(), 0, 1), warn = f < 0.3 && Math.floor(G.t * 8) % 2 === 0, bw = cw2 - 20; g.fillStyle = 'rgba(30,10,4,.45)'; ART.rr(g, -bw / 2, 6, bw, 4, 2); g.fill(); g.fillStyle = warn ? '#fff' : '#2a1206'; ART.rr(g, -bw / 2, 6, Math.max(3, bw * f), 4, 2); g.fill(); }
      g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    // lift-closing clock: a pill with a little dial that sweeps down
    const tl = G.mode === 'clear' ? Math.ceil(G.timeLeft) : Math.ceil(G.timeLeft), low = tl <= 10 && G.mode === 'play';
    const pw = 126, px = cw - insets.r - 56 - pw, pcy = y + 19;
    const flash = low && Math.floor(G.t * 4) % 2 === 0;
    g.fillStyle = flash ? 'rgba(255,90,60,.92)' : 'rgba(40,24,80,.8)'; ART.rr(g, px, pcy - 17, pw, 34, 17); g.fill();
    // dial
    const dcx = px + 17, frac = G.timeMax ? G.timeLeft / G.timeMax : 1;
    g.fillStyle = '#fff6de'; ART.ell(g, dcx, pcy, 12, 12); g.fill();
    g.fillStyle = low ? '#ff5a3a' : '#ffb21f'; g.beginPath(); g.moveTo(dcx, pcy); g.arc(dcx, pcy, 10, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.closePath(); g.fill();
    g.strokeStyle = PAL.ink; g.lineWidth = 1.4; ART.ell(g, dcx, pcy, 12, 12); g.stroke();
    g.textAlign = 'left'; g.fillStyle = low ? '#fff' : '#ffd9c0'; g.font = '900 9.5px Nunito, sans-serif'; g.fillText('LIFT CLOSES', px + 35, pcy - 4);
    g.fillStyle = '#fff'; g.font = '400 16px "Bowlby One", Impact, sans-serif'; g.fillText(Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0'), px + 35, pcy + 13);
    if (G.mode === 'play' || G.mode === 'dying') { const bm = streakMult(); g.textAlign = 'right'; g.fillStyle = bm > 1 ? '#ffd23f' : 'rgba(255,217,192,.8)'; g.font = '900 9px Nunito, sans-serif'; g.fillText('+' + TIME_PTS * bm + '/s', px + pw - 8, pcy + 12); g.textAlign = 'left'; }
    drawGoals(g, y);
    // wind indicator
    if (G.wind && G.wind.phase !== 'idle' && G.mode === 'play') {
      const d = G.wind.dir, a = G.wind.phase === 'warn' ? 0.5 + 0.5 * Math.sin(G.t * 14) : 1;
      g.globalAlpha = a; g.fillStyle = '#bfe9ff'; g.font = '900 11px Nunito, sans-serif'; g.textAlign = 'center';
      g.fillText(d > 0 ? 'WIND →' : '← WIND', cw / 2, y + hudH + 32); g.globalAlpha = 1;
    }
    if (G.p && G.p.poles > 0 && G.mode === 'play') {
      const f = G.p.poles / (POLES_TIME * (G.mod.poles || 1)), w = 70, x = cw / 2 - w / 2, yy = y + hudH + (G.wind && G.wind.phase !== 'idle' ? 38 : 22);
      g.fillStyle = 'rgba(20,10,40,.7)'; ART.rr(g, x, yy, w, 7, 3.5); g.fill();
      g.fillStyle = f < 0.27 && Math.floor(G.t * 8) % 2 ? '#fff' : '#ff6b8a'; ART.rr(g, x + 1, yy + 1, (w - 2) * f, 5, 2.5); g.fill();
    }
    jumpEl.classList.toggle('poles', !!(G.p && G.p.poles > 0));
  }

  // the moose has the last laugh on the game-over card (or sulks when you set a new best)
  const ovC = $('ovMoose'), ovG = ovC.getContext('2d');
  function drawOverMoose(dt) {
    if (G.mode !== 'over' || $('over').hidden) return;
    G.overT = (G.overT || 0) + dt;
    const w = ovC.clientWidth || 150, h = ovC.clientHeight || 78, d = Math.min(window.devicePixelRatio || 1, 2);
    if (ovC.width !== Math.round(w * d)) { ovC.width = Math.round(w * d); ovC.height = Math.round(h * d); }
    ovG.setTransform(1, 0, 0, 1, 0, 0); ovG.clearRect(0, 0, ovC.width, ovC.height);
    const sc = h / 58 * d; ovG.setTransform(sc, 0, 0, sc, ovC.width / 2, ovC.height - 3 * sc);
    const best = $('ovBest').classList.contains('yes'), st = best ? 'sulk' : 'laugh';
    ovG.fillStyle = 'rgba(0,0,0,.25)'; ART.ell(ovG, 0, 0, 22, 2.5); ovG.fill();
    ART.drawMoose(ovG, { x: 0, y: 0, face: -1, state: st, k: G.overT % 1.2, t: G.t, blink: false });
  }
  function renderTitle() { /* title is a live attract scene; drawn by render() */ }

  // ---------------------------------------------------------------- UI wiring
  function syncToggles() {
    for (const id of ['togglesTitle', 'togglesPause']) {
      const el = $(id); el.innerHTML = '';
      const mk = (label, on, fn) => { const b = document.createElement('button'); b.className = 'tg' + (on ? ' on' : ''); b.textContent = label + (on ? ' on' : ' off'); b.onclick = () => { A.unlock(); fn(); A.click(); syncToggles(); }; el.appendChild(b); };
      mk('Sound', A.sound, () => { save.sound = A.sound = !A.sound; persist(); A.applyMusic(); });
      mk('Music', A.music, () => { save.music = A.music = !A.music; persist(); A.applyMusic(); });
      if (id === 'togglesTitle') {
        const n = unlockedOutfits(), nx = OUTFITS[n], o = document.createElement('button'); o.className = 'tg outfit';
        o.innerHTML = '<i style="background:' + OUTFITS[save.outfit || 0].c.jacket + ';border-color:' + OUTFITS[save.outfit || 0].c.hat + '"></i>' + OUTFITS[save.outfit || 0].name + (n > 1 ? ' ▸' : '');
        o.title = nx ? 'Next outfit at ' + nx.need + ' lift tickets' : 'All outfits unlocked';
        o.onclick = () => { A.unlock(); wearOutfit(((save.outfit || 0) + 1) % n); persist(); A.click(); syncToggles(); };
        el.appendChild(o);
        if (nx) { const h = document.createElement('div'); h.className = 'nextfit'; h.textContent = 'Next outfit: ' + nx.name + ' at ' + nx.need + ' 🎟'; el.appendChild(h); }
      }
    }
    const tt = totalTix();
    $('bestLine').textContent = (save.best > 0 ? 'BEST ' + save.best.toLocaleString() : '') + (tt > 0 ? (save.best > 0 ? '   ·   ' : '') + '🎟 ' + tt + ' / ' + TIX_MAX : '') + (save.laps > 0 ? '   ·   ◆ ' + save.laps + (save.laps > 1 ? ' laps' : ' lap') : '');
    const dm = todayMod(), db = dailyBest(), sk = streakNow();
    $('dailyLine').textContent = dm.name + (dm.mirror ? ' · mirrored' : '') + (db > 0 ? ' · best ' + db.toLocaleString() + (save.dDay === dayKey() && save.dMed ? ' ' + DMED_ICON[save.dMed] : '') : ' · ' + dm.desc) + (sk > 0 ? ' · 🔥' + sk : '');
    const sp = $('stagePick'); sp.innerHTML = '';
    if (save.reached > 1) {
      const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = 'Start at stage'; sp.appendChild(lab);
      for (let i = 0; i < save.reached; i++) {
        const b = document.createElement('button'); b.className = 'sp' + (G.startStage === i ? ' sel' : ''); b.textContent = i + 1; b.title = STAGES[i].name;
        const m = save.tix[i] || 0, tk = document.createElement('span'); tk.className = 'tk'; tk.innerHTML = [1, 2, 4, 8, 16].map((bit) => '<i class="' + (m & bit ? 'on' : '') + '">●</i>').join(''); b.appendChild(tk);
        b.onclick = () => { G.startStage = i; A.unlock(); A.click(); syncToggles(); }; sp.appendChild(b);
      }
    }
    if (save.laps > 0) {
      const b = document.createElement('button'); b.className = 'sp dia' + (G.pickLoop ? ' sel' : ''); b.textContent = '◆'; b.title = 'Black Diamond lap: faster, mirrored, gold barrels';
      b.onclick = () => { G.pickLoop = G.pickLoop ? 0 : 1; A.unlock(); A.click(); syncToggles(); }; sp.appendChild(b);
    }
    const si = $('stageInfo');
    if (si) {
      const i = Math.min(G.startStage, save.reached - 1), m = save.tix[i] || 0, pb = save.bt[btKey(i, G.pickLoop % 2 === 1)];
      if (save.reached > 1 || totalTix() > 0) si.textContent = G.pickLoop ? '◆ BLACK DIAMOND · from stage ' + (i + 1) + ' · faster, mirrored, gold barrels' + (save.lap[1] ? ' · best lap ' + fmtT(save.lap[1]) : '') : STAGES[i].name + ' · 🎟 ' + tixCount(m) + '/5' + (pb ? ' · best ' + fmtT(pb) : '') + (i === 0 && save.lap[0] ? ' · best lap ' + fmtT(save.lap[0]) : '');
      else si.textContent = '';
    }
  }
  $('btnPlay').onclick = () => startGame(G.startStage, false, G.pickLoop);
  $('btnDaily').onclick = () => startGame(0, true);
  $('btnResume').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); resumeGame(); }); // works with another finger held
  $('btnResume').onclick = resumeGame;
  $('btnRestart').onclick = () => { startGame(G.startStage, !!G.daily, G.runLoop); };
  $('btnQuit').onclick = () => { toTitle(); syncToggles(); };
  $('btnAgain').onclick = () => startGame(G.startStage, !!G.daily, G.runLoop);
  $('btnShare').onclick = () => { const b = $('btnShare'); A.unlock(); A.click(); try { navigator.clipboard.writeText(G.shareText).then(() => { b.textContent = 'Copied!'; }, () => { b.textContent = 'Copy not allowed'; }); } catch (e) { b.textContent = 'Copy not allowed'; } };
  $('btnMenu').onclick = () => { toTitle(); syncToggles(); };
  $('pauseBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); pauseGame(); }); // works with another finger held
  $('pauseBtn').onclick = (e) => { e.stopPropagation(); if (e.detail === 0) pauseGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.mode === 'play') pauseGame(); A.suspend(); clearInputs(); } else if (G.mode !== 'paused') A.resume(); });

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0, manual = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (manual) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (G.mode !== 'paused') { acc += dt; while (acc >= DT) { step(DT); acc -= DT; } }
    render(acc / DT); drawOverMoose(dt);
  }

  // ---------------------------------------------------------------- test hooks
  window.__T = {
    noPause: false,
    start(i, loop) { startGame(i || 0, false, loop || 0); return this.state(); },
    step(ms) { manual = true; const n = Math.round((ms || 16) / (DT * 1000)); for (let i = 0; i < n; i++) step(DT); render(0); return this.state(); },
    realtime() { manual = false; last = performance.now(); },
    keys(o) { Object.assign(kb, { l: 0, r: 0, u: 0, d: 0 }, o || {}); },
    jump() { pressJump(); },
    god(v) { G.god = v !== false; },
    noBarrels(v) { G.noBarrels = v !== false; G.barrels = []; },
    seed(n) { rng = mulberry(n); G.testSeed = true; },
    daily(on) { startGame(0, on !== false); return this.state(); },
    mirror(on) { G.forceMirror = on !== false; },
    todayMod, parFor, medalOf, fmtT,
    setTime(s) { G.timeLeft = s; },
    G, bot, inp,
    state() {
      const p = G.p;
      return { mode: G.mode, stage: G.stageIdx, loop: G.loop, score: G.score, lives: G.lives, time: +G.timeLeft.toFixed(1), barrels: G.barrels.length,
        p: p && { x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), ground: !!p.ground, mover: !!p.mover, climb: !!p.climb, poles: +p.poles.toFixed(2), state: p.state },
        moose: G.moose && { x: +G.moose.x.toFixed(1), mode: G.moose.mode }, dbg: G.dbg, streak: G.streak, boardB: G.boardB, toks: G.tokN, nToks: G.toks.length, lapT: +G.lapT.toFixed(1) };
    },
    platforms() { return G.plats.map((p) => [p.x1, p.y1, p.x2, p.y2, p.f]); },
    ladders() { return G.ladders.map((l) => [l.x, +l.top.toFixed(1), +l.bot.toFixed(1)]); },
    toScreen(x, y) { return { x: OX + x * S, y: OY + y * S, S }; },
    stepFrames(n) { for (let i = 0; i < n; i++) step(DT); }
  };

  // ---------------------------------------------------------------- boot
  seedScenery();
  layout();
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); layout(); }
  toTitle();
  syncToggles();
  document.fonts && document.fonts.ready.then(() => { G.bgDirty = true; });
  requestAnimationFrame(frame);
})();
