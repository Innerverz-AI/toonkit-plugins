# Composition authoring contract

A project is created by `mvkit scaffold`, which:
- pins the HyperFrames CLI and GSAP versions
- vendors GSAP, CustomEase and `motionkit.js` into `vendor/`
- writes `index.html`, `PLAN.json` and the working folders (`plates/`, `poses/`, `analysis/`, `renders/`, `review/`)
- removes the HyperFrames-generated agent files so that this skill governs the project

**Default authoring path: write `shots.json` and build with `node {skill}/scripts/shotkit.mjs <project>`.** That one build writes `index.html` (HTML, CSS and the inlined shot runtime) and `PLAN.json` from the same data, so the plan checks and the render cannot drift apart. Hand-written compositions follow the same contract (§1–§3).

## 1. Runtime contract (HyperFrames)

- **Root**: `<div id="root" data-composition-id="main" data-start="0" data-duration="{s}" data-width="1920" data-height="1080" data-fps="24">`.
- **Timed elements** carry `class="clip"`, `data-start` and `data-duration` in seconds. Paint order is DOM order or `z-index`.
- **Root timeline**: one paused GSAP timeline registered as `window.__timelines["main"]`, seeked once per frame. Nested timelines added to the root must not be paused.
- **Media**:
  - **Every `<video>` needs a unique `id`.** Without one the plate renders frozen (`media_missing_id`).
  - VP9-alpha WebM plates keep transparency, and plate frame n lands on comp frame n. Trim with `data-media-start`.
  - Never mount the same plate twice with the same start and duration (duplicate discovery). Mirror layouts use one half-width wrapper with `-webkit-box-reflect: right 0`.
  - Pose images are `<img>` elements present at load. A CSS `scaleX(-1)` flip of a symmetric design is a free second key pose.
  - Audio is a separate `<audio data-timeline-role="music">`.
- **Determinism**: no `Math.random`, `Date.now`, `performance.now`, network fetches, or CSS transitions/animations. Use `MK.rng(seed)`.
- **Callbacks**: `onUpdate` runs while seeking; timeline `.call()` may be skipped, so drive state with `.set()`.
- **Frame 0**: anything visible on frame 0 (the autoplay thumbnail) gets that state from CSS/inline style. The renderer can seek back to 0 and revert time-0 timeline sets.
- **Visible-state changes** use `set` + `to`. A `fromTo` renders its start state early, so use it only on elements invisible until then.
- **Camera overscan**: backgrounds inside a rotating or scaling camera extend beyond the frame (shotkit uses 240 px) so tilts never expose corners.
- **Fonts**: vendor with `mvkit font` and link `assets/fonts/{family}.css`. Latin subsets include å ä ö; check other scripts.
- **Runtime errors are invisible to static lints.** `mvkit review` runs HyperFrames runtime validation first and stops on any JS error.
- **Performance**: clip-path, mask and blend animation fall back to screenshot capture. This is expected. A one-minute 1080p composite renders in a few minutes on a recent laptop.

## 2. Motion kit (`MK`, vendored `motionkit.js`)

`MK.init({fps})` registers `enter`, `move`, `exit`, `slam`. Times are absolute seconds; `MK.f(frame)`; `MK.grid(bpm, offset).beat(n)`.

| Group | Calls |
|---|---|
| Kinetic type | `reveal`, `conceal`, `slam`, `tracking`, `splitWipe`, `drawOn`, `counter`, `replace`, `pathText`, `cropType` |
| Shapes / reveals | `pop`, `shrink`, `wipeIn`/`wipeOut`, `irisIn`/`irisOut`, `shapeMask`, `starPolygon` |
| Hits & covers | `flash`, `speedLines`, `cover(tl, smearCover[], {lines, flash})` |
| Character | `poseCut(tl, [{el, at}], {end, pop, drift, flash})` |
| Camera | `camera`, `punch`, `shake` |
| Style bridge | `boil`, `ambient` (the only allowed loop) |

Raw `tl.to` is allowed only with `ease: "enter" | "move" | "exit" | "slam"`. `mvkit lint` enforces this.

## 3. Layer stack (back → front)

1. backdrop (patterns, rays, rings)
2. far MG (crop type)
3. characters (depth 1)
4. near MG and sparkles
5. typography
6. hits (speed lines, flash)
7. post (vignette)

shotkit builds this stack per shot: `.shot > .cam > (.bg, .chars, .fx)` plus `.type` outside the camera.

## 4. Measured data

- `analysis/{plate}.json` comes from `mvkit analyze`. For a retimed plate, analyze with the same `--retime` map so frame numbers match the keyed WebM.
- `analysis/{plate}_cycle.json` comes from `mvkit cycle … --out`. It holds `phase {firstFrame, period}`, which shotkit uses to snap each use's media start onto a motion extremum so cycles land on the shot's beats.
- shotkit converts each plate's `smearCover` into comp-time covers automatically.

## 5. Commands

