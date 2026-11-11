/* Chairlift Climb — WebAudio synth sound effects + light music. All sounds are synthesized here. */
(function () {
  'use strict';
  const A = (window.CC_AUDIO = {});
  let ctx = null, master = null, sfxG = null, musG = null, rumbleG = null, windG = null, noiseBuf = null;
  A.sound = true; A.music = true; A.muted = false;
  let musicTimer = null, nextNoteT = 0;

  A.unlock = function () {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
        sfxG = ctx.createGain(); sfxG.connect(master);
        musG = ctx.createGain(); musG.gain.value = 0.42; musG.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // continuous barrel rumble: brown-ish noise through a low-pass, gain driven by the game
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 2.5;
        rumbleG = ctx.createGain(); rumbleG.gain.value = 0;
        src.connect(lp); lp.connect(rumbleG); rumbleG.connect(sfxG); src.start();
        const src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true; src2.playbackRate.value = 0.7;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
        windG = ctx.createGain(); windG.gain.value = 0;
        src2.connect(bp); bp.connect(windG); windG.connect(sfxG); src2.start();
      }
      if (ctx.state !== 'running') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
      A.applyMusic();
    } catch (e) {}
  };
  A.suspend = function () { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) {} };
  A.resume = function () { try { if (ctx && ctx.state !== 'running') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } } catch (e) {} };
  function ok() { return ctx && A.sound && !A.muted && ctx.state === 'running'; }

  function osc(type, f0, f1, t0, dur, vol, dest, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const at = attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxG); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function noise(t0, dur, vol, type, freq, q, dest, f1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxG); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  A.jump = function () { if (!ok()) return; const t = ctx.currentTime; osc('square', 300, 620, t, 0.12, 0.06); osc('triangle', 600, 1100, t, 0.1, 0.06); };
  A.land = function (s) { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.08, 0.12 * (s || 1), 'lowpass', 900, 1); osc('sine', 120, 70, t, 0.08, 0.12 * (s || 1)); };
  A.step = function (i) { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.04, 0.05, 'bandpass', i ? 2400 : 1900, 2.5); };
  A.climb = function (i) { if (!ok()) return; const t = ctx.currentTime; osc('triangle', i ? 330 : 280, i ? 300 : 250, t, 0.05, 0.05); noise(t, 0.03, 0.04, 'highpass', 3000, 1); };
  A.clear = function (n, streak) { // jumped a barrel
    if (!ok()) return; const t = ctx.currentTime, p = Math.pow(1.06, Math.min(streak || 0, 16)) * (1 + (n - 1) * 0.25);
    osc('triangle', 784 * p, 784 * p, t, 0.09, 0.14); osc('triangle', 1175 * p, 1175 * p, t + 0.07, 0.16, 0.14);
    osc('sine', 1568 * p, 1568 * p, t + 0.07, 0.2, 0.05);
  };
  A.smash = function () {
    if (!ok()) return; const t = ctx.currentTime;
    noise(t, 0.18, 0.4, 'bandpass', 1200, 0.8, sfxG, 400); osc('square', 180, 60, t, 0.14, 0.12);
    for (let i = 0; i < 3; i++) noise(t + 0.03 + i * 0.03, 0.04, 0.18, 'highpass', 2500 + i * 700, 1);
  };
  A.poof = function () { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.22, 0.25, 'highpass', 1500, 0.7, sfxG, 5000); };
  A.thump = function (v) { if (!ok()) return; const t = ctx.currentTime; osc('sine', 110, 50, t, 0.14, 0.18 * (v || 1)); noise(t, 0.06, 0.1 * (v || 1), 'lowpass', 600, 1); };
  A.stomp = function () { if (!ok()) return; const t = ctx.currentTime; osc('sine', 80, 38, t, 0.25, 0.4); noise(t, 0.12, 0.22, 'lowpass', 500, 1); };
  A.moose = function (hi) { // a goofy bellow/chuckle
    if (!ok()) return; const t = ctx.currentTime;
    const f = hi ? 160 : 110;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.15); lp.frequency.linearRampToValueAtTime(400, t + 0.5); lp.Q.value = 6; lp.connect(sfxG);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18); o.frequency.linearRampToValueAtTime(f * 0.8, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.04); g.gain.setValueAtTime(0.16, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + 0.6);
  };
  A.laugh = function () { if (!ok()) return; for (let i = 0; i < 3; i++) setTimeout(() => A.moose(true), i * 170); };
  A.hit = function () { // comic: bonk + slide whistle down
    if (!ok()) return; const t = ctx.currentTime;
    osc('square', 520, 140, t, 0.12, 0.12); noise(t, 0.08, 0.25, 'bandpass', 900, 1.5);
    osc('sine', 1400, 300, t + 0.12, 0.6, 0.12, sfxG, 0.02);
  };
  A.boing = function () { if (!ok()) return; const t = ctx.currentTime; osc('sine', 180, 520, t, 0.16, 0.12); };
  A.poles = function () { if (!ok()) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => osc('square', f, f, t + i * 0.06, 0.1, 0.07)); };
  A.swish = function () { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.09, 0.08, 'bandpass', 1800, 2, sfxG, 4000); };
  A.tick = function (hi) { if (!ok()) return; osc('square', hi ? 1320 : 990, hi ? 1320 : 990, ctx.currentTime, 0.05, 0.05); };
  A.whistle = function () { if (!ok()) return; const t = ctx.currentTime; osc('sine', 1800, 2400, t, 0.12, 0.06); osc('sine', 2400, 1700, t + 0.13, 0.14, 0.06); };
  A.clack = function () { if (!ok()) return; const t = ctx.currentTime; osc('square', 210, 160, t, 0.05, 0.05); osc('square', 180, 140, t + 0.07, 0.05, 0.04); };
  A.hiss = function (dur) { if (!ok()) return; const t = ctx.currentTime; noise(t, dur || 1.4, 0.18, 'highpass', 2500, 0.6); };
  A.sputter = function () { if (!ok()) return; const t = ctx.currentTime; for (let i = 0; i < 4; i++) noise(t + i * 0.12, 0.05, 0.1, 'highpass', 3000, 1); };
  A.oneUp = function () { if (!ok()) return; const t = ctx.currentTime; [659, 784, 988, 1319, 1568].forEach((f, i) => osc('triangle', f, f, t + i * 0.07, 0.14, 0.12)); };
  A.click = function () { if (!ok()) return; osc('triangle', 520, 780, ctx.currentTime, 0.07, 0.12); };
  A.stageClear = function () {
    if (!ok()) return; const t = ctx.currentTime;
    const seq = [392, 494, 587, 523, 659, 784, 988];
    seq.forEach((f, i) => osc('triangle', f, f, t + i * 0.1, i === seq.length - 1 ? 0.6 : 0.16, 0.16));
    osc('sine', 196, 196, t + 0.6, 0.6, 0.12);
  };
  A.count = function (i) { if (!ok()) return; const f = 880 + (i % 6) * 40; osc('square', f, f, ctx.currentTime, 0.03, 0.035); };
  A.closed = function () { if (!ok()) return; const t = ctx.currentTime; [440, 415, 392, 330].forEach((f, i) => osc('square', f, f * 0.98, t + i * 0.18, 0.2, 0.08)); };
  A.gameOver = function () {
    if (!ok()) return; const t = ctx.currentTime;
    [523, 466, 415, 392, 311].forEach((f, i) => osc('triangle', f, f * 0.98, t + i * 0.22, i === 4 ? 0.9 : 0.26, 0.18));
  };
  A.start = function () { if (!ok()) return; const t = ctx.currentTime; [330, 392, 523].forEach((f, i) => osc('triangle', f, f, t + i * 0.08, 0.14, 0.14)); };

  // lift ticket stamped onto the clear card: a punchy clack, brighter + a chime when it's a new one
  A.stamp = function (k, isNew) {
    if (!ok()) return; const t = ctx.currentTime, f = [660, 784, 988, 1175, 1319][k] || 660;
    noise(t, 0.05, 0.3, 'bandpass', 1500, 1.2); osc('square', 220, 110, t, 0.06, 0.08);
    osc('triangle', f, f, t + 0.02, 0.18, 0.13); if (isNew) { osc('triangle', f * 1.5, f * 1.5, t + 0.1, 0.24, 0.11); osc('sine', f * 3, f * 3, t + 0.1, 0.3, 0.04); }
  };
  // maple token: a bright two-note pluck, higher with each one you collect on the stage
  A.token = function (n) {
    if (!ok()) return; const t = ctx.currentTime, f = 880 * Math.pow(1.1225, (n || 1) - 1);
    osc('triangle', f, f, t, 0.1, 0.13); osc('triangle', f * 1.5, f * 1.5, t + 0.06, 0.16, 0.12); osc('sine', f * 3, f * 3, t + 0.06, 0.2, 0.04);
    if (n >= 3) [1, 1.26, 1.5, 2].forEach((r, i) => osc('triangle', f * r, f * r, t + 0.16 + i * 0.06, 0.14, 0.1));
  };
  // gold barrel tell: a quick rising zip as the moose winds up
  A.streakDrop = function () { if (!ok()) return; const t = ctx.currentTime; [659, 523, 392].forEach((f, i) => osc('triangle', f, f * 0.97, t + i * 0.07, 0.12, 0.08)); };
  A.zip = function () { if (!ok()) return; const t = ctx.currentTime; osc('sawtooth', 500, 1900, t, 0.3, 0.035); osc('sine', 1000, 2600, t + 0.05, 0.28, 0.05); };
  A.musicFromTop = function () { bar = 0; };
  A.rattle = function (v) { if (!ok()) return; const t = ctx.currentTime; for (let i = 0; i < 5; i++) { noise(t + i * 0.07, 0.04, 0.16 * (v || 1), 'bandpass', 1300 + (i % 2) * 400, 3); } osc('square', 220, 200, t, 0.3, 0.03 * (v || 1)); };
  A.streakUp = function (m) {
    if (!ok()) return; const t = ctx.currentTime, base = 523 * Math.pow(1.122, m - 2);
    [1, 1.26, 1.5, 2].forEach((r, i) => osc('square', base * r, base * r, t + i * 0.05, 0.12, 0.06));
    osc('triangle', base * 2, base * 2, t + 0.2, 0.35, 0.09);
  };
  A.whoosh = function () { if (!ok()) return; noise(ctx.currentTime, 0.16, 0.12, 'bandpass', 900, 1.4, sfxG, 3200); };
  A.setRumble = function (v) { if (rumbleG && ctx) rumbleG.gain.setTargetAtTime(ok() ? Math.min(0.5, v) : 0, ctx.currentTime, 0.08); };
  A.setWind = function (v) { if (windG && ctx) windG.gain.setTargetAtTime(ok() ? Math.min(0.3, v) : 0, ctx.currentTime, 0.15); };

  // ---- music: an original 16-bar lodge waltz in G (3/4). Bass on 1, chord "pah-pah" on 2 and 3,
  // a bell-ish melody on top. When the lift clock runs low (A.intensity = 1) a sleigh-bell shaker joins
  // and the tempo nudges up. Composed for this game; not based on any existing tune.
  const N = { G3: 196, A3: 220, B3: 247, C4: 262, D4: 294, E4: 330, Fs4: 370, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, Fs5: 740, G5: 784, A5: 880, B5: 988 };
  const CHORD = { G: ['G3', 'B3', 'D4'], C: ['C4', 'E4', 'G4'], D: ['D4', 'Fs4', 'A4'], Em: ['E4', 'G4', 'B4'], Am: ['A3', 'C4', 'E4'] };
  const BARS = ['G', 'G', 'C', 'G', 'D', 'D', 'G', 'D', 'Em', 'C', 'G', 'D', 'C', 'G', 'D', 'G'];
  // melody: [note, beats] per bar (3 beats each); null = rest
  const MEL = [
    [['B4', 1], ['D5', 1], ['G5', 1]], [['Fs5', 1], ['E5', 1], ['D5', 1]], [['E5', 2], ['C5', 1]], [['D5', 3]],
    [['A4', 1], ['D5', 1], ['Fs5', 1]], [['A5', 2], ['Fs5', 1]], [['G5', 1], ['Fs5', 1], ['E5', 1]], [['D5', 2], [null, 1]],
    [['E5', 1], ['G5', 1], ['B5', 1]], [['A5', 2], ['G5', 1]], [['G5', 1], ['D5', 1], ['B4', 1]], [['A4', 2], ['D5', 1]],
    [['E5', 1], ['C5', 1], ['E5', 1]], [['D5', 1], ['B4', 1], ['G4', 1]], [['A4', 1], ['D5', 1], ['C5', 1]], [['B4', 2], ['G4', 1]]
  ];
  // B section (minor-leaning bridge) so the loop runs A A B A, about 90 seconds before it repeats
  const BARS_B = ['Em', 'Em', 'C', 'G', 'Am', 'D', 'G', 'G', 'Em', 'C', 'G', 'D', 'Am', 'D', 'G', 'G'];
  const MEL_B = [
    [['G5', 1], ['Fs5', 1], ['E5', 1]], [['B4', 2], ['E5', 1]], [['G5', 1], ['E5', 1], ['C5', 1]], [['D5', 3]],
    [['C5', 1], ['E5', 1], ['A5', 1]], [['Fs5', 2], ['D5', 1]], [['B4', 1], ['D5', 1], ['G5', 1]], [['G5', 2], [null, 1]],
    [['E5', 1], ['B4', 1], ['E5', 1]], [['G5', 2], ['E5', 1]], [['D5', 1], ['G5', 1], ['B5', 1]], [['A5', 2], ['Fs5', 1]],
    [['E5', 1], ['A5', 1], ['G5', 1]], [['Fs5', 1], ['E5', 1], ['D5', 1]], [['B4', 1], ['A4', 1], ['B4', 1]], [['G4', 3]]
  ];
  A.intensity = 0; A.key = 1;
  let bar = 0;
  function bell(f, t, dur, vol) { f *= A.key; osc('triangle', f, f, t, dur, vol, musG, 0.008); osc('sine', f * 2, f * 2, t, Math.min(dur, 0.25), vol * 0.35, musG, 0.004); }
  function scheduleMusic() {
    if (!ctx || !A.music || !A.sound || A.muted || ctx.state !== 'running') { nextNoteT = ctx ? ctx.currentTime + 0.1 : 0; return; }
    const spb = 60 / (A.intensity ? 150 : 132);
    while (nextNoteT < ctx.currentTime + 0.3) {
      const sec = ((bar / 16) | 0) % 4, isB = sec === 2, ch = CHORD[(isB ? BARS_B : BARS)[bar % 16]], t0 = nextNoteT;
      // oom-pah-pah
      const kk = A.key; osc('triangle', N[ch[0]] / 2 * kk, N[ch[0]] / 2 * kk, t0, spb * 0.9, 0.085, musG, 0.01);
      for (const k of [1, 2]) { const t = t0 + k * spb; osc('triangle', N[ch[1]] * kk, N[ch[1]] * kk, t, spb * 0.35, 0.026, musG, 0.004); osc('triangle', N[ch[2]] * kk, N[ch[2]] * kk, t, spb * 0.35, 0.022, musG, 0.004); }
      // melody (every other pass an octave-down echo keeps it from getting shrill)
      let bt = 0; for (const [n, d] of (isB ? MEL_B : MEL)[bar % 16]) { if (n) bell(N[n] * (sec === 1 ? 0.5 : 1), t0 + bt * spb, spb * d * 0.92, isB ? 0.045 : 0.05); bt += d; }
      // sleigh bells when the clock is low
      if (A.intensity) for (let k = 0; k < 6; k++) noise(t0 + k * spb / 2, 0.05, k % 2 ? 0.025 : 0.04, 'highpass', 6500, 1.2, musG);
      bar++; nextNoteT += 3 * spb;
    }
  }
  A.applyMusic = function () {
    if (!ctx) return;
    if (A.music && A.sound && !musicTimer) { nextNoteT = ctx.currentTime + 0.1; musicTimer = setInterval(scheduleMusic, 60); }
    if ((!A.music || !A.sound) && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  };
  A.duck = function (on) { if (musG && ctx) musG.gain.setTargetAtTime(on ? 0.1 : 0.42, ctx.currentTime, 0.1); };
})();
