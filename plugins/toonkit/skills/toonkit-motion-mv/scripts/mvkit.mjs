#!/usr/bin/env node
// mvkit: processing toolkit for ToonKit 2D anime motion-graphics videos.
// Zero npm dependencies. Requires Node 20+ and ffmpeg/ffprobe on PATH.
// HyperFrames itself (compositing/rendering) requires Node 22+.
//
// Commands (run `node mvkit.mjs <command> --help` style: see USAGE below):
//   doctor                         check node/ffmpeg/encoders
//   analyze <plate.mp4> <out.json> per-frame matte, motion, sharpness, holds, events, smear windows
//   key <in> <out> [opts]          chroma key a plate video (-> .webm alpha or PNG dir) or one image (-> .png)
//   contact <video> <out.png>      contact sheet
//   beatgrid                       beat grid JSON from BPM/offset
//   plan-check <PLAN.json>         validate a shot plan against the spec's grammar rules
//   lint <composition.html>        motion-token lint of an authored composition
//   scaffold <dir>                 create a HyperFrames project with vendored GSAP + motionkit
//   font <dir> <family> [weights]  vendor a Google Font (woff2 + CSS) into a project
//   bitrate <capMB> <seconds>      video bitrate for a file-size cap
//   grid / snap                    beat phase from audio onsets; snap lyric times to vocal onsets and beats
//   cycle <plate>                  measure a cyclic motion and emit a retime map onto the beat grid
//   transcript / review            compact whisper transcript; snapshot contact sheet at shot midpoints
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PINS = {hyperframes: '0.8.91', gsap: '3.14.2'};

// ---------- small utils ----------
function die(msg, code = 2) { process.stderr.write('mvkit: ' + msg + '\n'); process.exit(code); }
function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) opt[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opt[a.slice(2)] = argv[++i];
      else opt[a.slice(2)] = true;
    } else pos.push(a);
  }
  return {pos, opt};
}
function num(v, d) { if (v === undefined || v === true) return d; const n = Number(v); if (!Number.isFinite(n)) die('not a number: ' + v); return n; }
function median(arr) { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); if (!m) die('bad color ' + h);
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function which(bin) { const r = spawnSync(bin, ['-version'], {encoding: 'utf8'}); return r.status === 0 ? r.stdout.split('\n')[0] : null; }

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_packets', '-of', 'json', file], {encoding: 'utf8'});
  if (r.status !== 0) die('ffprobe failed on ' + file + ': ' + r.stderr.trim());
  const s = JSON.parse(r.stdout).streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return {w: s.width, h: s.height, fps: b ? a / b : a, frames: Number(s.nb_read_packets) || 0};
}

// Async iterator over decoded RGB24 (or RGBA) frames.
async function* frames(file, {pixfmt = 'rgb24', w, h}) {
  const bpp = pixfmt === 'rgba' ? 4 : 3; const size = w * h * bpp;
  const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', pixfmt, '-'], {stdio: ['ignore', 'pipe', 'pipe']});
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  const closed = new Promise((res) => p.on('close', res)); // attach now: 'close' can fire before the stream is drained
  let buf = Buffer.alloc(0);
  for await (const chunk of p.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= size) {
      yield new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + size));
      buf = buf.subarray(size);
    }
  }
  const code = await closed;
  if (code !== 0 && code !== null) die('ffmpeg decode failed: ' + err.trim());
}

function encoder(args) {
  const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: ['pipe', 'ignore', 'pipe']});
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg encode failed: ' + err.trim())))));
  return {
    async write(frame) { if (!p.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength))) await new Promise((r) => p.stdin.once('drain', r)); },
    async close() { p.stdin.end(); await done; },
  };
}

// ---------- image ops on single-channel Float32 planes ----------
function blur(src, w, h, sigma) {
  if (sigma <= 0) return src.slice();
  const r = Math.max(1, Math.ceil(sigma * 3)); const k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h); const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; v += src[o + xx] * k[i + r]; } tmp[o + x] = v; } }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; v += tmp[yy * w + x] * k[i + r]; } out[y * w + x] = v; } }
  return out;
}
// Morphological max/min with alternating square/plus kernels (octagonal approximation of a disc).
function morph(src, w, h, iters, isMax) {
  let a = src.slice(); let b = new Float32Array(w * h);
  for (let it = 0; it < iters; it++) {
    const square = it % 2 === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = a[y * w + x];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!square && dx !== 0 && dy !== 0) continue;
        const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const u = a[yy * w + xx]; v = isMax ? (u > v ? u : v) : (u < v ? u : v);
      }
      b[y * w + x] = v;
    }
    const t = a; a = b; b = t;
  }
  return a;
}

// ---------- chroma model ----------
// Key modes: green (G dominant), blue (B dominant), magenta (R and B dominant over G).
function keyModeFor(bg) {
  const [r, g, b] = bg;
  if (g > r + 40 && g > b + 40) return 'green';
  if (b > r + 40 && b > g + 40) return 'blue';
  if (r > g + 40 && b > g + 40) return 'magenta';
  return null;
}
function dominance(mode, r, g, b) {
  if (mode === 'green') return g - (r > b ? r : b);
  if (mode === 'blue') return b - (r > g ? r : g);
  return (r < b ? r : b) - g; // magenta
}
function sampleBorder(rgb, w, h, band = 20) {
  // Top band plus left/right bands; the bottom edge is excluded because plates often crop the body there.
  const R = [], G = [], B = [];
  const push = (x, y) => { const i = (y * w + x) * 3; R.push(rgb[i]); G.push(rgb[i + 1]); B.push(rgb[i + 2]); };
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x += 2) push(x, y);
  for (let y = band; y < h; y += 2) { for (let x = 0; x < band; x++) push(x, y); for (let x = w - band; x < w; x++) push(x, y); }
  const std = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
  const bg = [median(R), median(G), median(B)];
  return {bg, std: [std(R, bg[0]), std(G, bg[1]), std(B, bg[2])]};
}
function hardMatte(rgb, w, h, mode, lo) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 3) m[i] = dominance(mode, rgb[p], rgb[p + 1], rgb[p + 2]) < lo ? 1 : 0;
  return m;
}

