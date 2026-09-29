// Offline tests for the toonkit-motion-mv toolkit (no MCP, no credits). Requires ffmpeg with libvpx-vp9.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLUGIN = process.env.TOONKIT_TEST_PLUGIN || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../plugins/toonkit');
const SKILL = path.join(PLUGIN, 'skills/toonkit-motion-mv');
const MV = path.join(SKILL, 'scripts/mvkit.mjs');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mvkit-test-'));

function mv(args, expectFail = false) {
  const r = spawnSync(process.execPath, [MV, ...args], {encoding: 'utf8'});
  if (!expectFail) assert.equal(r.status, 0, `mvkit ${args[0]} failed: ${r.stderr}${r.stdout}`);
  else assert.notEqual(r.status, 0, `mvkit ${args[0]} unexpectedly passed`);
  return r;
}
function ffmpeg(args) { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); }
function decodeRGBA(file, w, h, vp9) {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...(vp9 ? ['-c:v', 'libvpx-vp9'] : []), '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {maxBuffer: 1 << 30});
  assert.equal(r.status, 0, String(r.stderr));
  const size = w * h * 4; const n = r.stdout.length / size; const out = [];
  for (let i = 0; i < n; i++) out.push(r.stdout.subarray(i * size, (i + 1) * size));
  return out;
}
function bboxX(frame, w, h) { let min = w; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (frame[(y * w + x) * 4 + 3] > 200 && x < min) min = x; return min; }

const W = 320, H = 180;
// Off-hex green (not #00FF00) to prove border sampling; box static 0-1s, moving and blurred 1-2s, static 2-3s.
const PLATE = path.join(WORK, 'plate.mp4');
const X = "if(lt(t\\,1)\\,40\\,if(lt(t\\,2)\\,40+(t-1)*150\\,190))";
// drawbox evaluates positions once; overlay with eval=frame moves a prebuilt sprite per frame.
ffmpeg(['-f', 'lavfi', '-i', `color=c=0x46EE3C:s=${W}x${H}:r=24:d=3`, '-f', 'lavfi', '-i', 'color=c=0xFF80C0:s=80x80:r=24:d=3', '-filter_complex',
  `[1]drawbox=x=20:y=20:w=40:h=40:color=0x301018@1:t=fill,drawbox=x=30:y=30:w=20:h=20:color=0xFFFFFF@1:t=fill[s];[0][s]overlay=x='${X}':y=50:eval=frame,boxblur=6:1:enable='between(t,1.05,1.95)'`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '4', '-t', '3', PLATE]);

test('doctor reports a usable toolchain', () => {
  const r = JSON.parse(mv(['doctor']).stdout);
  assert.equal(r.ok, true); assert.equal(r.vp9, true);
});

test('analyze finds spans, smear window and flat chroma', () => {
  const out = path.join(WORK, 'a.json');
  const s = JSON.parse(mv(['analyze', PLATE, out]).stdout);
  assert.equal(s.keyMode, 'green'); assert.equal(s.bgFlat, true);
  assert.equal(s.frames, 72);
  const kinds = s.spans.map((x) => x.kind);
  assert.deepEqual(kinds, ['static', 'action', 'static']);
  const act = s.spans[1]; assert.ok(act.start >= 22 && act.start <= 26 && act.end >= 45 && act.end <= 49, JSON.stringify(act));
  assert.ok(s.smearCover.length >= 1);
  for (const c of s.smearCover) assert.ok(c.start >= 22 && c.end <= 49, 'smear outside the blurred action: ' + JSON.stringify(c));
  assert.ok(s.smearFrames >= 15, 'blurred frames not detected: ' + s.smearFrames);
});

