/* Chairlift Climb — code-drawn art (stand-in until painted PNGs arrive).
   Every function draws in world units into a context already transformed to the world.
   ASSETS: drop a PNG path into src to replace the code-drawn version of that key. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const ASSETS = {
    skier: { src: null, w: 20, h: 24 },     // painted sprite sheet could replace the code skier
    moose: { src: null, w: 56, h: 50 },
    barrel: { src: null, w: 12, h: 12 },
    snowball: { src: null, w: 12, h: 12 },
    goldBarrel: { src: null, w: 12, h: 12 }, // fast gold barrel
    token: { src: null, w: 14, h: 14 },     // maple token pickup
    lodge: { src: null, w: 40, h: 34 },
    backdrop: { src: null, w: 240, h: 330 }, // painted mountain backdrop (sky drawn separately)
    title: { src: null, w: 390, h: 844 }
  };
  for (const k in ASSETS) {
    const a = ASSETS[k];
    if (a.src) { a.img = new Image(); a.img.onload = () => { a.ready = true; }; a.img.src = a.src; }
  }
  function asset(k) { const a = ASSETS[k]; return a && a.ready ? a.img : null; }

  const PAL = {
    jacket: '#1fb5a8', jacketD: '#127a73', jacketL: '#6fe0d4', trim: '#ffd23f',
    pants: '#2d2f45', boot: '#ff8a2a', bootD: '#c45a12', bootL: '#ffb26b', buckle: '#d8dde8',
    skin: '#f2c49c', skinD: '#d79c74', hat: '#ffd23f', hatD: '#d9a514', pom: '#ffffff', goggle: '#2b3a6b', lens: '#8fe3ff',
    moose: '#6b4228', mooseD: '#4a2c1a', mooseL: '#8f5e3b', muzzle: '#9a6a48', antler: '#e2c48a', antlerD: '#b08f58',
    vest: '#ff7a1a', vestD: '#c9560a', stripe: '#fff07a',
    wood: '#a8683c', woodD: '#6d3f21', woodL: '#cf8f5a', steel: '#3a4561', steelL: '#5d6b8f', snow: '#f4f6ff', snowS: '#c9d3f0',
    ice: '#bfe9ff', iceD: '#7cc3ea', ink: '#1a1830'
  };

  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }

  // ---------------------------------------------------------------- skier
  // o: {x, y (feet), face, state, t, sx, sy, poles, swing, rot, blink, hurt}
  function drawSkier(g, o) {
    g.save();
    g.translate(o.x, o.y);
    g.scale(1.27, 1.27); // drawn a touch larger than the hitbox for readability on phones
    if (o.rot) { g.translate(0, -8); g.rotate(o.rot); g.translate(0, 8); }
    g.scale((o.face || 1) * (o.sx || 1), o.sy || 1);
    const st = o.state, t = o.t || 0;
    g.lineJoin = 'round'; g.lineCap = 'round';
    const sheet = asset('skier');
    if (sheet) { // 4x4 sheet: idle 0-1, run 2-7, jump 8-9, climb 10-13, tumble 14-15
      const fr = st === 'run' ? 2 + (Math.floor(t * 12) % 6) : st === 'jump' ? 8 + (o.sy > 1 ? 0 : 1) : st === 'climb' ? 10 + (Math.floor(t * 7) % 4) : st === 'tumble' ? 14 + (Math.floor(t * 8) % 2) : Math.floor(t * 2) % 2;
      const fw = sheet.width / 4, fh = sheet.height / 4;
      g.drawImage(sheet, (fr % 4) * fw, Math.floor(fr / 4) * fh, fw, fh, -10, -22, 20, 22);
      g.restore(); return;
    }
    // soft shadow
    if (st !== 'climb' && st !== 'tumble') { g.fillStyle = 'rgba(20,10,40,.25)'; ell(g, 0, 0.3, 6.5, 1.3); g.fill(); }
    if (st === 'climb') { drawSkierBack(g, t); g.restore(); return; }
    let lA = 0, lB = 0, bob = 0, armA = 0, armB = 0;
    if (st === 'run') { const p = Math.sin(t * 15); lA = p * 2.6; lB = -p * 2.6; bob = Math.abs(Math.cos(t * 15)) * 0.8; armA = -p * 0.6; armB = p * 0.6; }
    if (st === 'jump') { lA = 2; lB = -1.5; bob = 0; armA = -1.6; armB = -1.2; }
    if (st === 'celebrate') { armA = -2.6; armB = -2.6; bob = Math.abs(Math.sin(t * 8)) * 1.5; }
    if (st === 'tumble') { armA = -2.2 + Math.sin(t * 20) * 0.6; armB = -2.4 - Math.sin(t * 20) * 0.6; lA = Math.sin(t * 18) * 2; lB = -lA; }
    g.translate(0, -bob);
    // back boot + leg
    leg(g, -1.6 + lB, lB, true);
    // back arm
    arm(g, -2.6, -10.6, armB, true, o);
    // torso (puffy jacket)
    let gr = g.createLinearGradient(-5, -13, 5, -5);
    gr.addColorStop(0, PAL.jacketL); gr.addColorStop(0.45, PAL.jacket); gr.addColorStop(1, PAL.jacketD);
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
    rr(g, -4.6, -13.2, 9.2, 8.4, 3.2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-4, -9.2); g.lineTo(4.2, -9.2); g.stroke();
    g.fillStyle = PAL.trim; g.fillRect(-4.4, -6.6, 8.8, 1.1);
    g.fillStyle = PAL.jacketD; g.fillRect(0.5, -12.8, 0.6, 6);
    // front leg + boot
    leg(g, 1.6 + lA, lA, false);
    // head
    const hy = -16.4;
    g.fillStyle = PAL.skin; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
    ell(g, 0.6, hy, 3.7, 3.5); g.fill(); g.stroke();
    g.fillStyle = PAL.skinD; ell(g, 3.8, hy + 0.6, 0.9, 1.1); g.fill(); // nose
    // rosy cheek
    g.fillStyle = 'rgba(255,110,110,.45)'; ell(g, 2.2, hy + 1.6, 1.1, 0.7); g.fill();
    // eye / mouth
    if (o.hurt) { g.strokeStyle = PAL.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(1.4, hy - 0.9); g.lineTo(2.8, hy + 0.3); g.moveTo(2.8, hy - 0.9); g.lineTo(1.4, hy + 0.3); g.stroke(); }
    else if (o.blink) { g.strokeStyle = PAL.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(1.4, hy - 0.2); g.lineTo(2.8, hy - 0.2); g.stroke(); }
    else { g.fillStyle = PAL.ink; ell(g, 2.2, hy - 0.3, 0.6, 0.85); g.fill(); g.fillStyle = '#fff'; ell(g, 2.4, hy - 0.6, 0.22, 0.22); g.fill(); }
    g.strokeStyle = PAL.ink; g.lineWidth = 0.55; g.beginPath();
    if (st === 'celebrate' || st === 'jump') g.arc(2.6, hy + 1.6, 0.9, 0.1, Math.PI - 0.3); else g.arc(2.6, hy + 1.9, 0.7, -0.2, Math.PI * 0.6);
    g.stroke();
    // beanie + goggles on forehead
    gr = g.createLinearGradient(0, hy - 6, 0, hy - 1);
    gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, PAL.hatD);
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-3.4, hy - 1.2); g.quadraticCurveTo(-3.6, hy - 6.2, 0.8, hy - 6.1); g.quadraticCurveTo(4.6, hy - 5.8, 4.3, hy - 1.4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8452c'; g.fillRect(-3.3, hy - 3.6, 7.5, 1); // knit stripe
    g.fillStyle = PAL.goggle; rr(g, -3.6, hy - 2.2, 8.2, 1.9, 0.9); g.fill();
    g.fillStyle = PAL.lens; rr(g, 1.2, hy - 2.0, 3.2, 1.5, 0.7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(1.6, hy - 1.8, 1, 0.5);
    // pom-pom with a bounce
    const pb = st === 'run' ? Math.sin(t * 15) * 0.6 : st === 'jump' ? 1 : 0;
    g.fillStyle = PAL.pom; g.strokeStyle = PAL.ink; g.lineWidth = 0.6; ell(g, -0.6, hy - 6.6 - pb, 1.8, 1.8); g.fill(); g.stroke();
    // front arm
    arm(g, 2.4, -10.8, armA, false, o);
    g.restore();
  }
  function leg(g, x, sw, back) {
    g.strokeStyle = back ? '#1e1f30' : PAL.pants; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x * 0.4, -6); g.lineTo(x, -3.2); g.stroke();
    // chunky boot
    const gr = g.createLinearGradient(0, -4.5, 0, 0);
    gr.addColorStop(0, back ? '#d06a1c' : PAL.bootL); gr.addColorStop(1, back ? '#9a4a10' : PAL.bootD);
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(x - 2.4, -4.6); g.lineTo(x + 1.6, -4.6); g.lineTo(x + 1.9, -1.8); g.lineTo(x + 3.6, -1.4); g.quadraticCurveTo(x + 4.2, 0, x + 3.2, 0); g.lineTo(x - 2.8, 0); g.quadraticCurveTo(x - 3.1, -2.2, x - 2.4, -4.6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = PAL.buckle; g.fillRect(x - 1.8, -3.6, 3, 0.7); g.fillRect(x - 1.6, -2.2, 3.2, 0.7);
    g.fillStyle = '#222'; g.fillRect(x - 2.9, -0.6, 6.7, 0.6);
  }
  function arm(g, x, y, a, back, o) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.strokeStyle = back ? PAL.jacketD : PAL.jacket; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0.6, 4); g.stroke();
    g.fillStyle = back ? '#1d6f2a' : '#2fae4b'; ell(g, 0.7, 4.6, 1.3, 1.2); g.fill(); // mitten
    if (o.poles) {
      // ski pole held in this hand, swung by o.swing
      g.save(); g.translate(0.7, 4.6); g.rotate(-1.2 + (o.swing || 0) * (back ? -1 : 1));
      g.strokeStyle = '#d9dde8'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -13); g.stroke();
      g.strokeStyle = '#ff4d6d'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 1.5); g.lineTo(0, -1); g.stroke();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 0.7; ell(g, 0, -11.5, 1.8, 0.6); g.stroke();
      g.restore();
    }
    g.restore();
  }
  function drawSkierBack(g, t) {
    // seen from behind on a ladder: knit beanie with a pom, collar, backpack with straps, mittens gripping rungs
    const p = Math.sin(t * 12);
    for (const s of [-1, 1]) {
      const off = s === 1 ? p * 1.6 : -p * 1.6;
      g.strokeStyle = PAL.pants; g.lineWidth = 3.2; g.beginPath(); g.moveTo(s * 1.8, -6.5); g.lineTo(s * 2.2, -2.6 + off * 0.5); g.stroke();
      const gb = g.createLinearGradient(0, -4.5 + off * 0.5, 0, 0 + off * 0.5); gb.addColorStop(0, PAL.bootL); gb.addColorStop(1, PAL.bootD);
      g.fillStyle = gb; g.strokeStyle = PAL.ink; g.lineWidth = 0.7; rr(g, s * 2.2 - 2.5, -4.6 + off * 0.5, 5, 4.8, 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(40,20,10,.55)'; g.fillRect(s * 2.2 - 2.1, -0.9 + off * 0.5, 4.2, 0.8); // tread
    }
    // jacket (puffy: two quilt lines) with trim at the hem
    const gj = g.createLinearGradient(-5, 0, 5, 0); gj.addColorStop(0, PAL.jacketD); gj.addColorStop(0.45, PAL.jacket); gj.addColorStop(1, PAL.jacketD);
    g.fillStyle = gj; g.strokeStyle = PAL.ink; g.lineWidth = 0.7; rr(g, -5, -14, 10, 9.2, 3.4); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-4.6, -10.5); g.lineTo(4.6, -10.5); g.moveTo(-4.6, -7.6); g.lineTo(4.6, -7.6); g.stroke();
    g.fillStyle = PAL.trim; g.fillRect(-4.6, -6.2, 9.2, 1);
    // backpack + straps
    g.strokeStyle = '#7a2014'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-2.4, -13.6); g.lineTo(-2.6, -11.6); g.moveTo(2.4, -13.6); g.lineTo(2.6, -11.6); g.stroke();
    g.fillStyle = '#e8452c'; g.strokeStyle = PAL.ink; g.lineWidth = 0.6; rr(g, -3, -12, 6, 5.4, 1.8); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-2.2, -11.4, 4.4, 0.7);
    g.fillStyle = '#ffd23f'; ell(g, 0, -8.6, 0.7, 0.7); g.fill();
    // arms reaching up alternately, mittens in the trim colour
    for (const s of [-1, 1]) {
      const up = s === 1 ? p : -p;
      g.strokeStyle = PAL.ink; g.lineWidth = 3.1; g.beginPath(); g.moveTo(s * 3.8, -12.4); g.lineTo(s * 4.7, -17.2 - up * 2); g.stroke();
      g.strokeStyle = PAL.jacket; g.lineWidth = 2.3; g.beginPath(); g.moveTo(s * 3.8, -12.4); g.lineTo(s * 4.7, -17.2 - up * 2); g.stroke();
      g.fillStyle = PAL.trim; g.strokeStyle = PAL.ink; g.lineWidth = 0.5; ell(g, s * 4.7, -18 - up * 2, 1.5, 1.4); g.fill(); g.stroke();
    }
    // collar, then the back of the head: hair tufts under a ribbed beanie with a stripe and a pom
    g.fillStyle = PAL.jacketL; rr(g, -3, -15.2, 6, 1.8, 0.9); g.fill();
    g.fillStyle = '#5a3a26'; ell(g, 0, -16.2, 3.4, 2.2); g.fill();
    const gh = g.createLinearGradient(0, -21, 0, -16); gh.addColorStop(0, '#fff2a8'); gh.addColorStop(0.5, PAL.hat); gh.addColorStop(1, PAL.hatD);
    g.fillStyle = gh; g.strokeStyle = PAL.ink; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-3.8, -16.6); g.quadraticCurveTo(-4, -22, 0, -22.2); g.quadraticCurveTo(4, -22, 3.8, -16.6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8452c'; g.fillRect(-3.8, -19.2, 7.6, 1);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.45; g.beginPath(); for (let x = -3; x <= 3; x += 1.5) { g.moveTo(x, -17); g.lineTo(x * 0.9, -21.5); } g.stroke();
    g.fillStyle = PAL.hatD; rr(g, -4, -17.4, 8, 1.6, 0.8); g.fill(); // folded cuff
    g.fillStyle = PAL.pom; g.strokeStyle = PAL.ink; g.lineWidth = 0.6; ell(g, 0, -23.2, 2, 2); g.fill(); g.stroke();
  }

  // ---------------------------------------------------------------- moose
  // o: {x, y, face, state, k (0..1 anim), t, blink}
  function drawMoose(g, o) {
    const img = asset('moose');
    g.save(); g.translate(o.x, o.y);
    if (img) { g.scale(o.face, 1); g.drawImage(img, -28, -50, 56, 50); g.restore(); return; }
    const t = o.t || 0, st = o.state || 'idle', k = o.k || 0;
    g.scale((o.face || -1) * 0.86, 0.86); // drawn facing +x, a touch smaller than full size
    g.lineJoin = 'round'; g.lineCap = 'round';
    let tilt = 0, headDip = 0, lift = 0, breathe = Math.sin(t * 2.2) * 0.5, grin = 0, frontLift = 0;
    if (st === 'windup') { tilt = -0.12 * k; headDip = -3 * k; grin = 0.4; }
    if (st === 'shove') { tilt = 0.1 * (1 - k); headDip = 5 * (1 - k); grin = 1; }
    if (st === 'stomp') { frontLift = Math.sin(Math.min(1, k) * Math.PI) * 6; grin = 0.7; }
    if (st === 'laugh') { grin = 1; lift = Math.abs(Math.sin(t * 14)) * 1.5; tilt = Math.sin(t * 14) * 0.05; }
    if (st === 'sulk') { headDip = 4; tilt = 0.05; }
    if (st === 'charge') { tilt = 0.12; headDip = 4; grin = 1; lift = Math.abs(Math.sin(t * 16)) * 1.2; }
    if (st === 'paw') { frontLift = Math.abs(Math.sin(t * 10)) * 3; headDip = 3; grin = 0.6; }
    g.fillStyle = 'rgba(20,10,40,.28)'; ell(g, 0, 0.5, 22, 2.6); g.fill();
    g.translate(0, -lift);
    g.rotate(tilt);
    // legs (back pair darker)
    const legs = [[-12, 0, true], [9, frontLift, true], [-8, 0, false], [13, frontLift * 0.8, false]];
    for (const L of legs) {
      g.strokeStyle = L[2] ? '#3a2214' : PAL.mooseD; g.lineWidth = 3.6;
      g.beginPath(); g.moveTo(L[0], -18); g.lineTo(L[0] + 0.5, -7 - L[1]); g.lineTo(L[0] + 0.2, -1.5 - L[1]); g.stroke();
      g.fillStyle = '#211208'; rr(g, L[0] - 2.2, -2.4 - L[1], 4.6, 2.6, 1); g.fill();
    }
    // body
    let gr = g.createLinearGradient(0, -34, 0, -12);
    gr.addColorStop(0, PAL.mooseL); gr.addColorStop(0.6, PAL.moose); gr.addColorStop(1, PAL.mooseD);
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-18, -22); g.quadraticCurveTo(-19, -33 - breathe, -6, -33 - breathe); g.quadraticCurveTo(8, -37 - breathe, 15, -30); g.quadraticCurveTo(19, -20, 12, -15); g.quadraticCurveTo(-4, -12, -15, -15); g.quadraticCurveTo(-19, -17, -18, -22); g.closePath(); g.fill(); g.stroke();
    // ski-patrol vest (clipped to the body)
    g.save(); g.clip();
    gr = g.createLinearGradient(0, -36, 0, -14); gr.addColorStop(0, '#ff9a3d'); gr.addColorStop(1, PAL.vestD);
    g.fillStyle = gr; g.fillRect(-9, -40, 22, 30);
    g.fillStyle = PAL.stripe; g.fillRect(-9, -24, 22, 2); g.fillRect(-9, -20, 22, 1.2);
    g.restore();
    g.fillStyle = PAL.mooseD; ell(g, -18.6, -25, 1.6, 2.4, -0.4); g.fill(); // little tail
    g.strokeStyle = PAL.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-9, -35.5); g.lineTo(-9, -13.4); g.moveTo(13, -33); g.lineTo(13, -15.5); g.stroke();
    // snowflake badge
    g.save(); g.translate(2, -29); g.strokeStyle = '#fff'; g.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-2.4, 0); g.lineTo(2.4, 0); g.stroke(); }
    g.restore();
    // neck + head
    g.save(); g.translate(14, -30); g.rotate(0.15 + headDip * 0.06);
    g.fillStyle = PAL.moose; g.strokeStyle = PAL.ink; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-4, -3); g.lineTo(5, -6); g.lineTo(8, 4); g.lineTo(-2, 7); g.closePath(); g.fill(); g.stroke();
    // dewlap (bell)
    g.fillStyle = PAL.mooseD; g.beginPath(); g.moveTo(3, 4); g.quadraticCurveTo(2, 11, 5, 10); g.quadraticCurveTo(7, 7, 6, 4); g.fill();
    // head block with long droopy muzzle
    g.translate(6, -4);
    // antlers (palmate, drawn behind the head)
    g.save(); g.translate(-1, -4);
    for (const side of [-1, 1]) {
      g.save(); g.scale(1, 1); g.translate(side * 1.5, 0); g.rotate(side * 0.18 - 0.3);
      gr = g.createLinearGradient(0, -10, 0, 0); gr.addColorStop(0, '#f3dcaa'); gr.addColorStop(1, PAL.antlerD);
      g.fillStyle = side < 0 ? '#c7a56a' : gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-6, -2, -12, -6);
      for (let i = 0; i < 4; i++) { g.lineTo(-12 + i * 3, -11 - (i % 2) * 1.5); g.lineTo(-10.5 + i * 3, -7.5); }
      g.lineTo(0, -10); g.lineTo(1.5, -6); g.quadraticCurveTo(1, -2, 0, 0); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    g.restore();
    // ear
    g.fillStyle = PAL.mooseD; g.strokeStyle = PAL.ink; g.lineWidth = 0.6;
    g.save(); g.translate(-2, -2); g.rotate(-0.8 + Math.sin(t * 3) * 0.12 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0)); ell(g, -2, 0, 3.6, 1.6); g.fill(); g.stroke(); g.restore();
    gr = g.createLinearGradient(0, -5, 0, 6); gr.addColorStop(0, PAL.mooseL); gr.addColorStop(1, PAL.moose);
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(4, -6, 9, -2); g.quadraticCurveTo(14, 0, 13.5, 4); g.quadraticCurveTo(13, 8, 8, 7.5); g.quadraticCurveTo(1, 7, -2, 4); g.closePath(); g.fill(); g.stroke();
    // muzzle tone + nostril
    g.fillStyle = PAL.muzzle; ell(g, 10.5, 3.5, 3.4, 3.2); g.fill();
    g.fillStyle = '#2a170b'; ell(g, 12.4, 2.6, 0.8, 1.1, 0.3); g.fill();
    // grin
    if (grin > 0.2) {
      g.fillStyle = '#3a0f12'; g.beginPath(); g.moveTo(5, 5.2); g.quadraticCurveTo(9.5, 9 + grin * 1.5, 13, 5.6); g.quadraticCurveTo(9, 6.6, 5, 5.2); g.fill();
      g.fillStyle = '#fff'; g.fillRect(7, 5.5, 4.6, 1.1 * grin);
    } else { g.strokeStyle = PAL.ink; g.lineWidth = 0.6; g.beginPath(); g.moveTo(6, 5.4); g.quadraticCurveTo(9, 6.6, 12, 5.6); g.stroke(); }
    // eye with heavy brow
    if (o.blink || st === 'sulk') { g.strokeStyle = PAL.ink; g.lineWidth = 0.7; g.beginPath(); g.moveTo(1.6, -1); g.lineTo(4.4, -0.6); g.stroke(); }
    else { g.fillStyle = '#fff'; ell(g, 3, -1.2, 1.7, 1.6); g.fill(); g.fillStyle = PAL.ink; ell(g, 3.6, -1, 0.8, 0.95); g.fill(); }
    g.strokeStyle = '#2a170b'; g.lineWidth = 1; g.beginPath();
    if (grin > 0.5 || st === 'charge' || st === 'paw') { g.moveTo(1, -3.6); g.lineTo(5, -2.4); } else { g.moveTo(1, -3); g.lineTo(5, -3.4); }
    g.stroke();
    g.restore();
    // steam puffs when pawing
    g.restore();
  }

  // barrel stack decoration (behind the moose)
  function drawBarrelStack(g, x, y) {
    const pos = [[-6, -5], [6, -5], [0, -15]];
    for (const p of pos) drawBarrel(g, { x: x + p[0], y: y + p[1] + 5, r: 5.6, rot: 0, side: true });
  }

  // ---------------------------------------------------------------- barrels / snowballs
  // Sap barrels are painted sugarhouse red so they read instantly against brown catwalks and dusk hills.
  const BRL = { L: '#ff7a5c', M: '#d8402c', D: '#7e1e16', hoop: '#e3e7f2', hoopD: '#8a93ad', rim: 'rgba(255,236,214,.9)' };
  const BRL_GOLD = { L: '#ffe48a', M: '#f2b41c', D: '#8a5a06', hoop: '#fff6d8', hoopD: '#b3481c' };
  function drawBarrel(g, b) {
    const r = b.r || 5.6;
    const BRL_ = b.gold ? Object.assign({}, BRL, BRL_GOLD) : BRL;
    g.save(); g.translate(b.x, b.y - r);
    if (b.gold) { g.fillStyle = 'rgba(255,214,70,' + (0.28 + 0.14 * Math.sin((b.age || 0) * 18)) + ')'; ell(g, 0, 0, r + 3.2, r + 3.2); g.fill(); }
    if (b.glow) { g.fillStyle = 'rgba(255,90,60,' + (0.35 + 0.25 * Math.sin(b.glow * 20)) + ')'; ell(g, 0, 0, r + 3.5, r + 3.5); g.fill(); }
    if (b.side) {
      // upright barrel seen from the side (stack)
      const gr = g.createLinearGradient(-r, 0, r, 0);
      gr.addColorStop(0, BRL_.D); gr.addColorStop(0.4, BRL_.L); gr.addColorStop(1, BRL_.D);
      g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-r * 0.8, -r); g.quadraticCurveTo(-r * 1.08, 0, -r * 0.8, r); g.lineTo(r * 0.8, r); g.quadraticCurveTo(r * 1.08, 0, r * 0.8, -r); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = BRL_.hoop; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-r * 0.95, -r * 0.5); g.lineTo(r * 0.95, -r * 0.5); g.moveTo(-r * 0.95, r * 0.5); g.lineTo(r * 0.95, r * 0.5); g.stroke();
      g.restore(); return;
    }
    const R = r * 1.12 * (b.sq ? 1 + 0.18 * b.sq : 1); // drawn a touch bigger; pops when you clear it than the hitbox (which is smaller still) so it reads on a phone
    g.translate(0, r - R); // sit on the plank, not sunk into it
    g.rotate(b.rot || 0);
    const bi = asset('barrel'); if (bi) { g.drawImage(bi, -R, -R, 2 * R, 2 * R); g.restore(); return; }
    // 3/4 view: the barrel's red body recedes up-left behind the lid, so it reads as a barrel, not a disc
    g.rotate(-(b.rot || 0)); // body does not spin
    const ox = -R * 0.42, oy = -R * 0.3;
    g.strokeStyle = BRL_.rim; g.lineWidth = 1.5;
    ell(g, ox, oy, R + 0.5, R + 0.5); g.stroke(); ell(g, 0, 0, R + 0.5, R + 0.5); g.stroke();
    // body: back end + the band joining it to the lid
    let gb = g.createLinearGradient(ox, oy - R, 0, R);
    gb.addColorStop(0, BRL_.L); gb.addColorStop(0.5, BRL_.M); gb.addColorStop(1, BRL_.D);
    g.fillStyle = gb; g.strokeStyle = PAL.ink; g.lineWidth = 0.8;
    ell(g, ox, oy, R, R); g.fill(); g.stroke();
    for (let i = 1; i <= 3; i++) { const f = i / 4; ell(g, ox * (1 - f), oy * (1 - f), R * (1 + 0.04 * Math.sin(f * Math.PI)), R * (1 + 0.04 * Math.sin(f * Math.PI))); g.fill(); }
    // staves on the side band, and a steel hoop around the middle of the body
    g.strokeStyle = b.gold ? 'rgba(90,50,0,.5)' : 'rgba(70,10,8,.45)'; g.lineWidth = 0.5; g.beginPath();
    for (const a of [-2.3, -1.6, -0.9]) { g.moveTo(ox + Math.cos(a) * R, oy + Math.sin(a) * R); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
    g.stroke();
    g.strokeStyle = BRL_.hoopD; g.lineWidth = 1.5; g.beginPath(); g.arc(ox * 0.5, oy * 0.5, R * 1.03, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
    g.strokeStyle = BRL_.hoop; g.lineWidth = 0.7; g.beginPath(); g.arc(ox * 0.5, oy * 0.5, R * 1.03, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
    // lid (spins as it rolls): lighter wood planks across, a steel chime rim, a bung
    g.rotate(b.rot || 0);
    const gl = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    if (b.gold) { gl.addColorStop(0, '#fff4b8'); gl.addColorStop(0.7, '#ffd23f'); gl.addColorStop(1, '#c98a0a'); } else { gl.addColorStop(0, '#ff8a6a'); gl.addColorStop(0.7, '#e2513a'); gl.addColorStop(1, '#a8301f'); }
    g.fillStyle = gl; g.strokeStyle = PAL.ink; g.lineWidth = 0.8; ell(g, 0, 0, R, R); g.fill(); g.stroke();
    g.save(); ell(g, 0, 0, R * 0.8, R * 0.8); g.clip();
    g.strokeStyle = 'rgba(80,14,8,.55)'; g.lineWidth = 0.55; g.beginPath();
    for (const k of [-0.5, -0.17, 0.17, 0.5]) { g.moveTo(-R, k * R * 1.6); g.lineTo(R, k * R * 1.6); }
    g.stroke(); g.restore();
    g.strokeStyle = BRL_.hoopD; g.lineWidth = 1.5; ell(g, 0, 0, R * 0.86, R * 0.86); g.stroke();
    g.strokeStyle = BRL_.hoop; g.lineWidth = 0.7; ell(g, 0, 0, R * 0.86, R * 0.86); g.stroke();
    g.fillStyle = '#3b1510'; ell(g, R * 0.38, R * 0.1, 1.1, 1.1); g.fill();
    g.fillStyle = '#ffd36a'; g.beginPath(); g.moveTo(-R * 0.25, -R * 0.42); g.quadraticCurveTo(0, -R * 0.06, -R * 0.25, R * 0.14); g.quadraticCurveTo(-R * 0.5, -R * 0.06, -R * 0.25, -R * 0.42); g.fill();
    // glint (does not rotate)
    g.rotate(-(b.rot || 0));
    g.fillStyle = 'rgba(255,255,255,.5)'; ell(g, -R * 0.4, -R * 0.5, R * 0.22, R * 0.12, -0.6); g.fill();
    g.restore();
  }
  function drawSnowball(g, b) {
    const r0 = b.r || 5.4, r = r0 * (r0 < 5 ? 1.25 : 1.1); // minis get the biggest boost: they were hard to spot
    g.save(); g.translate(b.x, b.y - r); g.rotate(b.rot || 0);
    const si = asset('snowball'); if (si) { g.drawImage(si, -r, -r, 2 * r, 2 * r); g.restore(); return; }
    const gr = g.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#e6efff'); gr.addColorStop(1, '#9fb6e6');
    g.fillStyle = gr; g.strokeStyle = '#1f2a55'; g.lineWidth = r0 < 5 ? 1.1 : 0.85;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr2 = r * (0.92 + ((i * 7) % 3) * 0.05); g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(160,190,240,.7)'; ell(g, r * 0.3, r * 0.25, r * 0.22, r * 0.18); g.fill(); ell(g, -r * 0.25, r * 0.4, r * 0.15, r * 0.12); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------- pickups
  function drawPoles(g, x, y, t) {
    g.save(); g.translate(x, y - 9 + Math.sin(t * 3) * 1.2);
    g.fillStyle = 'rgba(255,240,150,' + (0.25 + 0.15 * Math.sin(t * 5)) + ')'; ell(g, 0, 0, 9, 9); g.fill();
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * 0.35);
      g.strokeStyle = '#e6e9f2'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 7); g.stroke();
      g.strokeStyle = '#ff4d6d'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -4.5); g.stroke();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 0.8; ell(g, 0, 5.4, 2.2, 0.7); g.stroke();
      g.restore();
    }
    g.restore();
  }

  // ---------------------------------------------------------------- scenery
  function drawLodge(g, x, y, lights, door) {
    // A-frame summit lodge, ~36 wide, sitting on surface y, left edge x
    g.save(); g.translate(x, y);
    const li = asset('lodge');
    if (li) { g.drawImage(li, -2, -36, 40, 37.5); if (lights > 0) { g.fillStyle = 'rgba(255,190,80,' + (lights * 0.18) + ')'; ell(g, 18, -10, 22, 13); g.fill(); } g.restore(); return; }
    g.fillStyle = 'rgba(20,10,40,.3)'; g.fillRect(-1, -1, 38, 2);
    // body
    let gr = g.createLinearGradient(0, -24, 0, 0); gr.addColorStop(0, '#7a4a2e'); gr.addColorStop(1, '#4b2c1a');
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(1, 0); g.lineTo(1, -14); g.lineTo(18, -32); g.lineTo(35, -14); g.lineTo(35, 0); g.closePath(); g.fill(); g.stroke();
    // log lines
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.5; g.beginPath();
    for (let i = 1; i < 6; i++) { g.moveTo(1, -i * 2.6); g.lineTo(35, -i * 2.6); }
    g.stroke();
    // roof with snow
    g.fillStyle = '#3a2a3e'; g.beginPath(); g.moveTo(-3, -12); g.lineTo(18, -35); g.lineTo(39, -12); g.lineTo(36, -11); g.lineTo(18, -31); g.lineTo(0, -11); g.closePath(); g.fill();
    g.fillStyle = PAL.snow; g.beginPath(); g.moveTo(-4, -12.5); g.lineTo(18, -36.5); g.lineTo(40, -12.5); g.quadraticCurveTo(38, -10.5, 36.5, -12.5); g.lineTo(18, -32); g.lineTo(-0.5, -12.5); g.quadraticCurveTo(-2.5, -10.5, -4, -12.5); g.fill();
    // chimney + smoke
    g.fillStyle = '#5a5060'; g.fillRect(26, -34, 3.5, 8); g.fillStyle = PAL.snow; g.fillRect(25.6, -35, 4.3, 1.4);
    // windows (light up as the bonus runs low)
    const glow = 0.35 + lights * 0.65;
    g.fillStyle = 'rgba(255,200,90,' + glow + ')';
    g.fillRect(14.5, -25, 7, 5); // gable window
    g.fillRect(4, -10, 6, 5); g.fillRect(27, -10, 6, 5);
    if (lights > 0.2) { g.fillStyle = 'rgba(255,190,80,' + (lights * 0.25) + ')'; ell(g, 18, -10, 24, 14); g.fill(); }
    g.strokeStyle = '#2a1a10'; g.lineWidth = 0.6; g.strokeRect(14.5, -25, 7, 5); g.strokeRect(4, -10, 6, 5); g.strokeRect(27, -10, 6, 5);
    g.beginPath(); g.moveTo(18, -25); g.lineTo(18, -20); g.moveTo(7, -10); g.lineTo(7, -5); g.moveTo(30, -10); g.lineTo(30, -5); g.stroke();
    // door
    const dx = (door == null ? 18 : door) - 2.8;
    g.fillStyle = '#2a170b'; rr(g, dx - 0.2, -9.5, 6, 9.5, 2.5); g.fill();
    g.fillStyle = 'rgba(255,200,90,' + (0.4 * lights) + ')'; rr(g, dx + 0.6, -8.5, 4.4, 8.5, 2); g.fill();
    g.fillStyle = '#ffd23f'; ell(g, dx + 4.4, -4.5, 0.5, 0.5); g.fill();
    // sign
    g.fillStyle = '#2a4a3a'; rr(g, 8, -18.5, 20, 4, 1); g.fill(); g.strokeStyle = '#e8d9a8'; g.lineWidth = 0.4; rr(g, 8, -18.5, 20, 4, 1); g.stroke();
    g.fillStyle = '#f4e8c0'; g.font = 'bold 2.7px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LODGE', 18, -16.4);
    g.restore();
  }

  // a maple leaf, centred on the origin, about 10 units across
  function mapleLeaf(g, col) {
    g.fillStyle = col;
    g.beginPath();
    const pts = [[0, -5.2], [1.1, -2.9], [3.1, -3.8], [2.5, -1.2], [4.9, -0.9], [3.1, 0.9], [3.6, 2.2], [0.9, 1.7], [0.5, 4.4], [-0.5, 4.4], [-0.9, 1.7], [-3.6, 2.2], [-3.1, 0.9], [-4.9, -0.9], [-2.5, -1.2], [-3.1, -3.8], [-1.1, -2.9]];
    pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill();
  }
  // maple token: a gold coin with a sugar-maple leaf; bobs, spins a little and glints
  function drawToken(g, x, y, t) {
    const ti = asset('token'); const bob = Math.sin(t * 3.2) * 1.4;
    g.save(); g.translate(x, y + bob);
    g.fillStyle = 'rgba(255,214,70,' + (0.22 + 0.12 * Math.sin(t * 5)) + ')'; ell(g, 0, 0, 10.5, 10.5); g.fill();
    if (ti) { g.drawImage(ti, -7, -7, 14, 14); g.restore(); return; }
    const sx = 0.82 + 0.18 * Math.cos(t * 2.4);
    g.scale(sx, 1);
    const gr = g.createRadialGradient(-2, -2.5, 1, 0, 0, 7.5); gr.addColorStop(0, '#fff4b8'); gr.addColorStop(0.6, '#ffd23f'); gr.addColorStop(1, '#d08a0c');
    g.fillStyle = gr; g.strokeStyle = PAL.ink; g.lineWidth = 0.9; ell(g, 0, 0, 7, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(160,90,0,.55)'; g.lineWidth = 0.6; ell(g, 0, 0, 5.5, 5.5); g.stroke();
    mapleLeaf(g, '#c43a1a');
    g.fillStyle = 'rgba(255,255,255,.75)'; const k = (Math.sin(t * 3.2 + 1) + 1) / 2; ell(g, -3.2, -3.4, 1.3 + k * 0.6, 0.6); g.fill();
    g.restore();
  }

  window.CC_ART = { PAL, ASSETS, asset, rr, ell, drawSkier, drawMoose, drawBarrel, drawBarrelStack, drawSnowball, drawPoles, drawLodge, drawToken, mapleLeaf };
})();
