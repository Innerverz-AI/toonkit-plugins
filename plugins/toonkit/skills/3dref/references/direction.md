# Direction, motion, and numerical planning

Read this reference only for new direction/planning work; reuse it within the same run. This is artistic/engineering guidance, not a claim that Toonkit implements a physics or animation engine feature.

## Subject and environment

Set the path and interaction coordinates before dressing the set. Use scale, color, and silhouette to separate the subject, obstacles, and ground. A box/cylinder proxy is often better previz than a detailed model with unknown dimensions. Nonuniform scale is supplied directly through MCP; no linked-scale UI state is involved. The actual model's pivot and bounds determine contact, not the name of the primitive.

Make recognizable props from a few aligned pieces when the silhouette matters. Compute each part's world transform from a common local frame; this API profile has no parent/group transforms. Keep construction local and batch adds/colors. Avoid invisible detail, coplanar surfaces and default spawn offsets.

The stock human uses +Z forward, Y up and the XZ ground plane. Verify a new rig/model before propagating this convention. For tangent `(vx,vz)`, heading is `atan2(vx,vz)`; preserve heading at zero speed and unwrap angles. For direction `d=(dx,dz)`, geometric right is `r=(dz,-dx)`; companion placement is `P + lateral*r + forward*d`. Model-forward correction is separate.

## Body action

Read [body motion](body-motion.md) before character work; it defines source/baseline composition and the optional real-clip compiler. This supersedes any assumption that manual joint fields are absolute world/anatomical angles.

| Intent | First choice | Verify |
|---|---|---|
| Walk/run | Human preset plus root path | Alternating gait, cycle boundary, speed matching, foot sliding |
| Exact pointing/waving/count | Static pose plus joint keys | Raise → counted cycles → lower, elbow/wrist direction, torso follow-through |
| Jump/landing | Suitable jump source/preset or compatible motion media; source bake for sequences | Anticipation, push-off, flight, foot contact, compression, recovery |
| Animal locomotion | Verified animal motion or explicit blocking | Own forward axis, gait phase/support, ground contact; human presets are not animal presets |
| Complex acting | Existing suitable media, otherwise report missing capability | Do not claim new aRDY generation from an apply-media operation |

Do not double-count vertical root motion over a clip that jumps internally. Match world speed to source cadence. A run cycle plus parabolic height is not an anatomically convincing jump and must not silently replace one. Body-pose corrections multiply the active source quaternions; exact rules are in body-motion.md. Static `sitting` is a pose, not the transition into a chair. Do not run repeated browser experiments in ordinary production.

For precise hand gestures, key anticipation, action extremes, and recovery; allocate actual time to raising and lowering the arm. Use only live joint IDs/fields (`tiltX`, `tiltZ`, `twist`), never guess anatomical axes from their names. Minimal recognizable silhouette takes priority over unseen finger detail. There is no tested auto-IK/contact constraint, animation blend stack, or animation clear operation in this profile.

## Camera continuity

Convert each framing requirement into an anchor: time, visible body parts, subject screen size, camera side, and intended hold. Relative-camera tracking uses the finalized subject path. Aim at a stable body region or smoothed target, not the raw head oscillation. Keep enough margin for actual pose changes.

One continuous rise/pullback/lens change uses one interval and a shared progress function. The helper's rest-to-rest seventh-degree form is `s=35u^4-84u^5+70u^6-20u^7`: interpolate elevation and target offset with `s`, and positive distance/lens logarithmically with `s`. Do not insert an extra zero-speed knot merely because the shot passes an overhead composition. Start with a fixed lens. A change in projected scale should be intentional and continuous, not a final-second lens snap.

For multi-anchor paths, position, velocity, acceleration, and jerk must agree on both sides of every ordinary waypoint. The helper uses seventh-degree Hermite segments with shared derivatives (C3) and an analytic travel tangent. C2 root travel alone can still produce a camera acceleration jump when the camera follows the subject's heading, because heading differentiates the path. Holds explicitly zero the derivatives. C3 continuity does not bound their magnitudes, curvature, or overshoot automatically; inspect the metrics, clearance, and actual motion. Do not use a fresh ease-in/ease-out on each ordinary key.