test('key produces alpha video with despill', () => {
  const out = path.join(WORK, 'k.webm');
  mv(['key', PLATE, out]);
  const f = decodeRGBA(out, W, H, true);
  assert.equal(f.length, 72);
  const px = (fr, x, y) => fr.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
  assert.ok(px(f[0], 5, 5)[3] < 10, 'background not transparent');
  assert.ok(px(f[0], 45, 55)[3] > 240, 'subject not opaque');
  const p = px(f[0], 45, 55); assert.ok(p[1] <= Math.max(p[0], p[2]) + 6, 'green spill not removed');
});

test('retime maps anchors by nearest source frame', () => {
  // Numbered plate: box x = 4 * frame index, so every source frame is identifiable.
  const num = path.join(WORK, 'num.mp4');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=0x00FF00:s=${W}x${H}:r=24:d=1.25`, '-f', 'lavfi', '-i', 'color=c=0xFF4080:s=30x30:r=24:d=1.25', '-filter_complex', "[0][1]overlay=x='96*t':y=60:eval=frame", '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '4', '-t', '1.25', num]);
  const out = path.join(WORK, 'rt.webm');
  mv(['key', num, out, '--retime', '10:20', '--frames', '40']);
  const f = decodeRGBA(out, W, H, true);
  assert.equal(f.length, 40);
  const src = (i) => Math.round(bboxX(f[i], W, H) / 4);
  assert.equal(src(0), 0); assert.equal(src(20), 10); assert.equal(src(10), 5);
  assert.equal(src(39), 29); // tail keeps 1:1 speed after the last anchor
  for (let i = 1; i < 40; i++) assert.ok(src(i) >= src(i - 1), 'retime reversed at ' + i);
  mv(['key', num, path.join(WORK, 'bad.webm'), '--retime', '20:5,10:10', '--frames', '20'], true);
});

test('image key adds an outline stroke and a bbox sidecar', () => {
  const img = path.join(WORK, 'pose.png');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=0x10F020:s=${W}x${H}`, '-vf', 'drawbox=x=120:y=40:w=80:h=100:color=0xFF80C0@1:t=fill', '-frames:v', '1', img]);
  const out = path.join(WORK, 'pose_k.png');
  mv(['key', img, out, '--stroke', '5', '--stroke-color', '#ffffff']);
  const f = decodeRGBA(out, W, H, false)[0];
  const at = (x, y) => f.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
  assert.ok(at(116, 90)[3] > 200 && at(116, 90)[0] > 240 && at(116, 90)[1] > 240, 'no white stroke outside the subject');
  assert.ok(at(60, 90)[3] < 10, 'background not transparent');
  const side = JSON.parse(fs.readFileSync(out.replace(/\.png$/, '.json'), 'utf8'));
  assert.ok(side.bbox && side.bbox[0] <= 116);
});