// ---------- analyze ----------
function derive(F, fps, h, staticE, smearRatio) {
  // Static spans: runs of near-zero matte energy (>= 6 frames). Action spans: the rest.
  const spans = []; let s = 0;
  const isStatic = (i) => i === 0 ? F.length > 1 && F[1].energy < staticE : F[i].energy < staticE;
  for (let i = 1; i <= F.length; i++) {
    if (i === F.length || isStatic(i) !== isStatic(s)) { spans.push({start: s, end: i - 1, kind: isStatic(s) ? 'static' : 'action'}); s = i; }
  }
  const merged = [];
  for (const sp of spans) {
    const len = sp.end - sp.start + 1;
    if (sp.kind === 'static' && len < 6 && merged.length) { merged[merged.length - 1].end = sp.end; continue; }
    if (sp.kind === 'action' && len < 3) { if (merged.length) { merged[merged.length - 1].end = sp.end; continue; } sp.kind = 'static'; }
    if (merged.length && merged[merged.length - 1].kind === sp.kind) { merged[merged.length - 1].end = sp.end; continue; }
    merged.push({...sp});
  }
  const staticFrames = []; for (const sp of merged) if (sp.kind === 'static') for (let i = sp.start; i <= sp.end; i++) staticFrames.push(F[i].sharp);
  const refSharp = staticFrames.length ? median(staticFrames) : median(F.map((x) => x.sharp));
  const smear = F.filter((x) => x.area > 0 && x.sharp < smearRatio * refSharp).map((x) => x.f);
  const cover = []; for (const f of smear) { const last = cover[cover.length - 1]; if (last && f - last.end <= 3) last.end = f; else cover.push({start: f, end: f}); }
  for (const c of cover) { c.start = Math.max(0, c.start - 1); c.end = Math.min(F.length - 1, c.end + 1); }
  // Airborne detection from the lowest matte point (meaningful only when feet are in frame).
  const bottoms = F.filter((x) => x.bottom !== null).map((x) => x.bottom);
  const ground = median(bottoms); const feetInFrame = ground < h - 2;
  const events = [];
  if (feetInFrame) { let air = false; for (const x of F) { if (x.bottom === null) continue; const lift = ground - x.bottom; if (lift > 20 && !air) { air = true; events.push({type: 'takeoff', f: x.f}); } if (lift <= 2 && air) { air = false; events.push({type: 'land', f: x.f}); } } }
  const dup = F.filter((x) => x.f > 0 && x.diff < 1.0).length;
  return {merged, refSharp, smear, cover, ground, feetInFrame, events, dup};
}

async function cmdAnalyze(pos, opt) {
  const [file, out] = pos; if (!file || !out) die('usage: analyze <plate> <out.json> [--lo 8] [--static-energy 0.5] [--smear-ratio 0.5] [--retime "src:dst,..." --frames N]');
  const info = probe(file); const {w, h} = info;
  const lo = num(opt.lo, 8); const staticE = num(opt['static-energy'], 0.5); const smearRatio = num(opt['smear-ratio'], 0.5);
  let mode = null, bgInfo = null, prevA = null, prevG = null;
  const F = [];
  let idx = 0;
  for await (const rgb of frames(file, {w, h})) {
    if (!mode) {
      bgInfo = sampleBorder(rgb, w, h); mode = keyModeFor(bgInfo.bg);
      if (!mode) die('background is not a chroma color (median ' + bgInfo.bg.map(Math.round) + '); plates must be generated on a flat chroma background');
    }
    const m = hardMatte(rgb, w, h, mode, lo);
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 3) gray[i] = (rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3;
    const mf = new Float32Array(w * h); for (let i = 0; i < m.length; i++) mf[i] = m[i];
    const inner = morph(mf, w, h, 4, false); // interior only: excludes the matte edge from sharpness
    let minX = w, minY = h, maxX = -1, maxY = -1, area = 0, sx = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { area++; sx += x; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    let lapN = 0, lapS = 0, lapS2 = 0, diffS = 0, diffN = 0, eS = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (inner[i] > 0.5) {
        const l = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
        lapN++; lapS += l; lapS2 += l * l;
        if (prevG) { diffS += Math.abs(gray[i] - prevG[i]); diffN++; }
      }
    }
    if (prevA) for (let i = 0; i < m.length; i++) eS += Math.abs(m[i] - prevA[i]);
    const sharp = lapN ? lapS2 / lapN - (lapS / lapN) ** 2 : 0;
    F.push({f: idx, bbox: area ? [minX, minY, maxX, maxY] : null, cx: area ? Math.round(sx / area) : null, bottom: area ? maxY : null,
      area, energy: prevA ? +(eS / m.length * 1000).toFixed(3) : 0, diff: prevG ? +(diffS / Math.max(1, diffN)).toFixed(3) : 0, sharp: +sharp.toFixed(1)});
    prevA = m; prevG = gray; idx++;
  }
  if (!F.length) die('no frames decoded');
  let FF = F;
  if (opt.retime) {
    const outFrames = opt.frames ? num(opt.frames) : F.length;
    const map = retimeMap(opt.retime, F.length, outFrames);
    FF = Array.from(map, (k, i) => ({...F[k], f: i, src: k, energy: i > 0 && map[i - 1] === k ? 0 : F[k].energy, diff: i > 0 && map[i - 1] === k ? 0 : F[k].diff}));
  }
  const {merged, refSharp, smear, cover, ground, feetInFrame, events, dup} = derive(FF, info.fps, h, staticE, smearRatio);
  const fps = info.fps;
  const summary = {
    file: path.basename(file), w, h, fps, frames: FF.length, sourceFrames: F.length, retime: opt.retime || null, keyMode: mode,
    bg: bgInfo.bg.map(Math.round), bgStd: bgInfo.std.map((v) => +v.toFixed(2)),
    bgFlat: bgInfo.std.every((v) => v < 3),
    duplicateFrames: dup, uniqueFrames: FF.length - dup,
    spans: merged.map((sp) => ({...sp, seconds: [+(sp.start / fps).toFixed(2), +((sp.end + 1) / fps).toFixed(2)]})),
    refSharpness: +refSharp.toFixed(1), smearFrames: smear.length, smearCover: cover,
    ground: feetInFrame ? ground : null, events,
  };
  fs.writeFileSync(out, JSON.stringify({summary, frames: FF}));
  process.stdout.write(JSON.stringify(summary, null, 1) + '\n');
}

