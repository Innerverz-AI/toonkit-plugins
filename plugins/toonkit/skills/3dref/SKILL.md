---
name: 3dref
description: Create or edit ToonKit 3D camera/action previz when explicitly requested or selected for a production stage. Uses live MCP features and visible browser Export; deterministic and credit-free.
metadata:
  short-description: Camera/action previz with efficient staging and export
---

# 3D reference previz

Deliver an editable ToonKit scene and its playable source-linked video. Preserve requested duration, FPS, actors and camera intent. A location sheet supplies spatial relationships: build only surfaces, silhouettes and obstacles needed by the shot, using simple proxies. Do not recreate panorama detail.

## Choose the smallest suitable route

- **Native MCP:** simple continuous presets, a few root/camera keys, existing-scene edits, other catalog geometry/animals or existing uploaded assets. Read [native execution](references/native.md). No Node/three/FBX setup for this route. The live catalog defines available ToonKit features; the compiler's limits do not disable them.
- **Compiled choreography:** multi-actor trajectories with measured contact, wall-as-floor roll, composed body motion or shared root/body slow motion. Read [production input](references/production-input.md) and [execution](references/execution.md). Read [source motion](references/body-motion.md) only for composed/retimed actions. Python/Node calculate the frames, binds and checks; do not handwrite dense arrays or replace a failed measured constraint with fabricated evidence.
- No AI catalogs, balance, quotes or generation SSOT for either deterministic route. Generation remains a separately authorized stage.

## Compiled route

1. Write one compact `3dref-production-v2` spec from the user's references. Plan actors/camera first, then shot-relevant proxies and real support faces. Actor count is bounded by live capacity, not fixed at two.
2. Compile in a fresh run directory. The package converts center/size to actual primitive pivots, bakes each distinct motion once, solves the wall-floor roll sign, culls irrelevant geometry, reduces keys and checks emitted interpolation. Fix concrete planning failures locally before writing. Default hold observations are advisory; explicit requested limits are enforced.
3. Use the packaged runtime or [portable relay](references/direct.md), both over the same bridge. Keep the exact editor visible. Apply all base keys before pose overlays; wait for accepted pending work before new revisions.
4. Compare exposed saved fields with the bundle. Check timing in the visible editor when safe readback omits it. Verify a fresh scene before Export. Never Save stale initial UI data over verified work.
5. Export through the visible editor. Record whether a click actually occurred; readiness failure with confirmed no click may resume. Uncertain clicks must be reconciled with existing output before another attempt. Confirm the new source edge, exact output node and decoded duration/dimensions.

## Scope and invariants

The compiler currently calibrates boxes, fresh unit-scale stock humans, one camera and the documented source motions. Other live MCP features use the native route with appropriately scoped checks; do not silently substitute the compiler's subset for the user's request. Existing compiled runs use their original matching runtime.

`engine-profile.json` records calibrated geometry/interpolation and maintenance evidence. Web JS filenames are not execution requirements: ordinary frontend rebuilds or lazy loading must not stop production. Live catalog/scene incompatibility or a changed source FBX needed for baking requires concrete inspection of that operation. Do not reverse-engineer the website on every request.

All compiled actor frames need real finite support, a declared transfer, or bounded intended flight. Root/body share a time map for slow motion; root height is applied once. Walls-as-floor require projected outward normal screen-up. Bone markers and stride comparisons are approximations, not skin/sole IK or artistic certification.

Scene/canvas edits use MCP; browser work is editor/navigation, readiness, Save/Export and resulting media. No hidden app stores/private endpoints or substitute renderer. Preserve existing user work. Do not lower FPS, shorten or split the shot, spend generation credits, or waive a failed measured constraint just to reach Export.

No prior project, local test log or conversation is required. Compiled runs retain `spec.json`, `compiled.json`, `journal.jsonl`; failed plans retain diagnostics. Load helpers once and emit summaries, not arrays. Native runs retain only the plan/receipts needed for recovery. Development tests run at release time, not on user requests.

Keep the result visible and group this run's source/output once. Return the canvas link, actual duration/dimensions, scene FPS and concise verified/unverified scope. Export success does not establish visual acceptance or R2V compatibility. No routine screenshot/contact-sheet or repeated playback loops.

For underspecified staging read [direction](references/direction.md); for a failed constraint or release maintenance read [verification](references/preflight.md). Read the [MCP contract](references/mcp-contract.md) for operations outside the compiler or changed connected declarations.