test('non-chroma background is refused', () => {
  const img = path.join(WORK, 'white.png');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}`, '-frames:v', '1', img]);
  const r = mv(['key', img, path.join(WORK, 'w.png')], true);
  assert.match(r.stderr, /not a chroma color/);
});

test('plan-check enforces grammar', () => {
  const good = {fps: 24, bpm: 120, duration: 6, shots: [
    {id: 'S1', type: 'T', in: 0, out: 48, focal: 'title', text: [{at: 0, content: 'HI', primitive: 'reveal'}]},
    {id: 'S2', type: 'P', in: 48, out: 96, focal: 'poses', poses: ['a', 'b'], text: [{at: 48, content: 'GO', primitive: 'slam'}]},
    {id: 'S3', type: 'M', in: 96, out: 144, focal: 'mask', text: [{at: 96, content: 'END', primitive: 'tracking'}, {at: 120, content: 'X', primitive: 'drawOn'}]}]};
  const gp = path.join(WORK, 'good.json'); fs.writeFileSync(gp, JSON.stringify(good));
  assert.equal(JSON.parse(mv(['plan-check', gp]).stdout).ok, true);
  const bad = structuredClone(good);
  bad.shots[1] = {id: 'S2', type: 'C', in: 48, out: 96, focal: 'plate', character: {fastAction: true}};
  bad.shots[2].text = [];
  const bp = path.join(WORK, 'bad.json'); fs.writeFileSync(bp, JSON.stringify(bad));
  const r = JSON.parse(mv(['plan-check', bp], true).stdout);
  assert.ok(r.errors.some((e) => /pose-cut/.test(e)));
  assert.ok(r.errors.some((e) => /> 4s/.test(e)));
});

test('lint enforces motion tokens and determinism', () => {
  const ok = '<script>MK.init({fps:24});const tl=gsap.timeline({paused:true});tl.to("#a",{x:1,duration:0.5,ease:"enter"},0);window.__timelines={main:tl};</script>';
  const okp = path.join(WORK, 'ok.html'); fs.writeFileSync(okp, ok);
  assert.equal(JSON.parse(mv(['lint', okp]).stdout).ok, true);
  const bad = '<script>const tl=gsap.timeline({paused:true});tl.to("#a",{x:Math.random(),duration:1,ease:"power2.out",repeat:-1},0);window.__timelines={main:tl};</script>';
  const bp = path.join(WORK, 'bad.html'); fs.writeFileSync(bp, bad);
  const r = JSON.parse(mv(['lint', bp], true).stdout);
  assert.ok(r.errors.length >= 4, JSON.stringify(r.errors));
});

test('beatgrid and bitrate arithmetic', () => {
  const g = JSON.parse(mv(['beatgrid', '--bpm', '120', '--duration', '2', '--fps', '24']).stdout);
  assert.deepEqual(g.beats.map((b) => b.frame), [0, 12, 24, 36, 48]);
  const b = JSON.parse(mv(['bitrate', '10', '20']).stdout);
  assert.equal(b.videoKbps, 4096);
});

test('motionkit parses and exposes the documented API', () => {
  const src = fs.readFileSync(path.join(SKILL, 'scripts/motionkit.js'), 'utf8');
  const sandbox = {};
  new Function('window', src)(sandbox);
  for (const k of ['init', 'reveal', 'conceal', 'slam', 'tracking', 'splitWipe', 'drawOn', 'counter', 'replace', 'pathText', 'cropType', 'pop', 'shrink', 'wipeIn', 'wipeOut', 'irisIn', 'irisOut', 'shapeMask', 'flash', 'speedLines', 'cover', 'poseCut', 'camera', 'punch', 'shake', 'boil', 'ambient', 'rng', 'grid', 'f'])
    assert.equal(typeof sandbox.MK[k], 'function', 'missing MK.' + k);
  const r1 = sandbox.MK.rng(42), r2 = sandbox.MK.rng(42);
  assert.equal(r1(), r2());
});

test('grid finds the beat phase of a click track and snap lands on beats', () => {
  const wav = path.join(WORK, 'click.wav');
  ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t+0.25\\,0.5)\\,0.02)\\,sin(2*PI*1000*t)\\,0)':s=22050:d=8", wav]);
  const g = JSON.parse(mv(['grid', wav, '--bpm', '120']).stdout);
  assert.ok(Math.abs(g.offset - 0.25) < 0.015, 'offset ' + g.offset);
  const s = JSON.parse(mv(['snap', '--bpm', '120', '--offset', String(g.offset), '--times', '1.2,3.3', '--audio', wav, '--window', '0.2']).stdout);
  assert.deepEqual(s.map((x) => x.beat), [2, 6]);
  assert.ok(Math.abs(s[0].t - 1.25) < 0.02);
});

test('cycle measures a sway and emits a speed-limited retime map', () => {
  const sway = path.join(WORK, 'sway.mp4');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=0x00FF00:s=${W}x${H}:r=24:d=4`, '-f', 'lavfi', '-i', 'color=c=0xFF4080:s=40x80:r=24:d=4', '-filter_complex',
    "[0][1]overlay=x='140+40*sin(2*PI*t)':y=60:eval=frame", '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '4', '-t', '4', sway]);
  const c = JSON.parse(mv(['cycle', sway, '--bpm', '120', '--beats', '1', '--band', '0.35,0.75']).stdout);
  assert.ok(Math.abs(c.periodFrames - 12) <= 1, 'period ' + c.periodFrames);
  assert.equal(c.withinSpeedLimits, true);
  assert.equal(c.phase.period, 12);
  assert.ok(/^\d+:\d+(,\d+:\d+)+$/.test(c.retime));
});