// ---------- key ----------
function buildKeyer(opt, bg, mode) {
  const lo = num(opt.lo, 8), hi = num(opt.hi, 50);
  const aaSigma = num(opt.aa, 0.9);
  const rims = [];
  for (const [k, def] of [['rim-left', [7, 4]], ['rim-right', [-7, 0]]]) if (opt[k]) rims.push({color: hexToRgb(opt[k]), dx: def[0], dy: def[1], k: num(opt['rim-strength'], 0.7)});
  const stroke = opt.stroke ? {width: num(opt.stroke, 6), color: hexToRgb(opt['stroke-color'] || '#ffffff')} : null;
  const keepShadow = !!opt['keep-shadow'];
  const bgLuma = (bg[0] + bg[1] + bg[2]) / 3;
  return function keyFrame(rgb, w, h, strokeGain = 1) {
    const n = w * h; let a = new Float32Array(n); const out = new Uint8Array(n * 4); const shadow = keepShadow ? new Float32Array(n) : null;
    for (let i = 0, p = 0; i < n; i++, p += 3) {
      let r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
      const d = dominance(mode, r, g, b);
      a[i] = d <= lo ? 1 : d >= hi ? 0 : 1 - (d - lo) / (hi - lo);
      if (d > 0) { // despill
        if (mode === 'green') g = r > b ? r : b; else if (mode === 'blue') b = r > g ? r : g;
        else { const m = r < b ? r : b; const ex = m - g; r -= ex; b -= ex; }
      }
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
      if (shadow && a[i] < 0.5) { const l = (rgb[p] + rgb[p + 1] + rgb[p + 2]) / 3; shadow[i] = Math.max(0, Math.min(1, (bgLuma - l) / (bgLuma * 0.5))); }
    }
    if (aaSigma > 0) { a = blur(a, w, h, aaSigma); for (let i = 0; i < n; i++) { const v = (a[i] - 0.08) / 0.84; a[i] = v < 0 ? 0 : v > 1 ? 1 : v; } }
    for (const rim of rims) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (a[i] <= 0) continue;
        const sample = (m) => { const xx = x - rim.dx * m, yy = y - rim.dy * m; return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx]; };
        const e = Math.max(a[i] - sample(1), 0.5 * (a[i] - sample(2))) * a[i] * rim.k;
        if (e <= 0) continue;
        for (let c = 0; c < 3; c++) { const v = out[i * 4 + c]; out[i * 4 + c] = 255 - (255 - v) * (1 - e * rim.color[c] / 255); }
      }
    }
    let final = a;
    if (stroke && strokeGain > 0.01) {
      const simp = blur(a, w, h, 2); for (let i = 0; i < n; i++) simp[i] = simp[i] > 0.43 ? 1 : 0;
      let grown = morph(simp, w, h, Math.round(stroke.width), true); grown = blur(grown, w, h, 0.8);
      final = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const sa = grown[i] * strokeGain; const ca = a[i]; const oa = ca + sa * (1 - ca);
        final[i] = oa;
        if (oa > 0) for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((out[i * 4 + c] * ca + stroke.color[c] * sa * (1 - ca)) / oa);
      }
    }
    for (let i = 0; i < n; i++) {
      let al = final[i];
      if (shadow && al < 0.02 && shadow[i] > 0) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; al = shadow[i] * 0.45; }
      out[i * 4 + 3] = Math.round(al * 255);
    }
    return out;
  };
}
function retimeMap(spec, srcFrames, outFrames) {
  // spec: "src:dst,src:dst,..." anchors (frame numbers). Output frame -> nearest source frame (no blending).
  const anchors = String(spec).split(',').map((p) => p.split(':').map(Number)).sort((x, y) => x[1] - y[1]);
  if (anchors.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))) die('bad --retime spec: ' + spec);
  if (anchors[0][1] !== 0) anchors.unshift([0, 0]);
  const last = anchors[anchors.length - 1]; if (last[1] < outFrames - 1) anchors.push([Math.min(srcFrames - 1, last[0] + (outFrames - 1 - last[1])), outFrames - 1]);
  for (let i = 1; i < anchors.length; i++) if (anchors[i][0] < anchors[i - 1][0]) die('retime anchors must be monotonic (no reversal)');
  const map = new Int32Array(outFrames);
  for (let f = 0; f < outFrames; f++) {
    let j = 1; while (j < anchors.length - 1 && anchors[j][1] < f) j++;
    const [s0, d0] = anchors[j - 1], [s1, d1] = anchors[j];
    const t = d1 === d0 ? 0 : (f - d0) / (d1 - d0);
    map[f] = Math.max(0, Math.min(srcFrames - 1, Math.round(s0 + t * (s1 - s0))));
  }
  return map;
}
async function cmdKey(pos, opt) {
  const [input, output] = pos;
  if (!input || !output) die('usage: key <plate.mp4|image.png> <out.webm|outdir/|out.png> [--lo 8 --hi 50 --aa 0.9] [--rim-left #hex --rim-right #hex --rim-strength 0.7] [--stroke px --stroke-color #hex --stroke-adaptive analysis.json] [--keep-shadow] [--retime "src:dst,..." --frames N] [--center-x] [--fit WxH]');
  const info = probe(input); const {w, h} = info;
  const isImage = /\.(png|jpe?g|webp)$/i.test(input);
  let keyer = null, mode = null, bgInfo = null;
  const adaptive = opt['stroke-adaptive'] ? JSON.parse(fs.readFileSync(opt['stroke-adaptive'], 'utf8')) : null;
  const gainFor = (f) => { if (!adaptive) return 1; const fr = adaptive.frames[f]; const ref = adaptive.summary.refSharpness || 1; if (!fr) return 1; const r = fr.sharp / ref; return r >= 0.7 ? 1 : r <= 0.4 ? 0 : (r - 0.4) / 0.3; };
  const init = (rgb) => {
    bgInfo = sampleBorder(rgb, w, h); mode = keyModeFor(bgInfo.bg);
    if (!mode) die('background is not a chroma color (median ' + bgInfo.bg.map(Math.round) + ')');
    keyer = buildKeyer(opt, bgInfo.bg, mode);
  };
  if (isImage) {
    for await (const rgb of frames(input, {w, h})) {
      init(rgb); let rgba = keyer(rgb, w, h);
      let ow = w, oh = h;
      if (opt['center-x']) { rgba = centerX(rgba, w, h); }
      const enc = [];
      if (opt.fit) { const [fw, fh] = String(opt.fit).split('x').map(Number); enc.push('-vf', `scale=${fw}:${fh}:force_original_aspect_ratio=decrease,pad=${fw}:${fh}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`); ow = fw; oh = fh; }
      const e = encoder(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', ...enc, '-frames:v', '1', output]);
      await e.write(rgba); await e.close();
      const bb = bboxOfAlpha(rgba, w, h);
      fs.writeFileSync(output.replace(/\.png$/i, '') + '.json', JSON.stringify({src: path.basename(input), w, h, out: [ow, oh], keyMode: mode, bg: bgInfo.bg.map(Math.round), bgStd: bgInfo.std.map((v) => +v.toFixed(2)), bbox: bb}));
      process.stdout.write(JSON.stringify({out: output, keyMode: mode, bg: bgInfo.bg.map(Math.round), bgStd: bgInfo.std.map((v) => +v.toFixed(2)), bbox: bb}) + '\n');
      return;
    }
  }
  const outFrames = opt.frames ? num(opt.frames) : info.frames;
  const map = opt.retime ? retimeMap(opt.retime, info.frames, outFrames) : null;
  const toPng = output.endsWith('/') || (fs.existsSync(output) && fs.statSync(output).isDirectory());
  if (toPng) fs.mkdirSync(output, {recursive: true});
  const enc = toPng ? null : encoder(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(info.fps), '-i', '-',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', String(num(opt.crf, 18)), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', output]);
  let src = 0, outIdx = 0, written = 0;
  const writeOut = async (rgba) => {
    if (toPng) { const e = encoder(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', path.join(output, String(written).padStart(4, '0') + '.png')]); await e.write(rgba); await e.close(); }
    else await enc.write(rgba);
    written++;
  };
  for await (const rgb of frames(input, {w, h})) {
    if (!keyer) init(rgb);
    if (map) {
      if (outIdx >= outFrames) break;
      if (map[outIdx] !== src) { src++; continue; }
      const rgba = keyer(rgb, w, h, gainFor(src));
      while (outIdx < outFrames && map[outIdx] === src) { await writeOut(rgba); outIdx++; }
    } else {
      await writeOut(keyer(rgb, w, h, gainFor(src)));
    }
    src++;
  }
  if (map) { // pad with the last source frame if the map points past the decoded range
    while (outIdx < outFrames) die('retime map references frame ' + map[outIdx] + ' beyond the plate');
  }
  if (enc) await enc.close();
  process.stdout.write(JSON.stringify({out: output, frames: written, fps: info.fps, keyMode: mode, bg: bgInfo.bg.map(Math.round), bgStd: bgInfo.std.map((v) => +v.toFixed(2)), retimed: !!map}) + '\n');
}
function bboxOfAlpha(rgba, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return maxX < 0 ? null : [minX, minY, maxX, maxY];
}
function centerX(rgba, w, h) {
  const bb = bboxOfAlpha(rgba, w, h); if (!bb) return rgba;
  const dx = Math.round(w / 2 - (bb[0] + bb[2]) / 2); if (!dx) return rgba;
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x - dx; if (sx < 0 || sx >= w) continue; const si = (y * w + sx) * 4, di = (y * w + x) * 4; out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3]; }
  return out;
}

