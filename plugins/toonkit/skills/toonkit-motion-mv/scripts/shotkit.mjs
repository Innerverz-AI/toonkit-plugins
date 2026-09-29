#!/usr/bin/env node
// shotkit: build a HyperFrames composition (index.html) and PLAN.json from one data file (shots.json).
// usage: node shotkit.mjs <project-dir>   (reads <project>/shots.json, writes <project>/index.html and PLAN.json)
// Shot times are beat numbers on the project grid; see references/COMPOSITION.md for the schema.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) { process.stderr.write('usage: shotkit.mjs <project-dir>\n'); process.exit(2); }
const P = (f) => path.join(dir, f);
const C = JSON.parse(fs.readFileSync(P('shots.json'), 'utf8'));
const FPS = C.fps || 24, W = C.width || 1920, H = C.height || 1080, DUR = C.duration;
const BPM = C.bpm, OFF = C.offset || 0, BT = 60 / BPM;
if (!DUR || !BPM) { process.stderr.write('shots.json needs duration and bpm\n'); process.exit(2); }
const B = (n) => +(OFF + n * BT).toFixed(4);
const F = (t) => Math.round(t * FPS);
const KINDS = new Set(['logo', 'letters', 'names', 'cuts', 'alternate', 'plate', 'split3', 'kaleido', 'duo', 'pose', 'finale']);

// ---- defaults (overridable in shots.json). The palette is required: the look belongs to the brief.
if (!C.palette || !Object.keys(C.palette).length) { process.stderr.write('shots.json needs a palette {name: {bg1, bg2, acc, soft}}\n'); process.exit(2); }
const PALS = Object.values(C.palette); const FIRST = PALS[0];
const CFG = {
  fps: FPS, width: W, height: H, seed: C.seed || 20260929,
  palette: C.palette,
  ink: Object.assign({main: FIRST.bg2, accent: FIRST.acc, outline: '#2B1B33'}, C.ink || {}),
  fonts: Object.assign({display: "'Fredoka', sans-serif", crop: "'Dela Gothic One', sans-serif", css: []}, C.fonts || {}),
  decoColors: C.decoColors || null,
  panelColors: C.panelColors || PALS.map((p) => p.bg1).concat(PALS.map((p) => p.bg2)).slice(0, 3),
  logo: Object.assign({title: 'ToonKit', subtitle: 'ANIMATION', letterColors: null}, C.logo || {}),
  sectionFlashes: C.sectionFlashes || [],
};
CFG.decoColors = CFG.decoColors || ['#FFFFFF', CFG.ink.accent, CFG.ink.main, '#FFFFFF'];
CFG.logo.letterColors = CFG.logo.letterColors || [CFG.ink.main, CFG.ink.accent].concat(PALS.map((p) => p.bg1));
const TX = (C.textStyles || [
  {fill: CFG.ink.accent, stroke: CFG.ink.main, shadow: '#FFFFFF'},
  {fill: CFG.ink.main, stroke: '#FFFFFF', shadow: CFG.ink.accent},
  {fill: '#FFFFFF', stroke: CFG.ink.main, shadow: CFG.ink.accent}]);

// ---- plates: duration and smear windows from analysis files; optional cycle phase
const plates = {};
for (const [id, p] of Object.entries(C.plates || {})) {
  const a = JSON.parse(fs.readFileSync(P(p.analysis), 'utf8')).summary;
  const cyc = p.cycle ? JSON.parse(fs.readFileSync(P(p.cycle), 'utf8')) : null;
  plates[id] = {src: p.src, seconds: a.frames / (a.fps || FPS), smearCover: a.smearCover || [], phase: cyc && cyc.phase ? cyc.phase : null};
}

// ---- shots
const S = C.shots.map((s) => ({...s}));
for (const s of S) {
  if (!KINDS.has(s.kind)) throw new Error(`${s.id}: unknown kind ${s.kind}`);
  s.t0 = B(s.a); s.t1 = s.b === null || s.b === undefined ? DUR : B(s.b); s.b = s.b === undefined ? null : s.b;
  s.text = s.text || [];
}
S[0].t0 = 0;