test('transcript condenses whisper output', () => {
  const tj = path.join(WORK, 'tr.json');
  fs.writeFileSync(tj, JSON.stringify({transcription: [{offsets: {from: 31000, to: 33000}, text: ' Armarna upp', tokens: [{text: '[_BEG_]', offsets: {from: 31000}}, {text: ' Arm', offsets: {from: 31120}}]}]}));
  const r = JSON.parse(mv(['transcript', tj]).stdout);
  assert.deepEqual(r[0], {from: 31, firstToken: 31.12, to: 33, text: 'Armarna upp'});
});

test('shotkit builds a gated composition from shots.json', () => {
  const proj = fs.mkdtempSync(path.join(WORK, 'proj-'));
  for (const d of ['poses', 'analysis', 'plates']) fs.mkdirSync(path.join(proj, d));
  for (const p of ['p01', 'p02']) ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xFF80C0:s=64x36', '-frames:v', '1', path.join(proj, 'poses', p + '.png')]);
  fs.writeFileSync(path.join(proj, 'analysis/dance.json'), JSON.stringify({summary: {frames: 240, fps: 24, smearCover: [{start: 30, end: 33}]}}));
  const shots = {fps: 24, duration: 8, bpm: 120, offset: 0, palette: {a: {bg1: '#FFB36B', bg2: '#FF7A45', acc: '#FFE9A8', soft: '#FFF3DA'}}, plates: {dance: {src: 'plates/dance.webm', analysis: 'analysis/dance.json'}},
    shots: [
      {id: 'logo', type: 'M', kind: 'logo', a: 0, b: 4, bg: 'rays', pal: 'a', cam: 'drift', focal: 'logo', innerChangesEveryBeats: 1, chars: [{pose: 'p02', x: 0, y: 200, s: 0.7, at: 0}], text: [{at: 0, content: 'Hi', primitive: 'slam'}]},
      {id: 'alt', type: 'P', kind: 'alternate', a: 4, b: 8, bg: 'stripes', pal: 'a', cam: 'snap', focal: 'hips', poses: ['p01', 'p01f'], text: [{at: 4, content: 'Go', primitive: 'reveal'}]},
      {id: 'dance', type: 'C', kind: 'plate', a: 8, b: 12, bg: 'checker', pal: 'a', cam: 'snap', focal: 'dance', plate: {id: 'dance', m: 0.5}, text: [{at: 8, content: 'DANCE', primitive: 'tracking'}]},
      {id: 'end', type: 'T', kind: 'finale', a: 12, b: null, bg: 'rays', pal: 'a', cam: 'punch', focal: 'end', poses: ['p02'], text: [{at: 12, content: 'Bye', primitive: 'slam'}, {at: 14, content: 'ToonKit', primitive: 'slam'}]}]};
  fs.writeFileSync(path.join(proj, 'shots.json'), JSON.stringify(shots));
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts/shotkit.mjs'), proj], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout); assert.equal(out.shots, 4); assert.equal(out.covers, 1);
  const html = fs.readFileSync(path.join(proj, 'index.html'), 'utf8');
  assert.match(html, /<video id="v0_dance"/);
  assert.match(html, /class="lc" data-i="0" style="visibility:visible;transform:translate\(0px,200px\) scale\(0.7\)"/);
  assert.match(html, /class="pw flip "/);
  assert.equal(JSON.parse(mv(['plan-check', path.join(proj, 'PLAN.json')]).stdout).ok, true);
  assert.equal(JSON.parse(mv(['lint', path.join(proj, 'index.html')]).stdout).ok, true);
});
