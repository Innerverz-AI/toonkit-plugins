# Source motion contract

Use the stock rig and supported checksum-pinned sources: standing-idle, idle, running, walking, jumping. New source names, imported rigs and animal acting need a release profile; a live catalog name alone is not proof of compatible rest axes or contact.

The renderer applies bone-local additive corrections:

`q_final = q_source × Quaternion(Euler(tiltX, twist, tiltZ, "YXZ"))`

These are not absolute skeleton poses or world rotations. Do not synthesize anatomy from guessed sine angles or mirrored joint signs. The compiler samples actual FBX quaternions, checks compatible rest axes and round-trips all 22 joints to 0.001°. Source reconstruction preserves source motion; it does not repair the source's acting or create IK.

## Embedded motion block

For a simple cycle use actor.preset; otherwise actor.motion:

```json
{"format":"3dref-motion-v1","rig":"stock-human","baseline":"running","segments":[{"preset":"running","start":0,"end":4,"sourceStart":0,"speed":1,"loop":true}]}
```

The scene compiler supplies durationSeconds, fps and timeWarp. If explicitly supplied they must agree. Baseline is running/walking/idle/standing-idle. Native baselines sample at output time; exact additive corrections reconstruct retimed desired motion. Unchanged native intervals have no pose correction. Standing-idle is static, but fully baked motion can need more keys.

Segments are ordered, cover every playable output frame and may overlap pairwise for a quintic-weight quaternion blend. No gaps/nested/triple overlaps. start/end are output seconds; sourceStart is source seconds; speed is positive source-seconds per **action second**. Action time integrates the scene's shared timeWarp. Individual jumps use loop:false; clip overrun fails. `phaseLock:true` is allowed only for identity timeWarp, matching native baseline, speed1, sourceStart0, looptrue, to resume its ongoing native phase.

`motion.applyPreset` sets one object-wide slot, not a clip region. Repeated preset calls do not sequence actions. Applying a source does not erase manual corrections. This package creates fresh, unit-scale, correction-free actors and checks them before authoring. It does not patch an existing rig implicitly.

## Coordinate and contact ownership

The source's horizontal hip translation is removed by the stock renderer; the planned path owns world travel. Source provenance reports normalized horizontal travel and average speed. During running/walking surface intervals, the compiler compares actual root travel with measured source speed × segment speed × action rate. Sustained disagreement beyond 20% for 0.3 action-seconds fails by default. Match the route or cadence. Explicit stylized locomotion may retain an intended mismatch, but emits the measured warning and reason; never invent that reason simply to pass.

The path owns the nominal ground/support point. Source rootYOffset replaces baseline hip bob once along actor-up. Bone markers use `object-local-after-root-offset`: rotate by actor XYZ and add the **final object position**, not groundPosition. This gives the desired source hip height exactly once. No extra jump parabola. Body bob does not shake camera aim.

The pinned jump is in-place. Derive anticipation, takeoff, flight and landing from its foot/toe markers and actual clip duration; do not assign flight by the midpoint or stretch running across an unsupported curve. For a traveling jump, place ground-path travel in the airborne interval and validate finite takeoff/landing faces. Source blending alone does not establish contact.

## Encoding and limits

All actors' base/root/camera keys are authored before any additive overlays. Overlay patches affect only newly owned keys. Source pose changes retain every output sample exactly; only constant/zero pose intervals collapse. Root/camera keys are reduced within 2mm, 0.05° and 0.02mm lens error, then replayed with the verified renderer interpolation before all spatial/framing checks. No FPS reduction or tolerance loosening to fit capacity.

`compiled.sources` records asset URL/hash/duration and stride measures. `compiled.summary.checks.preflight` records support, interactions, framing, motion peaks, stride and warnings. Body source checks do not certify fingers, skin/sole collision, subframe interpolation, physical foot plants or rendered artistic quality. If key/scene capacity cannot represent the requested choreography, report that conflict and the narrow alternatives; do not silently split the take or purchase motion generation.