// ---------- contact ----------
function cmdContact(pos, opt) {
  const [file, out] = pos; if (!file || !out) die('usage: contact <video> <out.png> [--every 12] [--width 320] [--cols 6]');
  const every = num(opt.every, 12), width = num(opt.width, 320), cols = num(opt.cols, 6);
  const info = probe(file); const n = Math.ceil(info.frames / every); const rows = Math.ceil(n / cols);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select='not(mod(n\\,${every}))',scale=${width}:-2,tile=${cols}x${rows}`, '-frames:v', '1', out], {encoding: 'utf8'});
  if (r.status !== 0) die(r.stderr);
  process.stdout.write(JSON.stringify({out, tiles: n, cols, rows, frames: Array.from({length: n}, (_, i) => i * every)}) + '\n');
}

// ---------- beat grid ----------
function cmdBeatgrid(pos, opt) {
  const bpm = num(opt.bpm), fps = num(opt.fps, 24), dur = num(opt.duration), offset = num(opt.offset, 0), perBar = num(opt['beats-per-bar'], 4);
  if (!bpm || !dur) die('usage: beatgrid --bpm 128 --duration 10 [--fps 24] [--offset 0] [--beats-per-bar 4]');
  const beats = []; for (let t = offset, i = 0; t < dur + 1e-9; t = offset + (++i) * 60 / bpm) beats.push({i, t: +t.toFixed(4), frame: Math.round(t * fps), downbeat: i % perBar === 0});
  const res = {bpm, fps, duration: dur, offset, beatSeconds: +(60 / bpm).toFixed(4), beatFrames: +(60 / bpm * fps).toFixed(3), beats};
  const text = JSON.stringify(res, null, 1); if (opt.out) fs.writeFileSync(opt.out, text); process.stdout.write(text + '\n');
}

// ---------- plan-check ----------
const PRIMITIVES = new Set(['reveal', 'slam', 'tracking', 'splitWipe', 'drawOn', 'counter', 'pathText', 'replace', 'cropType']);
function cmdPlanCheck(pos) {
  const [file] = pos; if (!file) die('usage: plan-check <PLAN.json>');
  const P = JSON.parse(fs.readFileSync(file, 'utf8')); const errs = [], warns = [];
  const fps = P.fps || 24; const shots = P.shots || [];
  if (!shots.length) errs.push('no shots');
  const beatF = P.bpm ? 60 / P.bpm * fps : null; const off = (P.beatOffset || 0) * fps;
  const onBeat = (f) => beatF ? Math.abs(((f - off) / beatF) - Math.round((f - off) / beatF)) * beatF <= 1.01 : true;
  let prevOut = null; const types = []; const textTimes = []; const prims = new Set();
  for (const s of shots) {
    const len = (s.out - s.in) / fps; types.push(s.type);
    if (!['T', 'C', 'M', 'P', 'X'].includes(s.type)) errs.push(`${s.id}: unknown type ${s.type}`);
    if (prevOut !== null && s.in !== prevOut) errs.push(`${s.id}: gap/overlap with previous shot (${prevOut} -> ${s.in})`);
    prevOut = s.out;
    const maxLen = s.type === 'C' || s.type === 'M' ? 5 : 4;
    if (s.type !== 'X' && len < 0.5) warns.push(`${s.id}: ${len.toFixed(2)}s is very short`);
    if (len > maxLen) errs.push(`${s.id}: ${len.toFixed(2)}s exceeds ${maxLen}s for type ${s.type}`);
    if ((s.type === 'C' || s.type === 'M') && len > 4 && !(s.innerChangesEveryBeats <= 2)) errs.push(`${s.id}: long character shot needs MG changes at least every 2 beats (set innerChangesEveryBeats)`);
    if (!s.focal) errs.push(`${s.id}: no focal element`);
    if (!onBeat(s.in)) warns.push(`${s.id}: cut at frame ${s.in} is off the beat grid`);
    for (const t of s.text || []) { textTimes.push(t.at); if (t.primitive) { if (!PRIMITIVES.has(t.primitive)) errs.push(`${s.id}: unknown kinetic primitive ${t.primitive}`); prims.add(t.primitive); } else errs.push(`${s.id}: text "${t.content}" has no kinetic primitive`); }
    if (s.type === 'P' && !(s.poses && s.poses.length >= 2)) errs.push(`${s.id}: pose-cut shot needs >= 2 poses`);
    if (s.type === 'C' && s.character && s.character.fastAction) errs.push(`${s.id}: fast action on a video plate; use a pose-cut (P) shot instead`);
  }
  if (types.length && (types[0] === 'C' || types[types.length - 1] === 'C')) errs.push('open and close on a T or M shot, not a bare C shot');
  textTimes.sort((a, b) => a - b); const total = P.duration || (shots.length ? shots[shots.length - 1].out / fps : 0);
  const pts = [0, ...textTimes.map((f) => f / fps), total];
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > 4.0001) errs.push(`no typographic event between ${pts[i - 1].toFixed(2)}s and ${pts[i].toFixed(2)}s (> 4s)`);
  if (prims.size < Math.min(4, textTimes.length)) warns.push(`only ${prims.size} distinct kinetic primitives (spec asks >= 4 per video)`);
  const res = {ok: !errs.length, errors: errs, warnings: warns, shots: shots.length, duration: total, primitives: [...prims]};
  process.stdout.write(JSON.stringify(res, null, 1) + '\n'); if (errs.length) process.exit(1);
}

// ---------- lint (motion tokens) ----------
function cmdLint(pos) {
  const [file] = pos; if (!file) die('usage: lint <composition.html>');
  const src = fs.readFileSync(file, 'utf8'); const errs = [], warns = [];
  const allowed = new Set(['enter', 'move', 'exit', 'slam', 'none']);
  const re = /ease\s*:\s*["'`]([^"'`]+)["'`]/g; let m; let easeCount = 0;
  while ((m = re.exec(src))) {
    easeCount++; const e = m[1];
    const ctx = src.slice(Math.max(0, m.index - 200), m.index + 60);
    const ambient = /ambient/i.test(ctx);
    if (allowed.has(e)) { if (e === 'none' && !/duration\s*:\s*0\b/.test(ctx) && !/\.set\(/.test(ctx) && !ambient) warns.push(`ease "none" on a timed tween near: ${ctx.replace(/\s+/g, ' ').slice(-80)}`); continue; }
    if (ambient && /^sine\./.test(e)) continue;
    errs.push(`disallowed ease "${e}" (use enter/move/exit/slam; sine.* only inside MK.ambient)`);
  }
  if (/Math\.random\s*\(/.test(src)) errs.push('Math.random() is non-deterministic; use MK.rng(seed)');
  if (/Date\.now\s*\(|performance\.now\s*\(/.test(src)) errs.push('wall-clock time used; animation must be a pure function of timeline time');
  if (/\brepeat\s*:\s*-1/.test(src)) errs.push('infinite repeat; use MK.ambient() with a finite duration');
  if (/\btl\.call\s*\(|\btimeline\([^)]*\)\s*\.call\s*\(/.test(src)) warns.push('timeline .call() callbacks may be skipped when the renderer seeks; drive state with .set() instead');
  if (/transition\s*:|animation\s*:/.test(src.replace(/<script[\s\S]*?<\/script>/g, ''))) warns.push('CSS transitions/animations are not timeline-driven; author all motion in the GSAP timeline');
  if (!/window\.__timelines/.test(src)) errs.push('root timeline is not registered on window.__timelines');
  if (!/MK\.init\s*\(/.test(src)) errs.push('MK.init() not called (motion tokens are not registered)');
  const res = {ok: !errs.length, errors: errs, warnings: warns, easeUses: easeCount};
  process.stdout.write(JSON.stringify(res, null, 1) + '\n'); if (errs.length) process.exit(1);
}

// ---------- scaffold ----------
function run(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, {cwd, encoding: 'utf8', env: {...process.env, ...env}, shell: process.platform === 'win32'});
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed:\n${(r.stderr || r.stdout || '').slice(-2000)}`);
  return r.stdout;
}
function cmdScaffold(pos, opt) {
  const [dir] = pos; if (!dir) die('usage: scaffold <dir> [--width 1920 --height 1080 --fps 24 --duration 10 --id main]');
  const W = num(opt.width, 1920), H = num(opt.height, 1080), fps = num(opt.fps, 24), dur = num(opt.duration, 10), id = opt.id || 'main';
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) die('target directory is not empty: ' + dir);
  const parent = path.dirname(path.resolve(dir)); fs.mkdirSync(parent, {recursive: true});
  run('npx', ['--yes', `hyperframes@${PINS.hyperframes}`, 'init', path.basename(dir), '--example', 'blank', '--non-interactive'], parent, {HYPERFRAMES_SKIP_SKILLS: '1'});
  // The generated agent files route to HyperFrames' own workflow skills; this project is governed by toonkit-motion-mv.
  for (const f of ['AGENTS.md', 'CLAUDE.md']) { const p = path.join(dir, f); if (fs.existsSync(p)) fs.rmSync(p); }
  run('npm', ['install', `gsap@${PINS.gsap}`, '--no-audit', '--no-fund', '--silent'], dir);
  for (const sub of ['vendor', 'assets', 'assets/fonts', 'plates', 'poses', 'analysis', 'renders', 'review']) fs.mkdirSync(path.join(dir, sub), {recursive: true});
  for (const f of ['gsap.min.js', 'CustomEase.min.js']) fs.copyFileSync(path.join(dir, 'node_modules/gsap/dist', f), path.join(dir, 'vendor', f));
  fs.copyFileSync(path.join(HERE, 'motionkit.js'), path.join(dir, 'vendor/motionkit.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), compositionSkeleton({W, H, fps, dur, id}));
  fs.writeFileSync(path.join(dir, 'PLAN.json'), JSON.stringify({fps, bpm: null, beatOffset: 0, duration: dur, width: W, height: H, shots: []}, null, 1));
  process.stdout.write(JSON.stringify({project: dir, hyperframes: PINS.hyperframes, gsap: PINS.gsap, width: W, height: H, fps, duration: dur}) + '\n');
}
function compositionSkeleton({W, H, fps, dur, id}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="vendor/gsap.min.js"></script>
<script src="vendor/CustomEase.min.js"></script>
<script src="vendor/motionkit.js"></script>
<!-- fonts: <link rel="stylesheet" href="assets/fonts/<family>.css" /> (vendored with mvkit font) -->
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  .clip { position: absolute; inset: 0; }
  .layer { position: absolute; inset: 0; transform-origin: 50% 45%; }
  video.plate, img.pose { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}" data-fps="${fps}">
  <!-- Shots are .clip elements with data-start/data-duration (seconds). Paint order = DOM order / z-index. -->
</div>
<script>
  MK.init({ fps: ${fps} });
  const tl = gsap.timeline({ paused: true });
  // Author every tween with MK primitives or eases "enter" | "move" | "exit" | "slam".
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
</script>
</body>
</html>
`;
}

// ---------- font ----------
async function cmdFont(pos) {
  const [dir, family, weights = '400'] = pos; if (!dir || !family) die('usage: font <project-dir> "<Google Font family>" [weights e.g. 400,700]');
  const q = encodeURIComponent(family).replace(/%20/g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${q}:wght@${weights.split(',').join(';')}&display=block`;
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}});
  if (!res.ok) die('font CSS fetch failed: ' + res.status + ' ' + url);
  let css = await res.text(); const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fdir = path.join(dir, 'assets/fonts', slug); fs.mkdirSync(fdir, {recursive: true});
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((x) => x[1]))];
  let i = 0;
  for (const u of urls) {
    const r = await fetch(u); if (!r.ok) die('font file fetch failed: ' + u);
    const name = `${slug}-${String(i++).padStart(3, '0')}.woff2`; fs.writeFileSync(path.join(fdir, name), Buffer.from(await r.arrayBuffer()));
    css = css.split(u).join(`${slug}/${name}`);
  }
  fs.writeFileSync(path.join(dir, 'assets/fonts', slug + '.css'), css);
  process.stdout.write(JSON.stringify({family, css: `assets/fonts/${slug}.css`, files: urls.length}) + '\n');
}

// ---------- bitrate ----------
function cmdBitrate(pos, opt) {
  const cap = num(pos[0]), secs = num(pos[1]), audio = num(opt.audio, 0);
  if (!cap || !secs) die('usage: bitrate <capMB> <seconds> [--audio kbps]');
  const kbps = Math.floor(cap * 8192 / secs - audio) ; const safe = Math.floor(kbps * 0.95);
  process.stdout.write(JSON.stringify({capMB: cap, seconds: secs, audioKbps: audio, videoKbps: kbps, recommended: safe + 'k'}) + '\n');
}


// ---------- audio analysis (onset flux) ----------
function decodeAudio(file, sr) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  if (r.status !== 0) die('ffmpeg audio decode failed: ' + String(r.stderr));
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
}
function fftMag(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
  const out = new Float32Array(n / 2); for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]); return out;
}
function onsetEnvelopes(file) {
  const sr = 22050, win = 1024, hop = 256; const x = decodeAudio(file, sr);
  const frames = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const hann = Float32Array.from({length: win}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (win - 1)));
  const binHz = sr / win; const v0 = Math.floor(1000 / binHz), v1 = Math.ceil(4000 / binHz);
  const all = new Float32Array(frames), voc = new Float32Array(frames); let prev = null;
  for (let f = 0; f < frames; f++) {
    const re = new Float32Array(win), im = new Float32Array(win);
    for (let i = 0; i < win; i++) re[i] = x[f * hop + i] * hann[i];
    const m = fftMag(re, im); const L = m.map((v) => Math.log1p(20 * v));
    if (prev) { let a = 0, v = 0; for (let k = 1; k < L.length; k++) { const d = L[k] - prev[k]; if (d > 0) { a += d; if (k >= v0 && k <= v1) v += d; } } all[f] = a; voc[f] = v; }
    prev = L;
  }
  return {t: (f) => (f * hop + win / 2) / sr, all, voc, hop, sr, win, duration: x.length / sr};
}
// frames are timestamped at the window centre
function envAt(env, arr, t) { const f = (t * env.sr - env.win / 2) / env.hop; const i = Math.floor(f); if (i < 0 || i + 1 >= arr.length) return 0; return arr[i] + (arr[i + 1] - arr[i]) * (f - i); }
function cmdGrid(pos, opt) {
  const [audio] = pos; if (!audio) die('usage: grid <audio> --bpm N | --beats beats.json [--from 5]');
  let bpm = opt.bpm ? num(opt.bpm) : null;
  if (!bpm && opt.beats) { const b = JSON.parse(fs.readFileSync(opt.beats, 'utf8')).beats.map((x) => (typeof x === 'number' ? x : x.time)); const iv = b.slice(1).map((t, i) => t - b[i]).filter((d) => d > 0.2 && d < 1.5); bpm = +(60 / median(iv)).toFixed(1); }
  if (!bpm) die('need --bpm or --beats');
  const env = onsetEnvelopes(audio); const T = 60 / bpm; const from = num(opt.from, 0);
  let best = null, sum = 0, cnt = 0;
  for (let off = 0; off < T; off += 0.002) { let v = 0; for (let t = off; t < env.duration; t += T) if (t >= from) v += envAt(env, env.all, t); sum += v; cnt++; if (!best || v > best.v) best = {off, v}; }
  const res = {bpm, offset: +best.off.toFixed(4), beatSeconds: +T.toFixed(5), confidence: +(best.v / (sum / cnt)).toFixed(3), duration: +env.duration.toFixed(3)};
  if (opt.bars) { // per-bar vocal/all onset energy for structure reading
    const per = num(opt['beats-per-bar'], 4); res.bars = [];
    for (let b = 0, t = res.offset; t < env.duration; b++, t += T * per) { let a = 0, v = 0, n = 0; for (let u = t; u < t + T * per; u += 0.01) { a += envAt(env, env.all, u); v += envAt(env, env.voc, u); n++; } res.bars.push({bar: b, t: +t.toFixed(2), onset: +(a / n).toFixed(2), vocal: +(v / n).toFixed(2)}); }
  }
  const text = JSON.stringify(res, null, 1); if (opt.out) fs.writeFileSync(opt.out, text); process.stdout.write(text + '\n');
}
function cmdSnap(pos, opt) {
  const bpm = num(opt.bpm), off = num(opt.offset, 0); const times = String(opt.times || pos.join(',')).split(',').filter(Boolean).map(Number);
  if (!bpm || !times.length) die('usage: snap --bpm N --offset S --times t1,t2,... [--audio file --window 0.6]');
  const T = 60 / bpm; const env = opt.audio ? onsetEnvelopes(opt.audio) : null; const w = num(opt.window, 0.6);
  const out = times.map((t0) => {
    let t = t0;
    if (env) { let bv = -1; for (let u = t0 - w; u <= t0 + w; u += 0.005) { const v = envAt(env, env.voc, u); if (v > bv) { bv = v; t = u; } } }
    const beat = Math.round((t - off) / T); return {input: t0, onset: +t.toFixed(3), beat, t: +(off + beat * T).toFixed(4)};
  });
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
async function cmdCycle(pos, opt) {
  const [file] = pos; if (!file) die('usage: cycle <plate.mp4> --bpm N [--beats 2] [--band 0.55,0.68] [--out cycle.json]');
  const bpm = num(opt.bpm); if (!bpm) die('--bpm required');
  const info = probe(file); const {w, h} = info; const fps = info.fps; const [b0, b1] = String(opt.band || '0.55,0.68').split(',').map(Number);
  const y0 = Math.floor(h * b0), y1 = Math.floor(h * b1); let mode = null; const cx = [];
  for await (const rgb of frames(file, {w, h})) {
    if (!mode) { mode = keyModeFor(sampleBorder(rgb, w, h).bg); if (!mode) die('not a chroma plate'); }
    let sx = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const p = (y * w + x) * 3; if (dominance(mode, rgb[p], rgb[p + 1], rgb[p + 2]) < 8) { sx += x; n++; } }
    cx.push(n ? sx / n : NaN);
  }
  const mean = cx.filter(Number.isFinite).reduce((a, b) => a + b, 0) / cx.filter(Number.isFinite).length;
  const c = cx.map((v, i) => { const a = [cx[i - 1], v, cx[i + 1]].filter(Number.isFinite); return a.reduce((s, x) => s + x, 0) / a.length - mean; });
  const amp = num(opt['min-amp'], 0.8); const ext = [];
  for (let i = 2; i < c.length - 2; i++) { const isMax = c[i] > c[i - 1] && c[i] >= c[i + 1] && c[i] > amp, isMin = c[i] < c[i - 1] && c[i] <= c[i + 1] && c[i] < -amp; if (!isMax && !isMin) continue; const sgn = isMax ? 1 : -1; if (ext.length && ext[ext.length - 1].s === sgn) { if (Math.abs(c[i]) > Math.abs(c[ext[ext.length - 1].f])) ext[ext.length - 1].f = i; continue; } ext.push({f: i, s: sgn}); }
  const ivs = ext.slice(1).map((e, i) => e.f - ext[i].f); const regular = []; const med = median(ivs);
  let run = [ext[0]]; for (let i = 1; i < ext.length; i++) { const d = ext[i].f - ext[i - 1].f; if (Math.abs(d - med) <= med * 0.35) run.push(ext[i]); else { if (run.length > regular.length) regular.splice(0, regular.length, ...run); run = [ext[i]]; } }
  if (run.length > regular.length) regular.splice(0, regular.length, ...run);
  if (regular.length < 3) die('no regular cycle found (extrema: ' + ext.map((e) => e.f).join(',') + ')');
  const period = median(regular.slice(1).map((e, i) => e.f - regular[i].f)); const beats = num(opt.beats, 2); const target = beats * 60 / bpm * fps;
  const speed = period / target; const first = regular[0].f; const last = regular[regular.length - 1].f;
  const map = regular.map((e, k) => `${e.f}:${Math.round(first + k * target)}`).join(',');
  const outFrames = Math.round(first + (regular.length - 1) * target) + (cx.length - 1 - last) + 1;
  const ok = speed >= 0.74 && speed <= 1.36;
  const alt = [0.5, 1, 2, 4].map((bb) => ({beats: bb, speed: +(period / (bb * 60 / bpm * fps)).toFixed(3)})).filter((a) => a.speed >= 0.74 && a.speed <= 1.36);
  const res = {frames: cx.length, fps, extrema: regular.map((e) => e.f), periodFrames: +period.toFixed(2), targetFrames: +target.toFixed(4), beatsPerSwing: beats,
    playbackSpeed: +speed.toFixed(3), withinSpeedLimits: ok, alternatives: alt, retime: map, outFrames, phase: {firstFrame: first, period: +target.toFixed(4)}};
  const text = JSON.stringify(res, null, 1); if (opt.out) fs.writeFileSync(opt.out, text); process.stdout.write(text + '\n');
  if (!ok) process.exit(3);
}
function cmdTranscript(pos) {
  const [file] = pos; if (!file) die('usage: transcript <transcript.json>');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const segs = (d.transcription || d.segments || []).map((s) => {
    const toks = (s.tokens || []).filter((t) => t.text && !t.text.startsWith('[') && t.text.trim());
    const from = s.offsets ? s.offsets.from / 1000 : s.start; const first = toks.length && toks[0].offsets ? toks[0].offsets.from / 1000 : from;
    return {from: +from.toFixed(2), firstToken: +first.toFixed(2), to: +((s.offsets ? s.offsets.to / 1000 : s.end)).toFixed(2), text: (s.text || '').trim()};
  });
  process.stdout.write(JSON.stringify(segs, null, 1) + '\n');
}
function cmdReview(pos, opt) {
  const [dir] = pos; if (!dir) die('usage: review <project-dir> [--out review/snap] [--extra t1,t2]');
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'PLAN.json'), 'utf8')); const fps = plan.fps || 24;
  const times = [0, ...plan.shots.map((s) => +((s.in + s.out) / 2 / fps).toFixed(2)), +(plan.duration - 1 / fps).toFixed(3)];
  if (opt.extra) times.push(...String(opt.extra).split(',').map(Number));
  // runtime gate first: a JS error would make every snapshot (and a render) meaningless
  const chk = spawnSync('npx', ['hyperframes', 'validate', '--json'], {cwd: dir, encoding: 'utf8', shell: process.platform === 'win32'});
  let v = null; try { v = JSON.parse(chk.stdout.slice(chk.stdout.indexOf('{'))); } catch (e) { v = null; }
  if (!v || !v.ok) die('runtime validation failed: ' + (v ? JSON.stringify(v.errors) : (chk.stderr || chk.stdout).slice(-800)));
  const out = opt.out || 'review/snap'; fs.rmSync(path.join(dir, out), {recursive: true, force: true});
  run('npx', ['hyperframes', 'snapshot', '--at', times.join(','), '--no-end', '-o', out], dir);
  const sheets = fs.readdirSync(path.join(dir, out)).filter((f) => /^contact-sheet.*\.jpg$/.test(f)).sort().map((f) => path.join(dir, out, f));
  process.stdout.write(JSON.stringify({contactSheets: sheets, frames: times.length, times, labels: ['frame0', ...plan.shots.map((s) => s.id), 'last']}) + '\n');
}

// ---------- doctor ----------
function cmdDoctor() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const ff = which('ffmpeg'), fp = which('ffprobe');
  const enc = ff ? spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {encoding: 'utf8'}).stdout : '';
  const res = {
    node: process.versions.node, nodeOkForMvkit: nodeMajor >= 20, nodeOkForHyperframes: nodeMajor >= 22,
    ffmpeg: ff, ffprobe: fp, vp9: /libvpx-vp9/.test(enc), npx: !!which('npx') || spawnSync('npx', ['--version'], {encoding: 'utf8', shell: process.platform === 'win32'}).status === 0,
    pins: PINS,
  };
  res.ok = res.nodeOkForMvkit && !!ff && !!fp && res.vp9;
  process.stdout.write(JSON.stringify(res, null, 1) + '\n'); if (!res.ok) process.exit(1);
}

const USAGE = `mvkit <command>
  doctor
  analyze <plate.mp4> <out.json>
  key <in> <out> [options]
  contact <video> <out.png> [--every 12 --width 320 --cols 6]
  beatgrid --bpm N --duration S [--fps 24 --offset 0 --out beats.json]
  grid <audio> --bpm N | --beats beats.json [--bars] [--out grid.json]
  snap --bpm N --offset S --times t1,t2 [--audio file --window 0.6]
  cycle <plate.mp4> --bpm N [--beats 2 --band 0.55,0.68 --out cycle.json]
  transcript <transcript.json>
  review <project-dir> [--out review/snap]
  plan-check <PLAN.json>
  lint <composition.html>
  scaffold <dir> [--width 1920 --height 1080 --fps 24 --duration 10]
  font <dir> "<Family>" [weights]
  bitrate <capMB> <seconds> [--audio kbps]`;

const {pos, opt} = parseArgs(process.argv.slice(3));
const cmd = process.argv[2];
const table = {doctor: cmdDoctor, analyze: cmdAnalyze, key: cmdKey, contact: cmdContact, beatgrid: cmdBeatgrid, grid: cmdGrid, snap: cmdSnap, cycle: cmdCycle, transcript: cmdTranscript, review: cmdReview, 'plan-check': cmdPlanCheck, lint: cmdLint, scaffold: cmdScaffold, font: cmdFont, bitrate: cmdBitrate};
if (!table[cmd]) { process.stdout.write(USAGE + '\n'); process.exit(cmd ? 2 : 0); }
Promise.resolve(table[cmd](pos, opt)).catch((e) => die(e.stack || String(e), 1));
