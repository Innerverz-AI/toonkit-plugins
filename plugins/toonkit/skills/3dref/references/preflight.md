# Verification model and maintenance

For compiled choreography, the compiler owns geometry, body clocks, emitted tracks and their checks. Native MCP work uses scoped verification without claiming these source-level checks. A manually written plane or a `passed:true` JSON field is not independent evidence. Do not fabricate passing evidence to bypass a failed measured constraint.

| Stage | Evidence | Prevents |
|---|---|---|
| Intent | All-frame beat/support coverage, exact user timing, declared actor IDs | Missing second actor, unfinished tail, invented flight |
| Renderer profile | Public-source hashes; primitive local bounds/pivot; film gate; XYZ/pose interpolation | Floating bottom-pivot buildings, projection mismatch, wrong wrap |
| Source motion | Pinned FBX, compatible rest rig, quaternion roundtrip, one root-height owner | Guessed anatomy, doubled jump height, root-only slowmo |
| Emitted playback | Sparse keys decoded with actual interpolation | A passing ideal curve becoming an unsafe rendered curve |
| Spatial | Finite support faces, gait envelope, actor separation and swept bone markers, camera collision/occlusion | Air-running, tunneling, actors inside each other, blocked view |
| Direction | Screen-up wall normal/head-above-feet, framing/subject size, action-rate/travel, hold and motion limits | Ceiling roll, invisible actor, static tail, missing slowmo |
| Persistence | Exact bound IDs, revision/application barriers, exposed-field readback and explicit missing evidence | Accepted-but-unapplied edits, partial actors, inherited pose |
| Export | Durable attempts distinguishing no-click from uncertain click, source edge + new output ID + decoded metadata | Duplicate export, mistaking 3D preview for output |

Failures preserve diagnostic.json with named constraints, actual measurements, limits and representative frames. Finite-difference motion peaks identify the start of the relevant frame window. Read only relevant evidence, correct the spec, and recompile locally. Do not spend browser/API calls tuning a failed plan.

Limits are explicit: stock bones are not full skin/sole meshes; source gait has aerial phases; contact thresholds are a profile envelope, not physics. Numeric/data/metadata checks cannot certify artistic quality or human acceptance. User visual review remains distinct. Do not claim “perfect” or universally supported.

## Release profile maintenance

A company release validates relevant renderer changes, not every user request. Bundle names alone are not compatibility evidence; they must never gate scene edits or Export. `scripts/engine-profile.json` identifies verified public assets and SHA256. Validate the relevant current public renderer code and source FBX hashes in a maintenance workspace; update the profile and affected math together, run regression/injection tests and an independent fresh-spec run, then one visible real export. Do not infer compatibility from unchanged MCP schema version alone.

Tests belong outside the shipped skills in the release's validation directory. They should challenge coordinate transforms, roll sign, stride/retiming, transitions, key reduction, source/identity binding, cold recovery and failure semantics. They are not production inputs. New operating systems/tool hosts need their own execution smoke test; the portable relay shares logic but host/browser APIs still differ.
