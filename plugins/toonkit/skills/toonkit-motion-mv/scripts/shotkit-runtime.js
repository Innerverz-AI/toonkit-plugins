/* shotkit runtime: data-driven shot engine for toonkit-motion-mv (inlined into index.html by shotkit.mjs).
 * Globals provided by the build: SHOTS, COVERS, CFG, BPM, OFF, BT, DUR. */
MK.init({ fps: CFG.fps });
const tl = gsap.timeline({ paused: true });
const Bt = (n) => OFF + n * BT;
const PAL = CFG.palette;
const INK = CFG.ink;
const rng = MK.rng(CFG.seed || 20260929);
const q = (sel, root) => (root || document).querySelector(sel);
const qa = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
function mk(tag, cls, parent, css) { const e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; parent.appendChild(e); return e; }
function beatsOf(s) { const out = []; const end = s.b === null ? Math.floor((DUR - OFF) / BT) + 1 : s.b; for (let k = s.a; k < end; k++) out.push(k); return out; }
const STAR = 'M0,-50 C4,-10 10,-4 50,0 C10,4 4,10 0,50 C-4,10 -10,4 -50,0 C-10,-4 -4,-10 0,-50Z';
const HEART = 'M0,40 C-60,0 -60,-45 -28,-45 C-12,-45 0,-32 0,-22 C0,-32 12,-45 28,-45 C60,-45 60,0 0,40Z';
const NOTE = 'M-10,30 a14,11 0 1,1 0.1,0 M4,28 L4,-40 L34,-48 L34,-30 L4,-22';
function svgShape(parent, d, fill, size, stroke) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-60 -60 120 120'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('class', 'sp'); s.style.width = size + 'px'; s.style.height = size + 'px';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', fill);
  if (stroke) { p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', '6'); p.setAttribute('stroke-linejoin', 'round'); }
  s.appendChild(p); parent.appendChild(s); return s;
}

// ---------------------------------------------------------------- backgrounds
function bgBuild(s, el, idx) {
  const p = PAL[s.pal] || PAL[Object.keys(PAL)[0]]; const len = s.t1 - s.t0;
  el.style.background = p.bg2;
  if (s.bg === 'rays') {
    const r = mk('div', '', el, `position:absolute;left:-1040px;top:-1460px;width:4000px;height:4000px;border-radius:50%;background:repeating-conic-gradient(${p.bg1} 0deg 11.25deg, ${p.bg2} 11.25deg 22.5deg);`);
    tl.set(r, { rotation: 0 }, 0); tl.to(r, { rotation: idx % 2 ? -50 : 50, duration: len, ease: 'move' }, s.t0);
  } else if (s.bg === 'dots' || s.bg === 'stripes' || s.bg === 'checker' || s.bg === 'hearts') {
    const heart = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cpath d='M90 140 C30 100 30 50 62 50 C78 50 90 62 90 72 C90 62 102 50 118 50 C150 50 150 100 90 140Z' fill='${encodeURIComponent(p.acc)}' opacity='0.9'/%3E%3C/svg%3E")`;
    const pat = {
      dots: `radial-gradient(circle, ${p.acc} 20%, transparent 21%) 0 0/140px 140px, radial-gradient(circle, ${p.soft} 20%, transparent 21%) 70px 70px/140px 140px, ${p.bg1}`,
      stripes: `repeating-linear-gradient(135deg, ${p.bg1} 0 70px, ${p.bg2} 70px 140px)`,
      checker: `conic-gradient(${p.bg1} 25%, #FFFFFF 0 50%, ${p.bg1} 0 75%, #FFFFFF 0) 0 0/220px 220px`,
      hearts: `${heart} 0 0/180px 180px, ${p.bg1}`,
    }[s.bg];
    const layer = mk('div', '', el, `position:absolute;left:-400px;top:-400px;width:2720px;height:1880px;background:${pat};`);
    tl.set(layer, { x: 0, y: 0 }, 0); tl.to(layer, { x: idx % 2 ? -280 : 280, y: 140, duration: len, ease: 'move' }, s.t0);
  } else if (s.bg === 'burst') {
    el.style.background = `radial-gradient(circle at 50% 50%, ${p.bg1} 0 30%, ${p.bg2} 70%)`;
    const rings = [0, 1, 2].map(() => mk('div', 'ring', el));
    beatsOf(s).forEach((k, i) => { const r = rings[i % 3]; const t = Bt(k); tl.set(r, { autoAlpha: 1, scale: 0.15 }, t); tl.to(r, { autoAlpha: 0, scale: 2.6, duration: BT * 2.2, ease: 'enter' }, t); });
  }
}
// per-beat sparkle confetti in the fx layer
function decoBuild(s, fx) {
  const shapes = [STAR, HEART, STAR, NOTE];
  const cols = CFG.decoColors;
  const pool = [];
  for (let i = 0; i < 6; i++) pool.push(svgShape(fx, shapes[i % 4], cols[i % 4], 60 + Math.floor(rng() * 70), i % 4 === 1 ? '#FFFFFF' : null));
  beatsOf(s).forEach((k, i) => {
    const t = Bt(k);
    for (let j = 0; j < 2; j++) {
      const e = pool[(i * 2 + j) % pool.length];
      const edge = rng() < 0.5 ? rng() * 0.22 : 0.78 + rng() * 0.22;
      const x = (j ? edge : rng()) * 1860, y = (j ? rng() : (rng() < 0.5 ? rng() * 0.2 : 0.8 + rng() * 0.18)) * 1020;
      tl.set(e, { autoAlpha: 1, x: x, y: y, scale: 0, rotation: rng() * 90 - 45 }, t);
      tl.to(e, { scale: 1, rotation: '+=40', duration: 0.22, ease: 'enter' }, t);
      tl.to(e, { scale: 0, duration: 0.14, ease: 'exit' }, t + BT - 0.14);
    }
  });
}

