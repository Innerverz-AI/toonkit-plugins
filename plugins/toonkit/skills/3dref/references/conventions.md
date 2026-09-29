# Spec conventions (read before writing `3dref-production-v2`)

Source-derived facts. Start from `examples/`.

## World and actors

| Item | Convention |
|---|---|
| Axes | Right-handed, **+Y up**, meters, degrees, Euler XYZ (three.js) |
| Actor local | +Z forward (toes), +Y up, **+X = actor's left**. Stock human 1.70 m; Head marker ≈1.49 m |
| Yaw | `rotation:[0,ψ,0]` faces `(sinψ,0,cosψ)`: +Z ψ=0, +X 90, −X −90, −Z 180 |
| No rotation anchors | up = support-face normal, forward = path velocity; static actor uses `initialForward` (default [0,0,1]) |
| Rotation anchors | Needed at **every** path row if any flight/transfer. Raw numbers interpolate (no wrap: 350→10 spins back; write 350→370). Same C3 curve as position but no `velocity` field: it overshoots next to a turn; pin with `hold:true` (also stops the path) or add a nearby row with the same rotation |
| Path | `time` = **action** seconds; `position` = support point (compiler adds 2.5 cm + source hip, both along the actor's rotated up: pitched or inverted mid-flip, the hip swings below the path point). `velocity` m/action-s; `hold:true` = stop |
| Interpolation | C3 curve, default knot velocity = neighbour difference, accel/jerk 0 → can overshoot; give `velocity` or `hold` to pin |

Box faces: `+y` = face whose outward normal is the box's **rotated** local +Y. `rotation:[θ,0,0]` → normal (0,cosθ,sinθ): top **descends toward +Z** for θ>0, so a ramp rising toward +Z uses θ<0. `rotation:[0,0,φ]` → top rises toward +X for φ>0. On a sloped `+y` surface the actor's up follows the normal (≥0.98 enforced) — she leans with the slope; stairs = flat stacked boxes with flights/transfers.

## Camera anchors

Camera = target + d·(cos el·sin az, sin el, cos el·cos az).

| Field | Meaning |
|---|---|
| azimuth | **World**, not actor-relative. 0 = camera on +Z of target, 90 = +X. Increasing = **counter-clockwise from above**. Actor with yaw ψ: front ψ, left ψ+90, behind ψ+180, right ψ−90 |
| elevation | + = camera above target (−90..90). Camera must stay ≥0.15 m from every box incl. floor |
| distance / focalLength | 0–40 m / 14–135 mm (36 mm film width; both log-interpolated) |
| target | targets' ground-root centroid + actor-up·`targetHeight` (0.85) + world `targetOffset` |
| roll | + lifts camera-right → image turns clockwise. Excludes `floorRoll` |
| hold | zero velocity/accel of all channels at that row |

Rows interpolate like paths (C3, output seconds, no angle wrap). Subject height ≈ 1.45·f/(H·d), H = 20.25 mm at 16:9 (36 portrait).

| Shot (actor yaw ψ=0, running +Z) | Rows |
|---|---|
| Low follow behind | `{az:180,el:-4,d:4.2,f:32}` rows at 0 and 2.5 (`hold`) |
| Orbit her LEFT, behind→front | az 180 → 90 (t 4.5, d 3.6) → 0 (`hold`): **decreasing** az |
| Leading in front | az 0, el 4, d 4.2–4.6 |
| Over right shoulder | az 200, el 8, d 3, f 32, targetHeight 1.1, `frameSafeNdc` 1.5 (max crop), `allowRelativeHold` reason. Tighter needs `offscreen:true`+reason (drops framing/occlusion checks) |

## Motions

| Name | Use | Measured |
|---|---|---|
| `running` | preset or segment | 0.633 s loop, **5.56 m/s** at speed 1 |
| `walking` | preset or segment | 1.033 s loop, 1.68 m/s |
| `idle` | preset (breathing, in place) | 8.33 s loop |
| `standing-idle` | preset or segment, static pose | 0 m/s |
| `jumping` | **`motion` segment only**, `loop:false` | 1.9 s, in place. Crouch 0.1–0.5, feet leave ≈0.52, peak feet ≈0.97 m at 0.8, touchdown ≈1.1, absorb to 1.6 |

No other names bake. Path speed must match source speed × segment speed within ±20% (longer than 0.3 action-s fails); `locomotion:{mode:"stylized",reason}` downgrades to warning. `motion` = `{format:"3dref-motion-v1",rig:"stock-human",baseline:running|walking|idle|standing-idle,segments:[{preset,start,end,sourceStart,speed,loop}]}`; start/end output s, speed = source-s per action-s, overlaps ≤2 blend. Source time = sourceStart + (A(t)−A(start))·speed; non-loop must end ≤ clip.

Jump: support `flight` from output time of source ≈0.52 to ≈1.1; takeoff/landing root within 6 cm of the named faces. Path moves up/forward only inside that window (S-curve with explicit `velocity`). Keep toes (lead ≈0.33 m) clear of the ledge edge: edge ≈1 m before the landing root.

## timeWarp slow motion

`timeWarp` rows `{time(output s),speed}`; each pair ramps by quintic smootherstep (speed s0+(s1−s0)(6u⁵−15u⁴+10u³), C2). Action duration of a row pair = Δt·(s0+s1)/2. Path + motion `speed` use action time; support, beats, camera, segment start/end use output time. Example: [0:1, 2.6:1, 3.2:.25, 5.4:.25, 6:1, 8:1] → A(3.2)=2.975, A(5.4)=3.525, A(6)=3.9, A(8)=5.9. Path must cover A(last frame). `actionRate:[.25,.25]` in a beat asserts the slow section. Map output to action seconds with `python3 <skill>/scripts/timewarp.py '<timeWarp rows>' <duration> <t>...` instead of hand integration.

## Preflight failures → fix

| Code (diagnostic) | Threshold | Fix |
|---|---|---|
| `unsupported-ground-path`, `root-outside-finite-support-face` | root ≤5 cm off face, measured after the 2.5 cm clearance (extra lift ≤2.5 cm); inside face +3 cm | path y = face height; widen box |
| `feet-penetrate-support` / `swept-marker-solid:<box>:<actor>` | feet > −3 cm (`deepestMeters`/`deepestFrame`); no marker's frame-to-frame sweep enters a box (`markers` names them) | move blend overlap/`sourceStart` (0.22 s overlap into jump source 0.1 works); near turns add rotation rows (overshoot) |
| `unsupported-feet-beyond-gait-envelope` | feet gap ≤0.35 m; >8 cm ≤0.3 action-s | use `flight`, check phases |
| `flight-*-misses-face`, `flight-without-airborne-motion` | ≤6 cm; `jumping` active | retime interval to source window |
| `stride-mismatch` | ±20% | path speed or segment `speed` |
| `<beat>:subject-size`, `<beat>:framing` | `height` = half NDC marker span, band 0 < min < max ≤ 1.5; markers ≤ `frameSafeNdc` (default 0.9, max 1.5) | distance/focal/targetHeight or band |
| `proxy-occludes-actor:<box>` | camera→9 markers ray hits a box | raise/sidestep camera, move box edge |
| `camera-proxy-collision` | 0.15 m | raise elevation / move camera |
| `motion-limit:<id>:maxSpeed` | your limits; actor root includes hip bob (jump crouch spikes) | smoother blend or looser bound |
| `offscreen-proxy`, capacity | ≤24 proxies, ≤2000 stored keys, ≤512 KB estimated (message reports both) | cull. Pose keys are corrections over the editor-played `baseline`: a native baseline (`running`/`walking`/`idle`) is free only where it plays unchanged (its own preset, speed 1, no slow motion); elsewhere every frame corrects a moving base. For mixed actions or `timeWarp` use baseline `standing-idle` (measured 15 s run+jumps+slow-mo: 644 KB → 461 KB) |

Holds >2 s only warn unless `maxStaticSeconds`/`maxRelativeHoldSeconds` is set.

## Iterate

Compile takes 1–2 s. On exit 2 read `<run>/diagnostic.json` only: `message`; `stage` (`support`, `interactions`, `locomotion`, `preflight`, `floor-roll`; absent = schema error in `message`); `issues{code:{count,first|firstFrame,last|lastFrame,examples}}` (frame/fps = output s); plus `actors` (support/locomotion), `beats`, `motion`, `motionPeakFrames`, `proxies` (preflight). Edit the spec and recompile in the same run. Passing summary: `compiled.json` → `summary.checks.preflight`. Never read `scripts/`.

## Examples

`examples/example-run-follow.json`: 8 s, `running` preset along +Z (5.56 m/s × 8 s) on a street with side blocks.
Camera: low follow behind (az 180, el −4), held orbit through her left (az 90 at 4.5 s) to the front (az 0 at 6.5 s), then leading.
Compiles to 104 keys / 7 batches.

`examples/example-jump-slowmo.json`: 8 s, runs +X (yaw 90, running ×0.8 = 4.45 m/s), jumps onto a 0.8 m ledge.
timeWarp 1→0.25→1 with the flight mapped to 3.1–5.42 s output; jump segment source 0.1–1.6 blended both ways.
Camera: 3/4 front-left low (az 140→130, el −8) through the jump, then swings to rear-left. 272 keys / 14 batches.
