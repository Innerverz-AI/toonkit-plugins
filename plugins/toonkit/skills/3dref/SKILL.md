---
name: 3dref
description: Create ToonKit 3D camera/action previz when explicitly requested or selected for a production stage. Supports one or multiple stock actors, calibrated proxy staging, source motion, timing and normal browser Export; deterministic and credit-free.
metadata:
  short-description: Multi-actor camera/action previz with calibrated staging
---

# 3D reference previz

Deliver an editable ToonKit scene and its playable source-linked video. Use simple geometry to preserve the shot's spatial relationships. A location panorama is context; construct only surfaces, silhouettes and obstacles that affect the camera or action. Do not recreate the artwork's detail.

## One path, any supported actor count

1. Read [production input](references/production-input.md) and the applicable [execution route](references/execution.md). Read [source motion](references/body-motion.md) only for composed/retimed actions. No AI catalogs, balance, quotes or generation SSOT for deterministic previz.
2. Write one `3dref-production-v2` spec from this user's references and direction. Declare actors, desired object sizes/centers, support states throughout every actor's timeline, camera targets/moves and framing beats. Do not write per-frame arrays or scene-specific adapter code.
3. Run the packaged compiler in a fresh run directory. It resolves actual primitive pivots, bakes each distinct motion once, solves any wall-floor roll sign, removes irrelevant geometry, reduces keys, simulates the renderer's interpolation and checks the resulting motion. A failed constraint is a planning failure to resolve locally; never waive it merely to reach Export.
4. Use the packaged runtime or [portable relay](references/direct.md). Both execute the same bridge for one or multiple actors, new or existing canvases. Keep the exact editor visible. All base keys precede pose overlays. On pending application, wait for the same mutation; on conflict/rejection, stop with the concrete evidence.
5. Compare the complete saved scene with the bundle. Confirm the editor shows the expected actors and frame count and has a clean Save state; stale initial editor state must be reopened from the saved scene before Export. Run one journaled UI Export. Correlate a new video by source edge and exact output node, then verify decoded duration/dimensions/error. The 3-second preview inside a 3D node is never an output.

## What the package owns

- No prior project, local test log, conversation or session-only function is a dependency. A passing run keeps only `spec.json`, `compiled.json`, `journal.jsonl`; failed planning preserves `diagnostic.json`. The journal contains bindings, requests, receipts and completion; cold recovery must use them.
- The model chooses creative intent and a compact specification. Python/Node own frame calculation, constraints, batching, ID binding, retries, readback and output identity. Load the launcher once into tool memory; emit summaries, not arrays or helper source.
- Current production support: calibrated boxes, fresh stock humans, one animated camera, pinned compatible FBX motion and the live MCP capacity. Actor count is capacity-bound, not fixed at two. Unsupported imports/geometry need a verified profile and compiler support, not an improvised bypass.
- The renderer contract ships in `scripts/engine-profile.json`, with public-source checksums. Confirm the loaded editor assets match it before scene writes. Changed assets stop production until the profile is revalidated. Do not reverse-engineer the app on every production request; profile maintenance is a release task.
- All actor frames need a real support face, a bounded explicitly intended flight, or a transfer with both named faces. A smooth curve is not evidence of contact. Walls-as-floor require the projected outward normal to point screen-up.
- Source poses and root travel share the requested time map. Bone markers have an explicit object-local coordinate convention; root height is applied once. Source-preserving gait can still slide if route speed and stride disagree; the package checks measured stride and reports any explicitly intended mismatch and does not claim physical foot-plant IK.

## Boundaries and completion

Scene/canvas edits use MCP only. Browser work is scoped to showing/opening the editor, readiness, Save/Export, and displaying the resulting media. No hidden application stores, private renderer/export endpoints or substitute renderer. No routine screenshot contact sheets, repeated playback loops or paid generation to fill a missing motion capability.

Do not silently lower FPS, shorten the shot, split a requested take or erase existing work to fit limits. Authorization to create previz does not authorize AI generation. Stop before new mutations if the compiled preflight, renderer profile, fresh-actor contract, revision or capacity no longer holds.

Numerical support uses finite faces and source bone markers; it is not a skin/sole IK or artistic-quality certificate. Distinguish calculated intent, saved fidelity, decoded output and human visual acceptance. Keep the result visible, group this run's source/output, and return the canvas link with actual duration/dimensions and scene FPS. Export success alone is not a quality pass.

For underspecified shot design, read [direction](references/direction.md). For failed constraints or release-profile maintenance, read [verification model](references/preflight.md). Read [MCP contract](references/mcp-contract.md) only for a changed connected contract.