// ---------------------------------------------------------------- camera
function camBuild(s, cam, idx) {
  const len = s.t1 - s.t0; const bs = beatsOf(s);
  tl.set(cam, { rotation: 0, scale: 1, x: 0, y: 0 }, s.t0);
  if (s.cam === 'snap') bs.forEach((k, i) => { const t = Bt(k); const r = (i % 2 ? 1 : -1) * 3.5; tl.set(cam, { rotation: r * 1.9, scale: 1.07 }, t); tl.to(cam, { rotation: r, scale: 1.0, duration: 0.24, ease: 'enter' }, t); });
  else if (s.cam === 'punch') bs.forEach((k, i) => { if (i % 2) return; const t = Bt(k); tl.set(cam, { scale: 1.14, rotation: i % 4 ? 2 : -2 }, t); tl.to(cam, { scale: 1.0, rotation: 0, duration: 0.4, ease: 'enter' }, t); });
  else if (s.cam === 'drift') { tl.to(cam, { scale: 1.12, rotation: idx % 2 ? 2 : -2, duration: len, ease: 'move' }, s.t0); }
  else if (s.cam === 'whip') bs.forEach((k, i) => { const t = Bt(k); const dx = (s.direction === 'right' ? -1 : 1) * 260; tl.set(cam, { x: dx, rotation: -3 * Math.sign(dx) }, t); tl.to(cam, { x: 0, rotation: 0, duration: 0.26, ease: 'enter' }, t); });
  else if (s.cam === 'spin') { tl.set(cam, { rotation: -24, scale: 1.25 }, s.t0); tl.to(cam, { rotation: 18, scale: 1.0, duration: len, ease: 'move' }, s.t0); }
}
// shot entrance: alternate iris / wipes / slam, synced to the shot start (a beat)
function entrance(s, el, idx) {
  const t = s.t0; const kind = idx % 4;
  if (idx === 0) { tl.set(el, { autoAlpha: 1 }, 0); return; }
  if (kind === 0) MK.irisIn(tl, el, t, { dur: 0.3 });
  else if (kind === 1) MK.wipeIn(tl, el, t, { dir: 'right', dur: 0.24 });
  else if (kind === 2) MK.wipeIn(tl, el, t, { dir: 'down', dur: 0.24 });
  else MK.shapeMask(tl, el, t, { dur: 0.3 });
}