const media = [];
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function poseEl(id, cls = '') {
  const flip = /f$/.test(id) && !fs.existsSync(P(`poses/${id}.png`)); const base = flip ? id.slice(0, -1) : id;
  if (!fs.existsSync(P(`poses/${base}.png`))) throw new Error(`missing pose image poses/${base}.png`);
  return `<div class="pw ${flip ? 'flip' : ''} ${cls}"><img class="pose" src="poses/${base}.png" /></div>`;
}
function plateEl(p, t0, t1, cls = '') {
  const meta = plates[p.id]; if (!meta) throw new Error('unknown plate ' + p.id);
  const dur = +(t1 - t0).toFixed(3);
  let m = p.m || 0;
  if (meta.phase) { // snap the media start onto a motion extremum so cycles land on the shot's beats
    const k = Math.max(0, Math.round((m * FPS - meta.phase.firstFrame) / meta.phase.period)); m = (meta.phase.firstFrame + k * meta.phase.period) / FPS;
  }
  let ms = Math.min(m, Math.max(0, meta.seconds - dur - 0.05));
  if (meta.phase && ms < m) { const k = Math.floor((ms * FPS - meta.phase.firstFrame) / meta.phase.period); ms = Math.max(0, (meta.phase.firstFrame + k * meta.phase.period) / FPS); }
  if (meta.seconds < dur - 0.05) process.stderr.write(`warning: plate ${p.id} (${meta.seconds.toFixed(2)}s) is shorter than its use (${dur}s); it will hold on its last frame\n`);
  const vid = `v${media.length}_${p.id}`;
  media.push({id: p.id, t0, dur, m: ms});
  return `<div class="vw ${cls}"${p.scale ? ` style="--s:${+p.scale}"` : ''}><video id="${vid}" class="clip plate" src="${esc(meta.src)}" muted playsinline data-start="${t0.toFixed(3)}" data-duration="${dur}" data-media-start="${ms.toFixed(3)}"></video></div>`;
}
let body = '';
for (const s of S) {
  let chars = '';
  if (s.kind === 'logo') chars = (s.chars || []).map((c, i) => `<div class="lc" data-i="${i}"${c.at === 0 ? ` style="visibility:visible;transform:translate(${c.x}px,${c.y}px) scale(${c.s})"` : ''}>${poseEl(c.pose)}</div>`).join('');
  else if (s.kind === 'kaleido') chars = plateEl(s.plate, s.t0, s.t1, 'kal');
  else if (s.kind === 'plate' || s.kind === 'letters' || s.kind === 'names') {
    chars = plateEl(s.plate, s.t0, s.t1, 'mask-' + (s.plate.mask || 'none'));
    const pn = s.kind === 'names' && (s.names || []).find((n) => n.pose); if (pn) chars += poseEl(pn.pose, 'namepose');
  } else if (s.kind === 'duo') chars = plateEl(s.plate, s.t0, s.t1, 'mask-left') + plateEl(s.plate2, s.t0, s.t1, 'mask-right');
  else if (s.kind === 'split3') chars = [0, 1, 2].map((i) => `<div class="panel p${i}"><div class="pbg"></div>${poseEl(s.poses[0], 'pa')}${poseEl(s.poses[1], 'pb')}</div>`).join('');
  else if (s.kind === 'finale') chars = poseEl(s.poses[0]);
  else chars = s.poses.map((p) => poseEl(p)).join('') + (s.endPose ? poseEl(s.endPose.pose, 'endpose') : '');
  body += `<div class="shot" id="${esc(s.id)}"><div class="cam"><div class="bg"></div><div class="chars">${chars}</div><div class="fx"></div></div><div class="type"></div></div>\n`;
}
const covers = media.flatMap((u) => (plates[u.id].smearCover || []).map((c) => ({s: c.start / FPS - u.m + u.t0, e: (c.end + 1) / FPS - u.m + u.t0})).filter((w) => w.e > u.t0 && w.s < u.t0 + u.dur));