```sh
node {skill}/scripts/mvkit.mjs doctor
node {skill}/scripts/mvkit.mjs scaffold {project} --duration {seconds}
node {skill}/scripts/mvkit.mjs font {project} "Fredoka" 500,700
(cd {project} && npx hyperframes beats --json)                      # BPM (add <audio data-timeline-role="music"> first)
node {skill}/scripts/mvkit.mjs grid {project}/audio/track.wav --bpm {BPM} --bars
node {skill}/scripts/mvkit.mjs transcript {tmp}/transcript.json     # from: npx hyperframes init {tmp} -a track.wav --language {lang}
node {skill}/scripts/mvkit.mjs snap --bpm {BPM} --offset {offset} --times {t1},{t2} --audio {project}/audio/track.wav
node {skill}/scripts/mvkit.mjs analyze plate.mp4 {project}/analysis/loop_src.json
node {skill}/scripts/mvkit.mjs cycle plate.mp4 --bpm {BPM} --beats 2 --out {project}/analysis/loop_cycle.json
node {skill}/scripts/mvkit.mjs analyze plate.mp4 {project}/analysis/loop.json --retime "{map}" --frames {N}
node {skill}/scripts/mvkit.mjs key plate.mp4 {project}/plates/loop.webm --stroke 6 --stroke-adaptive {project}/analysis/loop.json --rim-left "#FF6FB5" --rim-right "#FFE066" --retime "{map}" --frames {N}
for p in p01 p02; do node {skill}/scripts/mvkit.mjs key raw_$p.png {project}/poses/$p.png --stroke 9 --fit 1920x1080; done
node {skill}/scripts/shotkit.mjs {project}
node {skill}/scripts/mvkit.mjs plan-check {project}/PLAN.json && node {skill}/scripts/mvkit.mjs lint {project}/index.html && (cd {project} && npx hyperframes lint)
node {skill}/scripts/mvkit.mjs review {project}                     # runtime validation + frame0/midpoint/last snapshots
(cd {project} && npx hyperframes render -f 24 -q delivery -o renders/final.mp4)
node {skill}/scripts/mvkit.mjs bitrate {capMB} {seconds} --audio 160           # then a two-pass ffmpeg re-encode of the final file
```

`npx hyperframes` runs inside the project, so the pinned version is used. HyperFrames needs Node 22+; mvkit and shotkit need Node 20+ and ffmpeg with libvpx-vp9.

## 6. `shots.json`

```json
{
 "fps": 24, "width": 1920, "height": 1080, "duration": 30, "bpm": 128, "offset": 0.12, "lang": "en",
 "audio": "audio/track.wav",
 "fonts": {"display": "'Fredoka', sans-serif", "crop": "'Dela Gothic One', sans-serif", "css": ["assets/fonts/fredoka.css", "assets/fonts/dela-gothic-one.css"]},
 "palette": {"warm": {"bg1": "#FFB36B", "bg2": "#FF7A45", "acc": "#FFE9A8", "soft": "#FFF3DA"}, "cool": {"bg1": "#7FD7FF", "bg2": "#3FA8F5", "acc": "#FFFFFF", "soft": "#E3F6FF"}},
 "ink": {"main": "#FF7A45", "accent": "#3FA8F5", "outline": "#2B1B33"},
 "logo": {"title": "ToonKit", "subtitle": "ANIMATION"},
 "sectionFlashes": [16, 48],
 "plates": {"loop": {"src": "plates/loop.webm", "analysis": "analysis/loop.json", "cycle": "analysis/loop_cycle.json"}},
 "shots": [
  {"id": "open", "type": "M", "kind": "logo", "a": 0, "b": 8, "bg": "rays", "pal": "warm", "cam": "drift", "focal": "logo", "innerChangesEveryBeats": 1,
   "chars": [{"pose": "hero_jump", "x": 0, "y": 250, "s": 0.78, "at": 0}],
   "text": [{"at": 1, "content": "ToonKit", "primitive": "slam"}, {"at": 5, "content": "Animation", "primitive": "tracking"}]},
  {"id": "snap1", "type": "P", "kind": "alternate", "a": 8, "b": 16, "bg": "stripes", "pal": "cool", "cam": "snap", "focal": "pose snap", "poses": ["hero_pose", "hero_posef"],
   "text": [{"at": 8, "content": "HELLO", "primitive": "cropType"}]},
  {"id": "loop1", "type": "C", "kind": "plate", "a": 16, "b": 24, "bg": "checker", "pal": "warm", "cam": "snap", "focal": "loop", "plate": {"id": "loop", "m": 0, "mask": "none"}, "innerChangesEveryBeats": 2,
   "text": [{"at": 16, "content": "ONE TWO", "primitive": "replace", "words": ["ONE", "TWO"], "step": 2}]}
 ]
}
```

- `a` / `b` are beat numbers (`b: null` runs to the end). Every shot starts where the previous one ends. Pose ids refer to `poses/{id}.png`; a trailing `f` without its own file is the flip.
- **kinds**:
  - `logo`: `chars` pop in, and the title letters from `logo` drop in per beat.
  - `letters`: a plate in a mask plus a per-letter title (`perBeat`).
  - `names`: a plate plus name slams; the name that has a `pose` replaces the plate.
  - `cuts`: one pose per beat, with a color swap and a flash.
  - `alternate`: two key poses alternating every beat with squash (a pose and its flip gives a side-to-side snap); optional `endPose`, `burst` (a star burst per beat).
  - `plate`: masks `none` / `circle` / `heart`.
  - `split3`: three panels cut from one pose image whose figures are evenly spaced in thirds, wiped in, alternating.
  - `kaleido`: a mirrored plate.
  - `duo`: two plates, left and right; each shows its centre half, with optional `scale` per plate.
  - `pose`: one pose, slam in then squash per beat; optional `direction` (`left`/`right`) adds travelling arrows and sets the `whip` camera direction.
  - `finale`: a pose plus the end-card logo on the second text entry.
- **bg**: `rays`, `dots`, `stripes`, `checker`, `hearts`, `burst`, `none`.
- **cam**: `snap` (tilt per beat), `punch`, `drift`, `whip`, `spin`, `none`.
- **text primitives**: `reveal` (`words: true` for word timing), `slam` (`bounce`, `giant`), `tracking`, `splitWipe`, `replace` (`words`, `step` in beats), `counter` (`from`, `to`), `drawOn` (`♥` / `♪` icons), `cropType`.
- Shot entrances rotate automatically through iris, wipe right, wipe down and star mask.