// ---------------------------------------------------------------- characters
function squash(target, t, amt) { tl.set(target, { scaleY: 1 - amt, scaleX: 1 + amt * 0.7, y: amt * 240 }, t); tl.to(target, { scaleY: 1, scaleX: 1, y: 0, duration: 0.2, ease: 'enter' }, t); }
function charsBuild(s, chars, fx) {
  const pws = qa(':scope > .pw', chars);
  const bs = beatsOf(s);
  if (s.kind === 'alternate') {
    const [A, Bf] = pws; const end = s.endPose ? s.endPose.at : null;
    bs.forEach((k, i) => {
      const t = Bt(k);
      if (end !== null && k >= end) return;
      tl.set(A, { autoAlpha: i % 2 ? 0 : 1 }, t); tl.set(Bf, { autoAlpha: i % 2 ? 1 : 0 }, t);
      squash(i % 2 ? Bf : A, t, 0.07);
      if (s.burst) { const b = svgShape(fx, STAR, i % 2 ? INK.accent : '#FFFFFF', 420, INK.main); tl.set(b, { autoAlpha: 1, x: 750, y: 250, scale: 0.2 }, t); tl.to(b, { scale: 1.1, rotation: 30, duration: 0.2, ease: 'enter' }, t); tl.to(b, { scale: 0, duration: 0.12, ease: 'exit' }, t + BT - 0.12); }
    });
    if (end !== null) { const E = q('.endpose', chars); tl.set([A, Bf], { autoAlpha: 0 }, Bt(end)); tl.set(E, { autoAlpha: 1 }, Bt(end)); tl.set(E, { scale: 1.25 }, Bt(end)); tl.to(E, { scale: 1, duration: 0.45, ease: 'slam' }, Bt(end)); MK.flash(tl, '#flash', Bt(end), { peak: 0.6, dur: 0.3 }); }
  } else if (s.kind === 'cuts') {
    const bgEl = q('.bg', chars.parentNode);
    bs.forEach((k, i) => {
      const t = Bt(k); const cur = pws[i % pws.length];
      pws.forEach((p) => tl.set(p, { autoAlpha: p === cur ? 1 : 0 }, t));
      tl.set(cur, { scale: 1.18, rotation: i % 2 ? 4 : -4 }, t); tl.to(cur, { scale: 1, rotation: 0, duration: 0.28, ease: 'enter' }, t);
      tl.set(bgEl, { backgroundColor: i % 2 ? INK.accent : INK.main }, t);
      MK.flash(tl, '#flash', t, { peak: 0.35, dur: 0.16 });
    });
  } else if (s.kind === 'pose' || s.kind === 'finale') {
    const A = pws[0]; tl.set(A, { autoAlpha: 1, scale: 1.3 }, s.t0); tl.to(A, { scale: 1, duration: 0.45, ease: 'slam' }, s.t0);
    bs.slice(1).forEach((k) => squash(A, Bt(k), 0.035));
    if (s.direction) bs.forEach((k, i) => { const left = s.direction === 'left'; const a = mk('div', '', fx, `position:absolute;top:120px;font:700 160px ${CFG.fonts.display};color:#fff;-webkit-text-stroke:10px ${INK.main};paint-order:stroke fill;visibility:hidden`); a.textContent = left ? '◀◀' : '▶▶'; const t = Bt(k); const x0 = CFG.width * 0.78, x1 = CFG.width * 0.05; tl.set(a, { autoAlpha: 1, x: left ? x0 : x1 }, t); tl.to(a, { x: left ? x1 : x0, duration: BT, ease: 'move' }, t); tl.set(a, { autoAlpha: 0 }, t + BT); });
  } else if (s.kind === 'split3') {
    const panels = qa('.panel', chars); const cols = CFG.panelColors;
    panels.forEach((pn, j) => { q('.pbg', pn).style.background = cols[j]; MK.wipeIn(tl, pn, Bt(s.a + j * 0.5), { dir: j % 2 ? 'up' : 'down', dur: 0.2 }); });
    bs.forEach((k, i) => { const t = Bt(k); panels.forEach((pn, j) => { const A = q('.pa', pn), Bf = q('.pb', pn); tl.set(A, { autoAlpha: i % 2 ? 0 : 1 }, t); tl.set(Bf, { autoAlpha: i % 2 ? 1 : 0 }, t); squash(i % 2 ? Bf : A, t, 0.06); }); });
  } else if (s.kind === 'logo') {
    qa('.lc', chars).forEach((lc, i) => {
      const c = s.chars[i]; const t = Bt(c.at);
      if (c.at > 0) tl.set(lc, { autoAlpha: 0 }, 0);
      if (c.peek) { tl.set(lc, { autoAlpha: 1, x: c.x + (c.peek === 'left' ? -700 : 700), y: c.y, scale: c.s }, t); tl.to(lc, { x: c.x, duration: 0.5, ease: 'enter' }, t); }
      else if (c.at === 0) { /* visible from frame 0 via its CSS base state; pop on the first beat */ tl.set(lc, { scale: c.s * 1.12 }, Bt(0)); tl.to(lc, { scale: c.s, duration: 0.3, ease: 'enter' }, Bt(0)); }
      else { tl.set(lc, { autoAlpha: 1, x: c.x, y: c.y + 260, scale: c.s * 0.6 }, t); tl.to(lc, { y: c.y, scale: c.s, duration: 0.45, ease: 'slam' }, t); }
      bs.filter((k) => k > c.at + 1).forEach((k) => { tl.set(lc, { scaleY: c.s * 0.95, scaleX: c.s * 1.03 }, Bt(k)); tl.to(lc, { scaleY: c.s, scaleX: c.s, duration: 0.2, ease: 'enter' }, Bt(k)); });
    });
  } else if (s.kind === 'names') {
    const vw = q('.vw', chars); const mp = q('.namepose', chars);
    const pn = s.names.find((n) => n.pose); tl.set(vw, { autoAlpha: 1 }, s.t0);
    if (pn && mp) { tl.set(vw, { autoAlpha: 0 }, Bt(pn.at)); tl.set(mp, { autoAlpha: 1, scale: 1.3 }, Bt(pn.at)); tl.to(mp, { scale: 1, duration: 0.45, ease: 'slam' }, Bt(pn.at)); }
  }
}

