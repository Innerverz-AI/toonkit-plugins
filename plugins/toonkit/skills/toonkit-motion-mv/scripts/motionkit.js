/* motionkit: motion-token primitives for HyperFrames + GSAP compositions (toonkit-motion-mv).
 * Browser global `MK`. Requires gsap + CustomEase loaded first. Every primitive adds tweens to a
 * paused GSAP timeline at an absolute time (seconds) and never uses callbacks, wall-clock time or
 * unseeded randomness, so any frame can be rendered by seeking.
 */
(function (global) {
  'use strict';
  var MK = {};
  MK.fps = 24;
  // Motion tokens (spec section 3). Durations in seconds.
  MK.T = {
    enter: {ease: 'enter', dur: 0.5, min: 0.4, max: 0.6},
    move: {ease: 'move', dur: 0.65, min: 0.5, max: 0.8},
    exit: {ease: 'exit', dur: 0.3, min: 0.25, max: 0.35},
    slam: {ease: 'slam', dur: 0.45},
    stagger: 0.06,
    overlap: 0.3,
  };

  MK.init = function (opts) {
    opts = opts || {};
    MK.fps = opts.fps || 24;
    if (!global.gsap || !global.CustomEase) throw new Error('motionkit: load gsap and CustomEase before motionkit');
    gsap.registerPlugin(CustomEase);
    CustomEase.create('enter', '0,0,0,1');
    CustomEase.create('move', '0.65,0,0.35,1');
    CustomEase.create('exit', '0.55,0,0.9,0.45');
    // Single declared overshoot accent (spec: at most one per beat).
    CustomEase.create('slam', 'M0,0 C0.08,0.72 0.16,1.16 0.32,1.1 0.46,1.05 0.58,0.99 0.7,1 0.82,1.004 0.9,1 1,1');
    return MK;
  };

  // ---------- time helpers ----------
  MK.f = function (frame) { return frame / MK.fps; };
  MK.grid = function (bpm, offset) {
    var b = 60 / bpm; offset = offset || 0;
    return {beat: function (n) { return offset + n * b; }, bar: function (n, per) { return offset + n * b * (per || 4); }, len: b};
  };
  MK.rng = function (seed) { // mulberry32, deterministic
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  function els(target) { return typeof target === 'string' ? Array.prototype.slice.call(document.querySelectorAll(target)) : (target.length !== undefined ? Array.prototype.slice.call(target) : [target]); }
  function one(target) { return els(target)[0]; }

  // ---------- text splitting ----------
  // Wraps characters (or words) in overflow-hidden masks. Idempotent per element.
  MK.split = function (target, by) {
    by = by || 'char';
    var out = [];
    els(target).forEach(function (el) {
      if (el.__mkSplit && el.__mkSplit.by === by) { out = out.concat(el.__mkSplit.parts); return; }
      var text = el.textContent; el.textContent = '';
      var units = by === 'word' ? text.split(/(\s+)/) : Array.from(text);
      var parts = [];
      units.forEach(function (u) {
        if (u === '') return;
        if (/^\s+$/.test(u)) { el.appendChild(document.createTextNode(by === 'word' ? ' ' : ' ')); return; }
        var mask = document.createElement('span'); mask.className = 'mk-mask';
        mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom;padding:0.08em 0.02em;margin:-0.08em -0.02em;';
        var inner = document.createElement('span'); inner.className = 'mk-unit'; inner.style.display = 'inline-block'; inner.textContent = u;
        mask.appendChild(inner); el.appendChild(mask); parts.push(inner);
      });
      el.__mkSplit = {by: by, parts: parts}; out = out.concat(parts);
    });
    return out;
  };

  // ---------- kinetic typography primitives ----------
  MK.reveal = function (tl, target, at, o) { // per-letter/word mask reveal
    o = o || {}; var parts = MK.split(target, o.by);
    tl.set(els(target), {autoAlpha: 1}, at);
    tl.fromTo(parts, {yPercent: o.from === 'above' ? -115 : 115}, {yPercent: 0, duration: o.dur || MK.T.enter.dur, ease: 'enter', stagger: o.stagger === undefined ? MK.T.stagger : o.stagger}, at);
    return tl;
  };
  MK.conceal = function (tl, target, at, o) { // mask exit
    o = o || {}; var parts = MK.split(target, o.by);
    tl.to(parts, {yPercent: o.to === 'below' ? 115 : -115, duration: o.dur || MK.T.exit.dur, ease: 'exit', stagger: (o.stagger === undefined ? MK.T.stagger : o.stagger) * 0.5}, at);
    tl.set(els(target), {autoAlpha: 0}, at + (o.dur || MK.T.exit.dur) + (parts.length - 1) * (o.stagger === undefined ? MK.T.stagger : o.stagger) * 0.5);
    return tl;
  };
  MK.slam = function (tl, target, at, o) { // scale slam with the single declared overshoot
    o = o || {};
    tl.set(els(target), {autoAlpha: 1}, at);
    tl.fromTo(els(target), {scale: o.from || 2.4, rotation: o.rotFrom || 0}, {scale: 1, rotation: o.rot || 0, duration: o.dur || MK.T.slam.dur, ease: 'slam'}, at);
    return tl;
  };
  MK.tracking = function (tl, target, at, o) { // tracking collapse on enter
    o = o || {};
    tl.fromTo(els(target), {letterSpacing: o.from || '0.8em', autoAlpha: 0}, {letterSpacing: o.to || '0.02em', autoAlpha: 1, duration: o.dur || MK.T.enter.dur + 0.1, ease: 'enter'}, at);
    return tl;
  };
  MK.splitWipe = function (tl, target, bar, at, o) { // text cut by a moving bar: bar sweeps, text revealed behind it
    o = o || {}; var d = o.dur || MK.T.move.dur;
    tl.fromTo(els(bar), {xPercent: -110}, {xPercent: 110, duration: d, ease: 'move'}, at);
    tl.fromTo(els(target), {clipPath: 'inset(0% 100% 0% 0%)'}, {clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: 'move'}, at);
    return tl;
  };
  MK.drawOn = function (tl, target, at, o) { // SVG stroke draw-on, optional fill after
    o = o || {};
    els(target).forEach(function (p) {
      var len = p.getTotalLength ? p.getTotalLength() : 1000;
      tl.fromTo(p, {strokeDasharray: len, strokeDashoffset: len}, {strokeDashoffset: 0, duration: o.dur || MK.T.enter.dur + 0.2, ease: 'enter'}, at);
      if (o.fill) tl.fromTo(p, {fillOpacity: 0}, {fillOpacity: 1, duration: MK.T.enter.dur, ease: 'enter'}, at + (o.dur || 0.7) * 0.6);
    });
    return tl;
  };
  MK.counter = function (tl, target, at, from, to, o) { // number ticker driven by timeline state
    o = o || {}; var el = one(target); var state = {v: from}; var fmt = o.format || function (v) { return String(Math.round(v)); };
    el.textContent = fmt(from);
    tl.to(state, {v: to, duration: o.dur || MK.T.move.dur + 0.3, ease: 'move', onUpdate: function () { el.textContent = fmt(state.v); }}, at);
    return tl;
  };
  MK.replace = function (tl, container, words, times) { // word replacement in place on beats (state via .set)
    var box = one(container); box.textContent = '';
    var spans = words.map(function (w) { var s = document.createElement('span'); s.textContent = w; s.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden;'; box.appendChild(s); return s; });
    box.style.position = box.style.position || 'relative';
    spans.forEach(function (s, i) {
      tl.set(s, {autoAlpha: 1}, times[i]);
      tl.fromTo(s, {yPercent: 40}, {yPercent: 0, duration: 0.22, ease: 'enter'}, times[i]);
      if (i + 1 < spans.length) tl.set(s, {autoAlpha: 0}, times[i + 1]);
    });
    return tl;
  };
  MK.pathText = function (tl, textPathEl, at, o) { // text riding an SVG path: animate startOffset
    o = o || {};
    tl.fromTo(one(textPathEl), {attr: {startOffset: o.from || '100%'}}, {attr: {startOffset: o.to || '0%'}, duration: o.dur || MK.T.move.dur * 2, ease: 'move'}, at);
    return tl;
  };
  MK.cropType = function (tl, target, at, o) { // oversized type travelling through frame
    o = o || {};
    tl.fromTo(els(target), {xPercent: o.from === undefined ? 60 : o.from}, {xPercent: o.to === undefined ? -60 : o.to, duration: o.dur || 1.6, ease: 'move'}, at);
    return tl;
  };

  // ---------- shape primitives ----------
  MK.pop = function (tl, target, at, o) { o = o || {}; tl.fromTo(els(target), {scale: 0, rotation: o.rotFrom || 0, autoAlpha: 1}, {scale: 1, rotation: o.rot || 0, duration: o.dur || MK.T.enter.dur, ease: 'enter', stagger: o.stagger || 0}, at); return tl; };
  MK.shrink = function (tl, target, at, o) { o = o || {}; tl.to(els(target), {scale: 0, duration: o.dur || MK.T.exit.dur, ease: 'exit', stagger: o.stagger || 0}, at); return tl; };
  var WIPE = {left: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 100%)'], right: ['inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)'], up: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'], down: ['inset(0% 0% 100% 0%)', 'inset(100% 0% 0% 0%)']};
  MK.wipeIn = function (tl, target, at, o) { o = o || {}; var w = WIPE[o.dir || 'left']; tl.set(els(target), {autoAlpha: 1}, at); tl.fromTo(els(target), {clipPath: w[0]}, {clipPath: 'inset(0% 0% 0% 0%)', duration: o.dur || MK.T.enter.dur, ease: o.ease || 'enter'}, at); return tl; };
  MK.wipeOut = function (tl, target, at, o) { o = o || {}; var w = WIPE[o.dir || 'left']; tl.fromTo(els(target), {clipPath: 'inset(0% 0% 0% 0%)'}, {clipPath: w[1], duration: o.dur || MK.T.exit.dur, ease: 'exit'}, at); return tl; };
  MK.irisIn = function (tl, target, at, o) { o = o || {}; var c = (o.x || '50%') + ' ' + (o.y || '50%'); tl.set(els(target), {autoAlpha: 1}, at); tl.fromTo(els(target), {clipPath: 'circle(0% at ' + c + ')'}, {clipPath: 'circle(' + (o.r || '75%') + ' at ' + c + ')', duration: o.dur || MK.T.enter.dur + 0.1, ease: 'enter'}, at); return tl; };
  MK.irisOut = function (tl, target, at, o) { o = o || {}; var c = (o.x || '50%') + ' ' + (o.y || '50%'); tl.to(els(target), {clipPath: 'circle(0% at ' + c + ')', duration: o.dur || MK.T.exit.dur, ease: 'exit'}, at); return tl; };
  MK.shapeMask = function (tl, target, at, o) { // reveal through an arbitrary polygon that scales from a point
    o = o || {}; var poly = o.polygon || MK.starPolygon(5, 0.42);
    var from = poly.map(function (p) { return '50% 50%'; }).join(','), to = poly.map(function (p) { return (50 + p[0] * 75).toFixed(2) + '% ' + (50 + p[1] * 75).toFixed(2) + '%'; }).join(',');
    tl.set(els(target), {autoAlpha: 1}, at);
    tl.fromTo(els(target), {clipPath: 'polygon(' + from + ')'}, {clipPath: 'polygon(' + to + ')', duration: o.dur || MK.T.enter.dur + 0.15, ease: 'enter'}, at);
    return tl;
  };
  MK.starPolygon = function (points, inner) { var out = []; for (var i = 0; i < points * 2; i++) { var r = i % 2 ? inner : 1; var a = Math.PI / points * i - Math.PI / 2; out.push([r * Math.cos(a), r * Math.sin(a)]); } return out; };

  // ---------- flashes, speed lines, smear covers ----------
  // Visible state changes use set + to (never fromTo): a fromTo renders its start state before it begins.
  MK.flash = function (tl, overlay, at, o) {
    o = o || {}; var el = one(overlay);
    if (!el.__mkBase) { tl.set(el, {autoAlpha: 0}, 0); el.__mkBase = true; }
    tl.set(el, {autoAlpha: o.peak || 0.7}, at);
    tl.to(el, {autoAlpha: 0, duration: o.dur || 0.25, ease: 'enter'}, at);
    return tl;
  };
  MK.speedLines = function (container, o) { // builds deterministic radial or parallel speed lines; returns the element
    o = o || {}; var box = one(container); var W = o.width || 1920, H = o.height || 1080; var n = o.count || 36; var r = MK.rng(o.seed || 7);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.cssText = 'position:absolute;inset:0;visibility:hidden;';
    for (var i = 0; i < n; i++) {
      var l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      if (o.mode === 'parallel') { var y = r() * H; l.setAttribute('x1', -200); l.setAttribute('x2', W + 200); l.setAttribute('y1', y); l.setAttribute('y2', y + (o.slant || 0)); }
      else { var a = r() * Math.PI * 2, r0 = (o.inner || 0.28) * Math.max(W, H), r1 = Math.max(W, H); l.setAttribute('x1', W / 2 + Math.cos(a) * r0); l.setAttribute('y1', H / 2 + Math.sin(a) * r0); l.setAttribute('x2', W / 2 + Math.cos(a) * r1); l.setAttribute('y2', H / 2 + Math.sin(a) * r1); }
      l.setAttribute('stroke', o.color || '#ffffff'); l.setAttribute('stroke-width', (o.minWidth || 2) + r() * (o.maxWidth || 7)); l.setAttribute('stroke-linecap', 'round'); l.setAttribute('opacity', 0.5 + r() * 0.5);
      svg.appendChild(l);
    }
    box.appendChild(svg); return svg;
  };
  // Cover measured smear windows (frames from mvkit analyze summary.smearCover) with lines and/or a flash.
  MK.cover = function (tl, windows, o) {
    o = o || {};
    windows.forEach(function (w) {
      var t0 = MK.f(w.start), t1 = MK.f(w.end + 1);
      if (o.lines) { if (!one(o.lines).__mkBase) { tl.set(one(o.lines), {autoAlpha: 0}, 0); one(o.lines).__mkBase = true; } tl.set(one(o.lines), {autoAlpha: 1}, t0); tl.fromTo(one(o.lines), {scale: 1.08}, {scale: 1, duration: Math.max(t1 - t0, 1 / MK.fps), ease: 'move'}, t0); tl.set(one(o.lines), {autoAlpha: 0}, t1); }
      if (o.flash) MK.flash(tl, o.flash, t0, {peak: o.peak || 0.55, dur: Math.max(0.12, t1 - t0 + 0.08)});
    });
    return tl;
  };

  // ---------- pose cuts ----------
  // poses: [{el: selector|element (img.pose), at: seconds}], cut to each pose exactly at `at` (no crossfade).
  MK.poseCut = function (tl, poses, o) {
    o = o || {}; var end = o.end;
    poses.forEach(function (p, i) {
      var el = one(p.el); var next = poses[i + 1]; var until = next ? next.at : end;
      tl.set(el, {autoAlpha: 1}, p.at);
      if (o.pop !== false) tl.fromTo(el, {scale: o.popFrom || 1.045}, {scale: 1, duration: o.popDur || 0.22, ease: 'enter'}, p.at);
      if (o.drift !== false && until !== undefined) {
        var r = MK.rng((o.seed || 11) + i * 101); var dx = (r() - 0.5) * (o.driftPx || 18), dy = (r() - 0.5) * (o.driftPx || 18) * 0.5;
        tl.fromTo(el, {x: 0, y: 0}, {x: dx, y: dy, duration: Math.max(0.05, until - p.at), ease: 'move'}, p.at);
      }
      if (until !== undefined) tl.set(el, {autoAlpha: 0}, until);
      if (o.flash && i > 0) MK.flash(tl, o.flash, p.at, {peak: o.flashPeak || 0.35, dur: 0.16});
    });
    return tl;
  };

  // ---------- virtual camera (per-depth parallax) ----------
  // layers: [{el, depth}] ; keys: [{at, dur, scale, x, y}] absolute camera states.
  MK.camera = function (tl, layers, keys) {
    keys.forEach(function (k) {
      layers.forEach(function (L) {
        tl.to(one(L.el), {scale: 1 + ((k.scale || 1) - 1) * L.depth, x: (k.x || 0) * L.depth, y: (k.y || 0) * L.depth, duration: k.dur || MK.T.move.dur, ease: 'move'}, k.at);
      });
    });
    return tl;
  };
  MK.punch = function (tl, layers, at, o) {
    o = o || {}; var amt = o.amount || 0.05;
    layers.forEach(function (L) {
      tl.to(one(L.el), {scale: '+=' + (amt * L.depth), duration: 0.12, ease: 'enter'}, at);
      tl.to(one(L.el), {scale: '-=' + (amt * L.depth), duration: o.back || 0.45, ease: 'move'}, at + 0.12);
    });
    return tl;
  };
  MK.shake = function (tl, layers, at, o) { // decaying deterministic shake, one key per frame
    o = o || {}; var frames = o.frames || 8, amp = o.amp || 8; var r = MK.rng(o.seed || 3);
    var kf = []; for (var i = 0; i < frames; i++) { var d = amp * (1 - i / frames); kf.push({x: (r() - 0.5) * 2 * d, y: (r() - 0.5) * 2 * d, duration: 1 / MK.fps, ease: 'none'}); }
    kf.push({x: 0, y: 0, duration: 1 / MK.fps, ease: 'none'});
    layers.forEach(function (L) { tl.to(one(L.el), {keyframes: kf.map(function (k) { return {x: k.x * L.depth, y: k.y * L.depth, duration: k.duration, ease: 'none'}; })}, at); });
    return tl;
  };

  // ---------- style bridge ----------
  // Line boil for SVG outlines (hand-drawn mode): re-seeds a displacement filter every `every` frames.
  MK.boil = function (tl, svgEl, start, end, o) {
    o = o || {}; var svg = one(svgEl); var id = 'mkboil' + Math.floor(MK.rng(o.seed || 5)() * 1e6);
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = '<filter id="' + id + '"><feTurbulence type="fractalNoise" baseFrequency="' + (o.freq || 0.03) + '" numOctaves="2" seed="1" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="' + ((o.amp || 1.5) * 2) + '"/></filter>';
    svg.insertBefore(defs, svg.firstChild); svg.style.filter = 'url(#' + id + ')';
    var turb = defs.querySelector('feTurbulence'); var every = o.every || 2; var step = every / MK.fps; var n = 0;
    for (var t = start; t < end; t += step) tl.set(turb, {attr: {seed: 1 + (n++ % 9)}}, t);
    return tl;
  };
  // Ambient loop: the ONLY allowed loop form. Finite, background-only, low contrast.
  MK.ambient = function (tl, target, vars, start, end, cycle) {
    cycle = cycle || 4; var reps = Math.max(0, Math.floor((end - start) / cycle) - 1);
    var v = Object.assign({}, vars, {duration: cycle / 2, ease: 'sine.inOut', yoyo: true, repeat: reps * 2 + 1}); // ambient
    tl.to(els(target), v, start);
    return tl;
  };

  global.MK = MK;
})(typeof window !== 'undefined' ? window : this);