Camera coordinates from target T, distance d, azimuth a, elevation e:

`C = T + d*(cos(e)*sin(a), sin(e), cos(e)*cos(a))`.

Angles above are geometric angles, not UI Euler inputs. For a new orientation convention, prefer native `camera.lookAt`. The encoder implements world-up lookAt converted to XYZ Euler. Nonzero Euler Z under combined yaw/pitch does not alone indicate a tilted horizon; do not zero it indiscriminately. Exact vertical views need an explicit roll/up convention; the helper rejects that singular case. Near poles/full orbits, compare orientation matrices and documented interpolation numerically, not via a screenshot-inspection loop.

## Planner input and output

The compiler's `shot` object uses this schema; `scripts/plan.py` evaluates it internally.

- `durationSeconds`, `fps`, `aspect`: physical timeline. Playable frames are `0..round(duration*fps)-1`.
- `subject`: sorted `{time,position:[x,y,z]}` anchors covering time 0 through the last playable frame. Optional `velocity`, `acceleration`, `jerk` are three-vectors in world units/s, units/s², and units/s³. Optional `hold:true` zeroes derivatives unless explicitly supplied.
- `camera`: sorted `{time,azimuth,elevation,distance,focalLength,targetOffset}` anchors covering the same timeline. Angles in degrees, meters for distance/offset, millimeters for focal length. `hold:true` stops relative framing changes, not world tracking of a moving subject.
- `cameraFrame`: `world` (default) or `heading` (azimuth relative to the subject's path heading). Target offsets remain world-space.
- Optional camera derivatives (`velocity`, `acceleration`, `jerk`) are seven-vectors ordered `[azimuth, elevation, log(distance), log(focalLength), offsetX, offsetY, offsetZ]`; their units are per second/per second²/per second³. Author continuous angular values such as 170→190, or 0→360 for an intended full revolution; the planner never guesses the intended spin.
- `obstacles`: named world-space axis-aligned bounds `{name,min:[x,y,z],max:[x,y,z]}`. They are conservative proxies, not mesh collisions.
- `requiredPoints`: named root-relative offsets that must remain visible. Contact, a moving head, and a jumping foot need bounds derived from actual motion.
- Optional `sensorWidthMm` (default 36), `frameSafeNdc` (default .9), `far` (40), `near` (.05), `clipMargin` (.5), `cameraRadius` (.15), `subjectRadius` (.3), `groundY` (0), `keyframeBudget` (2000), `initialHeading` (0).

The output contains every playable sample, positions, headings, camera targets and lens, a projected-scale proxy, and a compact diagnostic summary. Read only that summary into context unless investigating a particular frame. The default 36 mm projection is explicitly a proxy: Toonkit's actual film gate, aspect handling, rig dimensions, bounds, and output resolution were not established by the MCP catalog.

Dense baking costs two stored keys per frame in the two-track helper. A 30-second, 60-fps scene exceeds the tested 2,000-key limit; the helper reports an error. Do not silently lower the user's FPS. Verify interpolation to compress the bake, author a simpler motion that needs fewer keys, or explain the specific capacity conflict. Other moving props/actors add to the budget.

## Efficient verification

Check geometric invariants over **all computed frames**, then compare plans to MCP readback in code. Keep sampled arrays out of chat. Use source body markers/bounds for jump clearance, not only root+constant-height approximations. Read saved status and real export metadata once. Skip routine rendered screenshots, contact sheets and per-frame browser inspections, as requested. Actual pixels/contact remain unverified; do not call a numeric pass visual validation. Never label a mathematical plan, synthetic preview or queue entry as Toonkit's exported video.

Report actual tool-call counts and payload reductions when measured. Smaller instruction text and batch count are proxies for efficiency; they do not establish an exact Codex token reduction or a monetary saving. Do not infer task usage from account-wide quota percentages.
