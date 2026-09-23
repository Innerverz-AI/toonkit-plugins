# MCP schema profile

Read only for maintenance or a changed connected contract. Use the compiled runtime for its supported choreography; other catalog operations use the native MCP route. This profile uses commandSchemaVersion=1 and templateVersion=1; the live catalog and connected tool declarations are authoritative. This is wire grammar, not a scene example or permission to overwrite user work.

## Connected tools

| Suffix | Fields / role |
|---|---|
| toonkit_create_canvas | name, aspectRatio, idempotencyKey; returns actual canvas ID/URL |
| toonkit_canvas_reference3d_catalog | Vocabulary, enums, limits, cursor/pageSize |
| toonkit_canvas_reference3d_create | canvasId, idempotencyKey, template (empty/human_camera), optional name/position |
| toonkit_canvas_reference3d_get_scene | canvasId, nodeId, view (saved/logical), optional objectIds, pageSize/cursor |
| toonkit_canvas_reference3d_edit | canvasId, nodeId, current expectedRevision, idempotencyKey, commands |
| toonkit_get_canvas | Saved canvas nodes/edges/media links; optional nodeIds |
| toonkit_get_canvas_mutation | Mutation status by mutationId, with blockedReason/blockedHint while no tab can apply it. Both packaged routes use signed logical scene barriers; this tool verifies final grouping |
| toonkit_canvas_reference3d_export | canvasId, idempotencyKey, nodeId, expectedRevision, kind (video/image), cameraObjectId for image; queues a render in the user's Canvas tab. Not used by this skill (see Capability routing) |
| toonkit_canvas_group_nodes | canvasId, idempotencyKey, title, nodeIds in workflow order; one group per completed user request, existing groups cannot be regrouped |

Create receipts contain template object IDs. Edit receipts contain minted clientRef IDs, mutationId, status, sequence and revisions. Persist each exact request before dispatch. Reuse its exact key, commands and revision after transport uncertainty. Wait for accepted mutations to materialize before a new revision-dependent write. Reject concurrent sequence changes; do not silently rebase.

Safe get_scene views can omit timing and private asset URLs. Omission is not zero or permission to write raw scene JSON. Inspect materialized, pendingCount, appliedThroughSeq, latestSeq, revision, initializationRequired, compatibility, conflict and pagination. Collect pages deliberately when needed.

## Nested grammar

- Transform input: position/rotation/scale are three-number arrays. Safe readback vectors are objects with x/y/z. object.add transform requires all three; transform patches may be partial. Scale must be positive.
- object.add: clientRef and kind plus its kind-specific field (shape, environment, species or existing mediaId), optional name/transform; human also takes an optional presetKey. Use unique clientRef, not invented object IDs or resolved URLs.
- Within one object-domain batch, a later operation may use clientRef instead of objectId; never both. Declaration precedes use. Subsequent batches use returned IDs.
- Destination: kind=base; or kind=keyframe plus integer frame.
- object.setTransform: objectId, destination, transform. object.setColor: objectId or same-batch clientRef, color as #RRGGBB.
- motion.applyPreset: objectId, presetKey, slot (animation/poseAsset), startFrame (required). One object-wide slot; repeated calls do not sequence clips. Animation takes precedence over poseAsset. Applying a preset does not clear manual pose corrections.
- pose.set / keyframe pose patches: joint IDs map to finite tiltX, tiltZ, twist values. These are bone-local additive corrections; use [body motion](body-motion.md), not anatomical guesses. The server also accepts per-joint position/rotation/scale; they move the scene to curve storage that this profile's readback does not model, so the packaged routes never send them.
- camera.set: objectId, destination, camera containing focalLength/near/far. camera.setAspect: objectId, aspect.
- camera.lookAt: objectId, destination, target with kind=point and position array. Writes an orientation at that destination, not a tracking constraint. For target.kind=object, obtain the full current nested schema before use.
- keyframe.upsert: objectId, integer frame, overwrite boolean, nonempty patch. Patch contains nonempty transform/pose/camera subpatches. New keys snapshot omitted evaluated fields. Existing-key overwrite needs scope and preservation of unrelated fields.
- scene.setTiming: durationSeconds, fps; set before keys. Leave allowKeyframeLoss false/omitted unless authorized truncation is intended.
- scene.initialize: template, isolated batch, missing-scene initialization only. Never reinitialize an existing/intentional empty scene.

## Capability routing

| Domain | Vocabulary |
|---|---|
| Object | add/remove/duplicate/rename/setVisible/setColor/reorder/setTransform |
| Source/model | pose.set, motion.applyPreset, motion.applyMedia, model.applyMedia |
| Camera | set, setAspect, lookAt |
| Keys | upsert, remove, move |
| Scene | initialize, setTiming |

Shapes: box/sphere/pyramid/cone/cylinder/donut/tube. Environments: wall/floor/stair. Characters: human, dog/cat animals. Uploaded models require an existing compatible media ID. Native human animations and static poses are selected from live catalog entries; human presets are not animal motion.

This profile does not expose a camera-cut track, new aRDY generation, clip mixing/trimming, IK, physics, retarget controls or snapshots. Applying existing motion media is not generating it. Source composition is local quaternion math followed by normal MCP keys. UI is used only for visible editor/navigation, necessary Save and Export. The server also offers `toonkit_canvas_reference3d_export`, but its instructions direct agents to the editor's Export control, which this skill follows; never use both routes for one export ticket. Do not invent undocumented operations or private export endpoints.

## Capacity and errors

Profile ceilings: 50 commands/batch, 65,536 command bytes, 524,288 scene bytes, 200 objects, 2,000 keys, 2–30 s, FPS 12/15/24/30/60, lens 14–135 mm, up to 200 objects/page and 50 object-ID filters. Refresh live limits. Budget full stored key snapshots, not just outgoing patch bytes. The compiler uses a conservative fresh-scene size estimate.

PENDING means admitted, not applied: wait, do not resubmit. APPLIED still needs saved data verification. Version conflict or logical dependency conflict stops automatic dispatch. INVALID_COMMAND requires inspection of commandIndex, grammar, domain and mutated status; do not blindly retry a rejected write. Authentication/scope errors require the specific connection action, never a paid-operation workaround.

Normal production uses the packaged runtime from [execution](execution.md), where full payloads stay in tool memory, or the step helper from [direct execution](direct.md). Standalone export is verified by a newly materialized source-linked video plus matching decoded DOM metadata; it does not require get_media or certify R2V compatibility.