const css = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${CFG.ink.accent}; }
#root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; font-family: ${CFG.fonts.display}; }
#world, .shot, .cam, .bg, .chars, .fx, .type, .overlay { position: absolute; inset: 0; }
.shot { visibility: hidden; overflow: hidden; }
.cam { transform-origin: 50% 50%; }
.cam > .bg { inset: -240px; overflow: hidden; }
.chars { transform-origin: 50% 100%; }
.pw { position: absolute; inset: 0; visibility: hidden; transform-origin: 50% 96%; }
.pw.flip img { transform: scaleX(-1); }
img.pose { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.vw { position: absolute; inset: 0; }
video.plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.mask-circle { clip-path: circle(30% at 50% 47%); }
.mask-heart { clip-path: path('M${W / 2} ${H * 0.93} C ${W * 0.26} ${H * 0.67} ${W * 0.19} ${H * 0.4} ${W * 0.29} ${H * 0.23} C ${W * 0.375} ${H * 0.1} ${W * 0.47} ${H * 0.18} ${W / 2} ${H * 0.31} C ${W * 0.53} ${H * 0.18} ${W * 0.625} ${H * 0.1} ${W * 0.71} ${H * 0.23} C ${W * 0.81} ${H * 0.4} ${W * 0.74} ${H * 0.67} ${W / 2} ${H * 0.93} Z'); }
.vw.kal { width: ${W / 2}px; overflow: hidden; -webkit-box-reflect: right 0; }
.vw.kal video { width: ${W}px; }
.mask-left { clip-path: inset(0 25% 0 25%); transform: translateX(-${W / 4}px) scale(var(--s, 1)); }
.mask-right { clip-path: inset(0 25% 0 25%); transform: translateX(${W / 4}px) scale(var(--s, 1)); }
.panel { position: absolute; inset: 0; visibility: hidden; }
.panel .pbg { position: absolute; inset: 0; }
.panel.p0 { clip-path: inset(0 66.66% 0 0); }
.panel.p1 { clip-path: inset(0 33.33% 0 33.34%); }
.panel.p2 { clip-path: inset(0 0 0 66.67%); }
.lc { position: absolute; inset: 0; visibility: hidden; transform-origin: 50% 90%; }
.lc .pw { visibility: visible; }
.tx { position: absolute; left: 0; right: 0; text-align: center; font-weight: 700; line-height: 1.05; white-space: nowrap; visibility: hidden;
  color: ${TX[2].fill}; -webkit-text-stroke: 14px ${TX[2].stroke}; paint-order: stroke fill; text-shadow: 10px 10px 0 ${TX[2].shadow}; letter-spacing: 0.01em; }
.tx.p { color: ${TX[1].fill}; -webkit-text-stroke: 14px ${TX[1].stroke}; text-shadow: 10px 10px 0 ${TX[1].shadow}; }
.tx.y { color: ${TX[0].fill}; -webkit-text-stroke: 14px ${TX[0].stroke}; text-shadow: 10px 10px 0 ${TX[0].shadow}; }
.tx .mk-mask { padding: 0.18em 0.06em; margin: -0.18em -0.06em; }
.crop { position: absolute; left: 0; top: ${H * 0.3}px; white-space: nowrap; font-family: ${CFG.fonts.crop}; font-size: ${H * 0.3}px; line-height: 1; color: transparent; -webkit-text-stroke: 6px rgba(255,255,255,0.85); visibility: hidden; }
.bar { position: absolute; left: 0; right: 0; height: 190px; background: ${CFG.ink.main}; }
.sp { position: absolute; width: 60px; height: 60px; visibility: hidden; }
.ring { position: absolute; left: 50%; top: 50%; width: 700px; height: 700px; margin: -350px 0 0 -350px; border-radius: 50%; border: 46px solid rgba(255,255,255,0.55); visibility: hidden; }
.logo { position: absolute; left: 0; right: 0; top: ${H * 0.23}px; text-align: center; font-size: 250px; font-weight: 700; line-height: 1; }
.logo span { display: inline-block; -webkit-text-stroke: 18px #FFFFFF; paint-order: stroke fill; text-shadow: 12px 12px 0 ${CFG.ink.outline}; visibility: hidden; }
.logo2 { position: absolute; left: 0; right: 0; top: ${H * 0.49}px; text-align: center; font-size: 96px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.3em; -webkit-text-stroke: 10px ${CFG.ink.main}; paint-order: stroke fill; visibility: hidden; }
#flash { background: #FFFFFF; visibility: hidden; }
#vignette { background: radial-gradient(ellipse 80% 75% at 50% 48%, transparent 62%, ${CFG.ink.main}47 100%); pointer-events: none; }
`;
const runtime = fs.readFileSync(path.join(HERE, 'shotkit-runtime.js'), 'utf8');
const audio = C.audio ? `<audio id="music" data-timeline-role="music" class="clip" data-start="0" data-duration="${DUR}" src="${esc(C.audio)}" data-has-audio="true"></audio>` : '';
const html = `<!doctype html>
<html lang="${esc(C.lang || 'en')}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${W}, height=${H}" />
${CFG.fonts.css.map((c) => `<link rel="stylesheet" href="${esc(c)}" />`).join('')}
<script src="vendor/gsap.min.js"></script><script src="vendor/CustomEase.min.js"></script><script src="vendor/motionkit.js"></script>
<style>${css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
${audio}
<div id="world">
${body}</div>
<div id="lines" class="overlay"></div>
<div id="flash" class="overlay"></div>
<div id="vignette" class="overlay"></div>
</div>
<script>
const SHOTS = ${JSON.stringify(S)};
const COVERS = ${JSON.stringify(covers)};
const CFG = ${JSON.stringify(CFG)};
const BPM = ${BPM}, OFF = ${OFF}, BT = 60 / BPM, DUR = ${DUR};
${runtime}
</script>
</body></html>
`;
fs.writeFileSync(P('index.html'), html);

// ---- PLAN.json for plan-check (same source of truth)
const plan = {fps: FPS, bpm: BPM, beatOffset: OFF, duration: DUR, width: W, height: H,
  shots: S.map((s) => ({id: s.id, type: s.type, in: F(s.t0), out: F(s.t1), focal: s.focal,
    poses: s.poses ? (s.poses.length === 1 ? [s.poses[0], s.poses[0] + '-hold'] : s.poses.concat(s.endPose ? [s.endPose.pose] : [])) : undefined,
    character: s.plate ? {source: s.plate.id, fastAction: !!s.fastAction} : undefined, innerChangesEveryBeats: s.innerChangesEveryBeats,
    text: s.text.map((t) => ({at: F(B(t.at)), content: t.content, primitive: t.primitive}))}))};
fs.writeFileSync(P('PLAN.json'), JSON.stringify(plan, null, 1));
process.stdout.write(JSON.stringify({shots: S.length, plateUses: media.length, covers: covers.length, duration: DUR, review: S.map((s) => +((s.t0 + s.t1) / 2).toFixed(2))}) + '\n');
