# Production input v2

Write a JSON spec. IDs are unique lower-case strings matching `[a-z][a-z0-9_-]{0,47}`. Dimensions/positions are meters, rotations are XYZ degrees, time is seconds. Defaults: 24fps, 16:9. No project IDs or per-frame arrays belong in the spec.

Required top-level fields:

- `format: "3dref-production-v2"`
- `timing: {durationSeconds, fps?, aspect?}`: duration 2–30, fps one of 12/15/24/30/60; integral frame count. aspect is a string: `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"` or `"21:9"` (not an array).
- `objects: [...]`: calibrated boxes. Each has `id`, `center:[x,y,z]`, `size:[width,height,depth]`, optional `rotation:[x,y,z]`, `name`, `color`, and required `role` (`visible`, `contact`, `orientation`, `occluder`) plus `purpose`. `usedBy:[beat names]` identifies offscreen functional geometry. Center/size describe an oriented box. For a box on ground y=0, center.y=size.y/2. The compiler converts this to ToonKit's actual bottom-pivot transform; never supply raw scale.
- `actors: [...]`: each has `id`, optional `name/color/initialForward`, `path`, `support`, and either `preset` or `motion`.
- `camera: {...}` and `quality: {...}` below.
- Optional `timeWarp:[{time,speed},...]` spans 0..duration. This is the shared monotonic action clock; speeds must be positive. Quintic speed ramps are integrated exactly. Camera and beat times remain output seconds.

## Actor path and motion

`path` contains at least two `{time,position:[x,y,z]}` anchors, starting at action time 0 and covering the final mapped action time. Positions are nominal support-root points. The compiler adds 2.5cm normal clearance, plus source-owned root height once. Optional `rotation:[x,y,z]` must be present at every anchor if used. Optional `velocity/acceleration/jerk` are three-vectors; `hold:true` explicitly stops at an anchor. Curves are C3, but their resulting speeds/clearance are checked separately.

On a single support face, omitted rotation aligns actor-up to its normal and actor-forward to path velocity. A static actor can specify `initialForward`. Transfers and flights need explicit orientation anchors, preserving intentional orientation through the interval.

For uninterrupted native-cadence movement, `preset:"running"`, `"walking"`, `"idle"` or `"standing-idle"` creates a source-verified body track automatically. Native-matching intervals need no pose corrections. The path should match measured source stride; the source report includes distance/cadence. Altered cadence/composed actions use `motion`, the `3dref-motion-v1` format from [body motion](body-motion.md). The compiler injects duration, fps and the same timeWarp; conflicting values fail. Source body/FBX cache is optional acceleration. Never reuse an earlier scene's calculated poses as new input.

## Support throughout the timeline

`support` is an array of nonoverlapping intervals covering every playable frame in **output time**, including the roll/turn/jump transition. Every surface reference is `{object:"declared-object-id",face:"+x"|"-x"|"+y"|"-y"|"+z"|"-z"}`. It is derived from that object's transformed finite face, not a manually typed plane.

- Surface: `{start,end,mode:"surface",surface:{object,face}}`. Ground-root must be within 5cm of the finite face, up must align with its normal, and source feet must remain within the gait support envelope. Brief gait flight is measured in action time, so slow motion does not incorrectly fail.
- Transfer: `{start,end,mode:"transfer",surfaces:[{object,face},{object,face}]}`. Maintains support on at least one of the two real faces. This does not create a curved ramp between flat faces. Keep the trajectory at the actual corner and verify orientation/source pose, or plan an explicit jump.
- Flight: `{start,end,mode:"flight",takeoff:{object,face},landing:{object,face},maxSeconds,reason}`. Endpoints must meet their finite faces and the interval needs compatible source airborne motion (`jumping` in this release). Ordinary running over a floating curve is rejected. Plan anticipation, takeoff, flight and landing using actual clip phases; non-loop clip duration must fit.

These are bone/root support checks, not sole geometry or physical IK. Do not claim more than they measure.

## Camera

`camera.targets` optionally names any nonempty subset of actor IDs; default all. Target is their ground-root centroid plus their average actor-up times `targetHeight` (default .85m), then the anchor's world `targetOffset` (default zero).

`camera.anchors` contains at least two rows starting at output time 0 and covering the last output frame:

`{time,azimuth,elevation,distance,focalLength,targetOffset?,roll?,hold?}`

Angles are degrees; distance is (0,40]m; lens is 14–135mm. Shared seven-channel velocity/acceleration/jerk vectors may be supplied for azimuth, elevation, log distance, log lens and target offset. Near/far are .05/40m. `referenceUp` optionally replaces world +Y for an otherwise singular vertical view. The effective film gate accounts for portrait aspect.

For an exact 90° wall-as-floor transition, use `camera.floorRoll:{start,end,degrees:90,surface:{object,face}}`. The compiler tests both signs against all settled frames and uses the valid side. If neither works, change the camera side/aim; don't reverse the intended floor. End must precede duration. Do not simultaneously use anchor roll and floorRoll.

## Framing and motion constraints

`quality.beats` covers every output frame, with unique names and all actor IDs in each `actors` map. A row is `{name,start,end,actors:{ID:{height:[min,max],frameSafeNdc?,actionRate?,minTravel?,maxTravel?}},cameraMotion?,maxStaticSeconds?,maxRelativeHoldSeconds?}`. Height is fraction of frame. Intentional absence uses `{offscreen:true,reason}`. `cameraMotion` can require `minTravel/minRotationDegrees`. An intentional static/relative tracking interval has `allowStatic`/`allowRelativeHold` explaining it. Default maximum holds are 2s.

`quality.limits` maps `camera` and actor IDs to `maxSpeed`, optionally `maxAcceleration/maxJerk`; camera also supports `maxAngularSpeed`. Choose meaningful bounds for the requested style. `maxProxies` defaults to 24; a larger number needs `budgetReason`. Do not add free-standing `surfaces` inside beats; support and floorRoll own that contract.

## Compile and inspect

`python3 -B <skill>/scripts/compiler.py <spec.json> --run <new-run> --runtime <cache>/runtime --cache <cache>/motions`

The Node runtime needs pinned `three@0.184.0`; [execution](execution.md) covers setup. Use `--offline` only if all required public FBX files already exist. The new run may contain only its own spec.json or a failed diagnostic.json. Output: spec, immutable compiled bundle, durable journal. CLI output is compact; detailed constraints/metrics live in compiled.summary. Failure writes diagnostic.json with measurements; no remote scene is created.

`actor.locomotion` defaults to `{mode:"source-matched"}`. An explicitly intended exaggerated stride can use `{mode:"stylized",reason:"shot-specific intent"}`; measured mismatch remains a warning. This is not a way to waive support, collision or framing.

`quality.actorClearanceMeters` defaults to .3m (minimum .1m), measured between body-axis proxies. Intentional close interactions use `quality.interactions:[{actors:[id,id],start,end,minSeparationMeters,reason}]`, where minimum separation is nonnegative. Swept bone-marker collisions against solid geometry are checked separately.