// ---------------------------------------------------------------- typography
function sizeFor(txt, giant) { if (giant) return 250; const n = txt.length; return n <= 6 ? 210 : n <= 12 ? 165 : n <= 18 ? 128 : n <= 26 ? 104 : 88; }
function topFor(s, fs) { if (s.kind === 'letters') return 70; if (s.kind === 'names') return CFG.height - 280; return CFG.height - fs * 1.05 - 70; }
function typeBuild(s, typeEl, bgEl, idx) {
  if (s.kind === 'logo') return logoBuild(s, typeEl);
  s.text.forEach((t, i) => {
    const at = Bt(t.at); const nextAt = i + 1 < s.text.length ? Bt(s.text[i + 1].at) : s.t1; const span = nextAt - at;
    if (s.kind === 'finale' && i === 1) return finaleLogo(s, typeEl, at);
    if (t.primitive === 'cropType') { const c = mk('div', 'crop', bgEl); c.textContent = t.content + ' ' + t.content; tl.set(c, { autoAlpha: 1 }, at); MK.cropType(tl, c, at, { dur: s.t1 - at, from: 5, to: -45 }); return; }
    const fs = t.primitive === 'replace' ? Math.min(230, sizeFor(t.words.reduce((m, w) => (w.length > m.length ? w : m), ''), false) + 20) : sizeFor(t.content, t.giant); const el = mk('div', 'tx ' + ['y', 'p', ''][(idx + i) % 3], typeEl, `font-size:${fs}px;top:${topFor(s, fs)}px;`);
    if (t.giant) el.style.top = '380px';
    if (t.primitive === 'replace') {
      const box = mk('div', '', el, `position:relative;display:inline-block;width:1800px;height:${fs * 1.2}px;`); tl.set(el, { autoAlpha: 1 }, at);
      const times = t.words.map((w, j) => Bt(t.at + j * t.step)); MK.replace(tl, box, t.words, times);
      qa('span', box).forEach((sp, j) => { sp.style.left = '0'; sp.style.right = '0'; sp.style.textAlign = 'center'; sp.style.width = '100%'; tl.set(sp, { scale: 1.5 }, times[j]); tl.to(sp, { scale: 1, duration: 0.25, ease: 'enter' }, times[j]); });
      return;
    }
    el.textContent = t.content;
    if (t.primitive === 'slam') { MK.slam(tl, el, at, { from: 2.3, rotFrom: -8, rot: (i % 2 ? 3 : -3) }); if (t.bounce) bounceLetters(el, t.at, s); }
    else if (t.primitive === 'reveal') { const n = t.words ? t.content.split(/\s+/).length : t.content.length; const st = Math.max(0.03, Math.min(t.words ? 0.3 : 0.07, (span - 0.7) / n)); MK.reveal(tl, el, at, { by: t.words ? 'word' : 'char', stagger: st, from: i % 2 ? 'above' : 'below' }); if (t.perBeat) perBeatPop(el, t.at, t.perBeat); }
    else if (t.primitive === 'tracking') { tl.set(el, { autoAlpha: 0 }, 0); MK.tracking(tl, el, at, { from: '0.9em', to: '0.03em' }); }
    else if (t.primitive === 'splitWipe') { tl.set(el, { autoAlpha: 1 }, at); const bar = mk('div', 'bar', typeEl, `top:${topFor(s, fs) - 10}px;height:${fs * 1.3}px;visibility:hidden;`); tl.set(bar, { autoAlpha: 1 }, at); MK.splitWipe(tl, el, bar, at, { dur: 0.6 }); tl.set(bar, { autoAlpha: 0 }, at + 0.62); }
    else if (t.primitive === 'counter') { tl.set(el, { autoAlpha: 1 }, at); MK.counter(tl, el, at, t.from, t.to - 0.49, { dur: span - 0.3, format: (v) => String(Math.max(t.to, Math.round(v))) }); bounceEveryBeat(el, t.at, s); }
    else if (t.primitive === 'drawOn') { el.textContent = ''; drawIcons(el, at, t.content); }
    if (i + 1 < s.text.length && !(s.kind === 'finale')) tl.set(el, { autoAlpha: 0 }, nextAt - 0.01);
  });
}
function perBeatPop(el, beat0, per) { qa('.mk-unit', el).forEach((u, j) => { const t = Bt(beat0 + j * per); tl.set(u, { yPercent: 115 }, 0); tl.to(u, { yPercent: 0, duration: 0.3, ease: 'enter' }, t); }); }
function bounceLetters(el, beat0, s) { const parts = MK.split(el, 'char'); beatsOf(s).forEach((k, i) => { const u = parts[i % parts.length]; const t = Bt(k); tl.set(u, { y: -60 }, t); tl.to(u, { y: 0, duration: 0.25, ease: 'enter' }, t); }); }
function bounceEveryBeat(el, beat0, s) { beatsOf(s).forEach((k) => { if (k < beat0) return; const t = Bt(k); tl.set(el, { scale: 1.25 }, t); tl.to(el, { scale: 1, duration: 0.22, ease: 'enter' }, t); }); }
function drawIcons(el, at, content) {
  const d = content.includes('♪') ? NOTE : HEART; const n = content.split(/\s+/).length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `-60 -60 ${120 * n} 120`); svg.setAttribute('width', 220 * n); svg.setAttribute('height', 220);
  el.appendChild(svg); tl.set(el, { autoAlpha: 1 }, at);
  for (let j = 0; j < n; j++) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('transform', `translate(${j * 120},0)`); p.setAttribute('fill', j % 2 ? INK.accent : INK.main); p.setAttribute('stroke', '#FFFFFF'); p.setAttribute('stroke-width', '7'); p.setAttribute('stroke-linejoin', 'round'); svg.appendChild(p); MK.drawOn(tl, p, at + j * BT * 0.5, { fill: true, dur: 0.45 }); }
}
function logoBuild(s, typeEl) {
  const L = mk('div', 'logo', typeEl); const cols = CFG.logo.letterColors; const nL = CFG.logo.title.length;
  CFG.logo.title.split('').forEach((ch, j) => { const sp = mk('span', '', L, `color:${cols[j % cols.length]}`); sp.textContent = ch; const t = Bt((s.logoStart || 1) + j * 0.75); tl.set(sp, { autoAlpha: 1, y: -700, rotation: j % 2 ? 12 : -12 }, t); tl.to(sp, { y: 0, rotation: 0, duration: 0.45, ease: 'slam' }, t); });
  const star = svgShape(typeEl, STAR, '#FFFFFF', 150, INK.main); const tStar = (s.logoStart || 1) + nL * 0.75; tl.set(star, { autoAlpha: 1, x: CFG.width / 2 + nL * 50, y: 170, scale: 0 }, Bt(tStar)); tl.to(star, { scale: 1, rotation: 90, duration: 0.4, ease: 'enter' }, Bt(tStar));
  const tSub = (s.logoStart || 1) + nL * 0.75 + 0.25;
  const L2 = mk('div', 'logo2', typeEl); L2.textContent = CFG.logo.subtitle; tl.set(L2, { autoAlpha: 0 }, 0); MK.tracking(tl, L2, Bt(tSub), { from: '1.2em', to: '0.3em' });
  qa('span', L).forEach((sp, j) => { const t = Bt(tSub + 1.5 + j * 0.4); if (t >= s.t1 - 0.6) return; tl.set(sp, { y: -40 }, t); tl.to(sp, { y: 0, duration: 0.2, ease: 'enter' }, t); });
  // hand-off to the title: logo collapses on the phrase end
  tl.to([L, L2, star], { scale: 0, duration: 0.3, ease: 'exit' }, s.t1 - 0.3);
}
function finaleLogo(s, typeEl, at) {
  const box = mk('div', '', typeEl, 'position:absolute;left:0;right:0;top:40px;text-align:center;');
  const L = mk('div', '', box, `display:inline-block;font:700 150px ${CFG.fonts.display};color:${INK.main};-webkit-text-stroke:14px #FFFFFF;paint-order:stroke fill;text-shadow:10px 10px 0 ${INK.accent};visibility:hidden`); L.textContent = CFG.logo.title;
  const L2 = mk('div', '', box, `font:600 64px ${CFG.fonts.display};letter-spacing:0.3em;color:#FFFFFF;-webkit-text-stroke:8px ${INK.main};paint-order:stroke fill;visibility:hidden`); L2.textContent = CFG.logo.subtitle;
  MK.slam(tl, L, at, { from: 2.2 }); tl.set(L2, { autoAlpha: 0 }, 0); MK.tracking(tl, L2, at + 0.2, { from: '1em', to: '0.3em' });
}

// ---------------------------------------------------------------- assemble
SHOTS.forEach((s, idx) => {
  const el = document.getElementById(s.id);
  const cam = q('.cam', el), bg = q('.bg', el), chars = q('.chars', el), fx = q('.fx', el), type = q('.type', el);
  bgBuild(s, bg, idx); decoBuild(s, fx); camBuild(s, cam, idx); charsBuild(s, chars, fx); typeBuild(s, type, bg, idx);
  entrance(s, el, idx);
  tl.set(el, { autoAlpha: 0 }, s.t1);
});
// smear covers for exposed plate frames
const lines = MK.speedLines('#lines', { count: 44, seed: 11, color: '#FFFFFF', minWidth: 3, maxWidth: 9, width: CFG.width, height: CFG.height });
MK.cover(tl, COVERS.map((c) => ({ start: Math.round(c.s * 24), end: Math.round(c.e * 24) - 1 })), { lines: lines, flash: '#flash', peak: 0.25 });
// downbeat flashes on section starts
(CFG.sectionFlashes || []).forEach((k) => MK.flash(tl, '#flash', Bt(k), { peak: 0.7, dur: 0.35 }));
tl.set({}, {}, DUR);
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
