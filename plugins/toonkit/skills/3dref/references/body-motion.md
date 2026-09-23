# Body motion: source first, no guessed anatomy

## Bone-local source composition

The stock human's manual `pose` is a set of **corrections relative to the active source pose**, not a complete human skeleton pose. Observed client implementation on 2026-09-22:

`q_final = q_source × Quaternion(Euler(tiltX, twist, tiltZ, "YXZ"))`

The axes are bone-local, not world axes. Source is the animation slot if present, otherwise the poseAsset slot, otherwise rig rest. Rest frames and bone axes differ between arms, legs and left/right. Do not infer “positive knee bend” or mirrored shoulder values from joint names. A valid finite degree value is not an anatomically valid action. Zero corrections preserve the source, not a universal standing pose.

Never synthesize a gait from guessed sine-limb angles or repair anatomy by globally flipping one local sign. Numeric readback fidelity does not validate anatomy.

## Choose the lowest-risk representation

| Need | Representation |
|---|---|
| Continuous walk/run/idle | Native `motion.applyPreset` in animation slot, no manual limb corrections; root path separately |
| One full native jump | Native jumping preset, with its actual clip timing/loop behavior accounted for |
| Run→jump→run, explicit repeated jumps | Native locomotion baseline with phase-locked run sections and source-derived action overlays |
| Fully retimed choreography | Static standing-idle baseline with no animation, if full-body key capacity permits |
| Complex acting already available as compatible Toonkit motion media | Apply that actual media; preserve its timing/root convention |
| Small gesture correction | Known baseline and calibrated local axes; change only necessary joints with explicit recovery |
| New rig/unsupported acting | Obtain compatible source motion or disclose unsupported motion; do not generate an uncalibrated full-body approximation |

`motion.applyPreset` changes one object-wide slot. `startFrame` shifts that clip's sampling origin; it does not create a timeline clip region. Before start it holds the first sample. In the observed runtime native moving presets loop; static assets sample at time 0. Animation takes precedence over poseAsset. Repeated running/jumping/running calls leave the final slot, not a three-part performance. Do not invent clip trimming/blending/clear/IK operations.

Applying a new preset does not erase existing manual base/keyframe corrections. Root-only key insertion snapshots the current evaluated pose. If repairing an existing actor, read all affected poses/keys, preserve transforms and unrelated gestures, and zero only the identified erroneous joint channels across base and affected keys under the user's revision scope. `{}` is not a clearing command. Do not remove unrelated keys, silently replace the actor, or rely on a static pose to clear an animation slot. A baked body requires a fresh correction-free actor with its declared baseline: a native animation at frame 0, or static standing-idle with no animation. If an existing actor cannot meet that condition through supported authorized edits, request the narrow replacement/clear decision.

## Optional source-clip compiler

Normal production uses compiler.py with one embedded motion specification; see [execution](execution.md). Reuse a compatible dependency/source cache. No standalone motion/body/trajectory/batch files are needed.

Use only for the unmodified stock human; not an imported rig, animal or model override. `scripts/motion_bake.mjs` reads official public FBX source assets, samples real bone quaternions, blends selected clips locally, and computes corrections against the declared baseline. Prefer native `running`, `walking` or `idle` sampled at the same scene time; unchanged phase-locked intervals need zero corrections. Static `standing-idle` at time 0 remains available for fully retimed choreography. It is **offline computation plus public asset downloads, not browser authoring or a hidden export endpoint**. It neither calls MCP nor spends credits. Do not fetch assets with browser cookies or private URLs.

The package needs Node.js 20+ for this route; Python-only/native motion remains available. Reuse the task-local dependency/cache. `--offline` forbids downloads once cached. Do not install globally or modify npm's global cache to resolve permissions. A pinned rig/baseline checksum mismatch stops compilation; inspect the changed public source before updating the profile, never bypass the check to force a bake. Do not fetch/reverse-engineer the whole client during ordinary production.

The embedded motion block requires `format:"3dref-motion-v1"`, `rig:"stock-human"`, `baseline` (running/walking/idle/standing-idle), `durationSeconds`, `fps`, and ordered `segments` with:

- `preset`: a live available stock preset; `start`/`end`: scene seconds, with end exclusive.
- `sourceStart`: seconds into the source; `speed`: source-seconds per scene-second, strictly positive.
- `loop`: explicitly true for cycles; false for an individual jump/action. A jump cannot loop in the compiler.
- `phaseLock:true`: only for the native baseline preset, speed 1, sourceStart 0, loop true. Sample at scene time so native gait resumes at its ongoing phase, not a newly restarted cycle. Changing cadence needs the static retimed route; native MCP motion has no exposed speed control.
- Adjacent clips may overlap for a quintic-weight quaternion crossfade. Cover every playable frame, no gaps, nested clips or triple overlaps. The compiler rejects a non-loop clip overrun. Derive actual clip duration from output provenance, not a memorized number.

Choose phase and overlap to preserve support and momentum; prefer transitions when foot support and joint velocities agree. Crossfading quaternions does not enforce foot contact. Native source assets can themselves have imperfect action/loop boundaries.

The pinned `jumping` source is an **in-place** jump, not a running hurdle. Keep grounded anticipation/landing planted and travel during flight, or choose an actual traveling-jump source. If the brief requires uninterrupted momentum that the source cannot supply, disclose the limitation. Locate takeoff/apex/landing from source foot/toe height and support changes, not the segment midpoint. Position obstacles within the airborne clearance interval. A clip name does not certify hurdle clearance.

Output:

- Per-frame `pose`: `inverse(q_baseline) × q_desired`, decomposed in **YXZ**, wire fields `{tiltX:x, tiltZ:z, twist:y}`. Euler branches are unwrapped. Recomposition is checked to 0.001°; do not clamp values to UI slider bounds (clamping destroys the source pose). If a current MCP rejects a value, stop and use a representable source/pose; never bypass its validation.
- `rootYOffset`: source hip height minus the baseline hip height at that same time (time 0 for static baseline). This replaces baseline bob with source bob/compression/jump rather than doubling it. **Do not add another jump parabola.** The root path supplies ground elevation, XZ travel and heading. Root uniform scale must be 1 for this profile; scaled actors require reviewed conversion.
- `markers`: source-derived local knee/foot/toe/hand/head positions including hip motion. Rotate by planned yaw and translate by the **ground path**, not the body-offset root a second time. Use them for framing/clearance/support calculations. Bones are not sole/skin bounds; allow real safety margin. Hip XYZ translation other than the retargeted Y is deliberately not transferred, matching the observed runtime's root retargeting.
- Provenance/hashes and numeric summary. Complete 22-joint reconstruction is not finger-animation transfer, physics or rendered QA. Dense frame keys preserve each sampled rotation; large Euler steps can still make subframe interpolation imperfect. Review warnings and do not call them a natural-motion certificate.

Finalize horizontal speed against source stride/cadence. Provenance reports source horizontal travel and average speed after stock-human normalization; the engine removes that horizontal root translation. Arbitrary slow root travel with a full-speed run can slide badly. Use those measured values multiplied by segment speed, not a hardcoded stride. Slow cadence and/or adjust the path within the brief; if matching is impossible, disclose it. Retiming does not automatically create accurate foot plants.

The compiler merges body samples with a same-duration/FPS camera trajectory whose subject Y is a ground path. Include named axis-aligned obstacle bounds in `shot.obstacles`; `bodyClearanceMargin` defaults to 0.05 m. Generic checks use body markers and lower-leg segments, replacing the inappropriate ground-root collision proxy during a jump. They do not certify full skin/mesh collision or foot-plant IK.

Before dispatch create the actor via MCP with `presetKey` equal to the declared baseline. Verify the manifest requiredActor conditions: matching animation at frame 0 (or no animation/static standing-idle), no model override, unit scale, empty keys and no prior corrections. The manifest cannot inspect the remote actor. A static-baseline bake over running double-composes the action; a native-baseline bake is valid only against that exact time-synchronized native source.

For native baselines the encoder emits **two ordered passes in one manifest**: all root/camera keys first with no pose corrections, then nonzero action-frame pose overlays. Overlays use overwrite true only for this run’s newly created actor keys, preserving their transforms. Do not reorder batches, add intervening manual corrections or send only one pass. Native intervals remain empty-pose snapshots, not inherited jump poses. This avoids storing 22 joints on every running frame while retaining exact action samples. These are ordinary MCP keys, not a server blend operation. Do not use `--overwrite` or `--reduce-body` with this route; it requires a fresh key-empty actor. The base pass temporarily has action-height offsets without final action poses: keep the timeline visible, but do not start playback/export until both passes and the final saved-state barrier finish.

The encoder adds body Y once and attaches pose to root keys; it **does not** move the camera with each hip bob. Plan stable camera aim with enough clearance using body markers before compilation, and recompute camera/framing proxies if body timing/path changes. Preserve complete camera motion when fixing only the actor.

Full-body keys are larger than root-only keys. The encoder uses a conservative scene-size reserve and rejects oversized dense bakes. Prefer native motion or native-baseline overlays. On a fresh static-baseline baked actor, add `--reduce-body` to retain only keys needed within 1° joint/root-yaw and 3 mm root-position error at **every original output frame**. The current client linearly interpolates these fields; the reducer reconstructs quaternions from interpolated YXZ corrections, not just channel differences. Read the measured `bodyReduction` manifest; output FPS does not change. It does not bound between-output-frame subframes, skin/sole contact or another interpolation mode. Tolerances can be explicitly set with `--body-angle-tolerance` and `--body-position-tolerance`; never loosen them merely to force a passing file without weighing the shot requirements. Full-speed sprint can need nearly every frame, so savings are not guaranteed. If still oversized, use an authorized shot split/compatible motion asset; do not lower FPS or split a required one-take silently. Never paste per-frame joint arrays into chat.

## Numeric checks instead of screenshot loops

Before batching check source compatibility, quaternion roundtrip, interval coverage, one jump per requested event, root-height ownership, support-phase cadence, foot/toe clearance around obstacles, and landing/recovery intervals. Use bone-chain directions or source quaternions to reject knee hyperextension; do not use the sign of one local channel as an anatomical test. Same-skeleton source reconstruction preserves its bend direction without guessed joint signs.

On plain native motion, keep pose corrections absent/zero and read the preset back once. On composed motion, compare frame poses/root transforms numerically to readback; that proves data fidelity, not contact quality. Browser remains visible for the user, but do not collect anatomy/framing screenshots or require a rendered review pass. Report the source/bake choice and any unverified contact approximation honestly.

Source basis: Toonkit public client build `3dde95d18550372034afd87930d8a2104b8f7a7e`, modules human-joint mapping/reducer and renderer; public stock FBX assets at `public-cdn.toonkit.io/reference-3d/`. Sample/compose mathematics uses the official Three.js FBXLoader and Quaternion APIs. Recheck only if the rig/assets/schema change; these implementation details are not permission to mutate private runtime state.
